// controller/docAppointmentController.js
const mongoose = require("mongoose");
const DocAppointment = require("../models/DoctorAppointmentModel");
const DoctorAvailability = require("../models/DoctorAvailabilityModel");
const PatientAppointmentActivity = require("../models/PatientAppointmentActivityModel");
const DoctorAppointmentActivity = require("../models/DoctorAppointmentActivityModel");
const DoctorNotificationModel = require("../models/DoctorNotificationModel");
const PatientNotificationModel = require("../models/PatientNotificationModel");
const Doctor = require("../models/DoctorModel");
const Patient = require("../models/PatientModel");
const { updateVisibilityAfterCancellation, updateVisibilityAfterRebook } = require("../services/patientVisibilityService");
const { getOrCreateTranslation, invalidateTranslation } = require('../services/translationService');
const { getPatientLanguage } = require('../utils/getPatientLanguage');

// Fields on an appointment that contain doctor-written natural language.
const APPT_TRANSLATABLE_FIELDS = ['reason_for_visit', 'diagnosis', 'cancellation_reason', 'notes'];

/**
 * Translate appointment-level text fields for the given patient.
 * appt must already be a plain object (post-transform).
 */
async function translateAppointment(appt, patientId) {
  const lang = await getPatientLanguage(patientId);
  if (lang !== 'ur') return appt;

  const fieldsToTranslate = {};
  for (const key of APPT_TRANSLATABLE_FIELDS) {
    if (typeof appt[key] === 'string' && appt[key].trim().length > 0) {
      fieldsToTranslate[key] = appt[key];
    }
  }
  if (Object.keys(fieldsToTranslate).length === 0) return appt;

  const translated = await getOrCreateTranslation(
    'Doctor_appointment',
    appt._id || appt.id,
    fieldsToTranslate,
    lang
  );

  return { ...appt, ...translated };
}

// Helper function to convert 24-hour time (HH:MM) to 12-hour format (H:MM AM/PM)
const convertTo12HourFormat = (time24) => {
  if (!time24) return null;
  const [hours, minutes] = time24.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) return null;
  
  const period = hours >= 12 ? 'PM' : 'AM';
  let displayHours = hours % 12;
  if (displayHours === 0) displayHours = 12;
  
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
};

// Helper function to book a time slot in availability
const bookTimeSlotInAvailability = async (doctorId, date, time, appointmentId) => {
  try {
    console.log(`   🔍 Looking for availability: doctorId=${doctorId}, date=${date}, time=${time}`);
    const availability = await DoctorAvailability.findOne({ doctorId: doctorId.toString(), date });
    
    if (!availability) {
      console.error(`   ❌ No availability found for doctor ${doctorId} on ${date}`);
      return false;
    }

    console.log(`   ✅ Found availability with ${availability.timeSlots?.length || 0} slots`);
    console.log(`   📋 Available slots: ${availability.timeSlots?.map(s => `${s.time}(${s.status})`).join(', ') || 'none'}`);

    // Convert time to 12-hour format if needed
    let time12Hour = time;
    if (time.includes(':') && !time.includes('AM') && !time.includes('PM')) {
      console.log(`   🔄 Converting time from 24-hour format: ${time}`);
      time12Hour = convertTo12HourFormat(time);
      if (!time12Hour) {
        console.error(`   ❌ Could not convert time format: ${time}`);
        return false;
      }
      console.log(`   ✅ Converted to 12-hour format: ${time12Hour}`);
    }

    // Find the slot - try both formats if needed
    let slot = availability.timeSlots.find(s => s.time === time12Hour);
    if (!slot) {
      // Try finding with original time format
      slot = availability.timeSlots.find(s => s.time === time);
      if (!slot) {
        console.error(`   ❌ Time slot "${time12Hour}" (or "${time}") not found in availability`);
        console.error(`   📋 Available slot times: ${availability.timeSlots?.map(s => s.time).join(', ') || 'none'}`);
        return false;
      }
      time12Hour = slot.time; // Use the actual slot time format
    }

    console.log(`   ✅ Found slot: ${slot.time}, current status: ${slot.status}`);

    if (slot.status === "booked" && slot.appointmentId !== appointmentId.toString()) {
      console.error(`   ❌ Time slot ${time12Hour} is already booked by appointment ${slot.appointmentId}`);
      return false;
    }

    // Book the slot
    slot.status = "booked";
    slot.appointmentId = appointmentId.toString();

    // Mark the timeSlots array as modified for Mongoose
    availability.markModified('timeSlots');

    // Update counts
    const bookedCount = availability.timeSlots.filter(s => s.status === "booked").length;
    const previousBooked = availability.bookedSlots;
    availability.bookedSlots = bookedCount.toString();
    availability.availableSlots = (parseInt(availability.totalSlots) - bookedCount).toString();
    availability.updatedAt = new Date();

    console.log(`   📊 Updating counts: bookedSlots ${previousBooked} -> ${availability.bookedSlots}, availableSlots -> ${availability.availableSlots}`);

    try {
      const savedAvailability = await availability.save();
      if (savedAvailability) {
        console.log(`   ✅ Successfully booked time slot ${time12Hour} for appointment ${appointmentId}`);
        console.log(`   ✅ Availability saved: bookedSlots=${savedAvailability.bookedSlots}, availableSlots=${savedAvailability.availableSlots}`);
        return true;
      } else {
        console.error(`   ❌ Failed to save availability - save returned null/undefined`);
        return false;
      }
    } catch (saveError) {
      console.error(`   ❌ Error saving availability:`, saveError);
      console.error(`   Save error stack:`, saveError.stack);
      return false;
    }
  } catch (error) {
    console.error(`   ❌ Error booking time slot:`, error);
    console.error(`   Error stack:`, error.stack);
    return false;
  }
};

// Helper function to free a time slot in availability
const freeTimeSlotInAvailability = async (doctorId, date, time, appointmentId) => {
  try {
    const availability = await DoctorAvailability.findOne({ doctorId: doctorId.toString(), date });
    
    if (!availability) {
      return false;
    }

    // Convert time to 12-hour format if needed
    let time12Hour = time;
    if (time.includes(':') && !time.includes('AM') && !time.includes('PM')) {
      time12Hour = convertTo12HourFormat(time);
      if (!time12Hour) {
        return false;
      }
    }

    // Find the slot
    const slot = availability.timeSlots.find(s => s.time === time12Hour);
    if (!slot) {
      return false;
    }

    // Only free if it's booked by this appointment
    if (slot.status === "booked" && slot.appointmentId === appointmentId.toString()) {
      slot.status = "available";
      slot.appointmentId = null;

      // Update counts
      const bookedCount = availability.timeSlots.filter(s => s.status === "booked").length;
      availability.bookedSlots = bookedCount.toString();
      availability.availableSlots = (parseInt(availability.totalSlots) - bookedCount).toString();
      availability.updatedAt = new Date();

      await availability.save();
      console.log(`   ✅ Freed time slot ${time12Hour} for appointment ${appointmentId}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`   ⚠️ Error freeing time slot:`, error);
    return false;
  }
};

// Helper function to log patient appointment activity
const logPatientAppointmentActivity = async (data) => {
  try {
    const {
      patientId,
      appointmentId,
      doctorId,
      action,
      appointmentDate,
      appointmentTime,
      consultationType,
      previousDate,
      previousTime,
      notes
    } = data;

    console.log(`   📝 Creating Patient_AppointmentActivity log: patientId=${patientId}, appointmentId=${appointmentId}, action=${action}`);
    
    const activity = await PatientAppointmentActivity.create({
      patientId: patientId?.toString(),
      appointmentId: appointmentId?.toString(),
      doctorId: doctorId?.toString(),
      action,
      appointmentDate,
      appointmentTime,
      consultationType,
      previousDate,
      previousTime,
      notes
    });

    console.log(`   ✅ Logged patient appointment activity: ${action} for appointment ${appointmentId}, activityId=${activity._id}`);
    return activity;
  } catch (error) {
    console.error("   ❌ Error logging patient appointment activity:", error);
    console.error("   Error stack:", error.stack);
    // Don't throw error - logging should not break the main flow
    return null;
  }
};

// Helper function to log doctor appointment activity
const logDoctorAppointmentActivity = async (data) => {
  try {
    const {
      doctorId,
      date,
      totalSlots,
      bookedSlots,
      availableSlots,
      action,
      notes
    } = data;

    await DoctorAppointmentActivity.create({
      doctorId: doctorId?.toString(),
      date,
      totalSlots: totalSlots?.toString() || "0",
      bookedSlots: bookedSlots?.toString() || "0",
      availableSlots: availableSlots?.toString() || "0",
      action,
      notes
    });

    console.log(`✅ Logged doctor appointment activity: ${action} for doctor ${doctorId}`);
  } catch (error) {
    console.error("❌ Error logging doctor appointment activity:", error);
    // Don't throw error - logging should not break the main flow
  }
};

// Helper function to transform appointment to match frontend expectations
const transformAppointment = async (appt) => {
  const appointment = appt.toObject ? appt.toObject() : appt;
  
  // Extract patient info from populated patientId
  let patientInfo = null;
  // Check if patientId is populated (object with _id) or just an ObjectId
  if (appointment.patientId) {
    if (typeof appointment.patientId === 'object' && appointment.patientId._id) {
      // Patient is populated
      const patient = appointment.patientId;
      const firstName = patient.firstName || '';
      const lastName = patient.lastName || '';
      const fullName = `${firstName} ${lastName}`.trim();
      
      patientInfo = {
        _id: patient._id.toString(),
        firstName: firstName,
        lastName: lastName,
        name: fullName || 'Unknown Patient',
        age: patient.Age || 0,
        gender: patient.gender || '',
        phone: patient.phone || '',
        emailAddress: patient.emailAddress || ''
      };
    } else {
      // Patient not populated - log warning for debugging
      console.warn('⚠️ Patient not populated for appointment:', appointment._id, 'patientId:', appointment.patientId);
    }
  }
  
  // Extract doctor info from populated doctorId
  let doctorInfo = null;
  if (appointment.doctorId) {
    if (typeof appointment.doctorId === 'object' && appointment.doctorId._id) {
      // Doctor is populated
      const doctor = appointment.doctorId;
      doctorInfo = {
        _id: doctor._id.toString(),
        DoctorName: doctor.DoctorName || doctor.name || 'Dr. Unknown',
        specialization: doctor.specialization || '',
        email: doctor.email || ''
      };
    }
  }
  
  // Extract date and time from appointmentDate
  let appointment_date = null;
  let appointment_time = null;
  if (appointment.appointmentDate) {
    const date = new Date(appointment.appointmentDate);
    appointment_date = date.toISOString().split('T')[0]; // YYYY-MM-DD
    appointment_time = date.toTimeString().split(' ')[0].substring(0, 5); // HH:MM
  }
  
  // Fetch noShowStatus from call record
  let noShowStatus = null;
  try {
    const DocPatientCallModel = require('../models/DocPatientCallModel');
    const call = await DocPatientCallModel.findOne({ 
      appointmentId: appointment._id.toString() 
    });
    if (call && call.noShowStatus) {
      noShowStatus = call.noShowStatus;
    }
  } catch (error) {
    // Silently fail - noShowStatus is optional
    console.warn('Could not fetch noShowStatus for appointment:', appointment._id);
  }
  
  // Transform to match frontend interface
  return {
    _id: appointment._id.toString(),
    appointmentId: appointment._id.toString(),
    doctorId: doctorInfo ? doctorInfo : (appointment.doctorId?.toString() || appointment.doctorId),
    patientId: appointment.patientId?._id?.toString() || appointment.patientId?.toString() || appointment.patientId,
    appointment_date: appointment_date || appointment.appointment_date,
    appointment_time: appointment_time || appointment.appointment_time,
    booking_timestamp: appointment.createdAt || appointment.booking_timestamp,
    status: appointment.status || 'upcoming',
    consultation_type: appointment.type || appointment.consultation_type || 'In-Person',
    reason_for_visit: appointment.reason || appointment.reason_for_visit || '',
    symptoms: appointment.symptoms || '',
    diagnosis: appointment.diagnosis || '',
    medications: appointment.medications || '',
    prescription_details: appointment.prescription_details || '',
    duration_minutes: appointment.duration_minutes,
    cancellation_reason: appointment.cancellation_reason || '',
    notes: appointment.notes || '',
    last_updated: appointment.updatedAt || appointment.last_updated,
    patientInfo: patientInfo,
    noShowStatus: noShowStatus,
    reviewRequested: !!appointment.reviewRequested,
    reviewSubmitted: !!appointment.reviewSubmitted,
    reviewNotifiedAt: appointment.reviewNotifiedAt || null,
    endTime: appointment.endTime || null,
  };
};

const createAppointment = async (req, res) => {
  try {
    const { doctorId, patientId, appointmentDate, appointment_date, appointment_time, type, reason, notes, location } = req.body;

    if (!doctorId || !patientId || (!appointmentDate && !appointment_date)) {
      return res.status(400).json({ message: "doctorId, patientId and appointmentDate are required" });
    }

    // Handle both appointmentDate (Date object) and appointment_date/appointment_time formats
    let finalAppointmentDate = appointmentDate;
    let appointmentTime = appointment_time;
    
    if (appointment_date && appointment_time) {
      finalAppointmentDate = new Date(`${appointment_date}T${appointment_time}`);
    } else if (appointment_date) {
      finalAppointmentDate = new Date(appointment_date);
    }

    // Start transaction for atomic appointment creation and visibility update
    const session = await mongoose.startSession();
    session.startTransaction();
    
    const isInPerson = (type || '').toLowerCase().replace(/\s/g, '') === 'in-person';
    const endTime = isInPerson
      ? new Date(finalAppointmentDate.getTime() + 30 * 60 * 1000)
      : null;

    let appt;
    try {
      const createPayload = {
        doctorId: new mongoose.Types.ObjectId(doctorId),
        patientId: new mongoose.Types.ObjectId(patientId),
        appointmentDate: finalAppointmentDate,
        type,
        reason,
        notes,
        location,
      };
      if (endTime) createPayload.endTime = endTime;
      const createdAppts = await DocAppointment.create([createPayload], { session });
      
      appt = createdAppts[0];

      // Update patient visibility (restore if removed, update lastVisibleDate)
      try {
        await updateVisibilityAfterRebook(
          doctorId,
          patientId,
          appt._id,
          session
        );
      } catch (visibilityError) {
        console.error('⚠️ Error updating visibility after appointment creation:', visibilityError);
        // Don't fail the appointment creation if visibility update fails
      }

      // Commit transaction
      await session.commitTransaction();
      console.log(`   ✅ Transaction committed: appointment creation and visibility update completed`);
    } catch (transactionError) {
      // Rollback transaction on error
      await session.abortTransaction();
      console.error(`   ❌ Transaction aborted due to error:`, transactionError);
      throw transactionError;
    } finally {
      session.endSession();
    }

    // Prepare date and time strings
    const dateStr = new Date(finalAppointmentDate).toISOString().split('T')[0];
    const appointmentTimeStr = appointmentTime || new Date(finalAppointmentDate).toTimeString().split(' ')[0].substring(0, 5);
    
    // Book the time slot in availability
    let availability = null;
    if (finalAppointmentDate) {
      const timeStr = appointmentTimeStr;
      console.log(`📅 Booking appointment: doctorId=${doctorId}, date=${dateStr}, time=${timeStr}, appointmentId=${appt._id}`);
      
      const bookingResult = await bookTimeSlotInAvailability(doctorId, dateStr, timeStr, appt._id.toString());
      if (!bookingResult) {
        console.error(`⚠️ Failed to book time slot for appointment ${appt._id}`);
      }
      
      // Get updated availability for logging
      try {
        availability = await DoctorAvailability.findOne({ doctorId: doctorId.toString(), date: dateStr });
        if (availability) {
          console.log(`✅ Availability updated: totalSlots=${availability.totalSlots}, bookedSlots=${availability.bookedSlots}, availableSlots=${availability.availableSlots}`);
        } else {
          console.log(`⚠️ Availability not found after booking for date ${dateStr}`);
        }
      } catch (error) {
        console.error("Error fetching availability after booking:", error);
      }
    }

    // Get patient and doctor info for notifications
    let patientInfo = null;
    let doctorInfo = null;
    try {
      patientInfo = await Patient.findById(patientId);
      doctorInfo = await Doctor.findById(doctorId);
      console.log(`✅ Fetched patient and doctor info: patient=${patientInfo?.firstName || 'N/A'}, doctor=${doctorInfo?.DoctorName || 'N/A'}`);
    } catch (error) {
      console.error("❌ Error fetching patient/doctor info:", error);
    }

    const patientName = patientInfo 
      ? `${patientInfo.firstName || ''} ${patientInfo.lastName || ''}`.trim() || 'Patient'
      : 'Patient';
    
    // Format doctor name to ensure it has "Dr." prefix
    const formatDoctorName = (name) => {
      if (!name) return 'Dr. Unknown';
      const cleanName = String(name).trim();
      // Remove existing "Dr." or "Dr" prefix if present
      const nameWithoutPrefix = cleanName.replace(/^Dr\.?\s*/i, '');
      // Add "Dr." prefix
      return `Dr. ${nameWithoutPrefix}`;
    };
    
    const rawDoctorName = doctorInfo?.DoctorName || doctorInfo?.name || 'Unknown';
    const doctorName = formatDoctorName(rawDoctorName);

    // Format appointment date and time for notifications
    const appointmentDateObj = new Date(finalAppointmentDate);
    const formattedDate = appointmentDateObj.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    const formattedTime = appointmentDateObj.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });

    // ============================================
    // CREATE NOTIFICATIONS FOR BOTH DOCTOR AND PATIENT
    // ============================================
    // When a patient books an appointment, create notifications in:
    // 1. Doctor_Notifications - to notify the doctor
    // 2. Patient_Notifications - to notify the patient
    // ============================================

    // Create Doctor notification in Doctor_Notifications collection
    try {
      console.log(`📬 Creating doctor notification for appointment ${appt._id}`);
      console.log(`   Doctor ID: ${doctorId}, Patient: ${patientName}`);
      
      // Check if notification already exists to avoid duplicates
      const notificationExists = await DoctorNotificationModel.notificationExistsForAppointment(
        doctorId,
        appt._id.toString(),
        'appointment_booked'
      );

      if (!notificationExists) {
        const notificationResult = await DoctorNotificationModel.createNotification({
          doctorId: doctorId,
          type: 'appointment_booked',
          title: 'New Appointment Booked',
          description: `${patientName} has booked an appointment for ${formattedDate} at ${formattedTime}.`,
          icon: 'calendar',
          appointmentId: appt._id.toString(),
          patientName: patientName,
          timestamp: new Date()
        });
        console.log(`✅ Created doctor notification in Doctor_Notifications: ${notificationResult.insertedId}`);
      } else {
        console.log(`⚠️ Doctor notification already exists for appointment ${appt._id}`);
      }
    } catch (error) {
      console.error("❌ Error creating doctor notification:", error);
      console.error("Error stack:", error.stack);
      // Don't throw - continue with appointment creation
    }

    // Create Patient notification in Patient_Notifications collection
    try {
      // Use the patientId from the created appointment to ensure consistency
      // appt.patientId is the ObjectId that was stored in the database
      const appointmentPatientId = appt.patientId ? appt.patientId.toString() : patientId.toString();
      
      console.log(`📬 Creating patient notification for appointment ${appt._id}`);
      console.log(`   Request Patient ID: ${patientId}, Type: ${typeof patientId}`);
      console.log(`   Appointment Patient ID: ${appointmentPatientId} (from appt.patientId)`);
      console.log(`   Appointment ID: ${appt._id}, Type: ${typeof appt._id}`);
      console.log(`   Doctor: ${doctorName}`);
      
      // Check if notification already exists to avoid duplicates
      const patientNotificationExists = await PatientNotificationModel.notificationExistsForAppointment(
        appointmentPatientId,
        appt._id.toString(),
        'appointment_booked'
      );

      if (!patientNotificationExists) {
        console.log(`   Creating new patient notification in Patient_Notifications...`);
        console.log(`   📝 Using patientId: ${appointmentPatientId} (from appointment document)`);
        
        const patientNotificationResult = await PatientNotificationModel.createNotification({
          patientId: appointmentPatientId,
          type: 'appointment_booked',
          title: 'Appointment Booked',
          description: `Your appointment with ${doctorName} has been booked for ${formattedDate} at ${formattedTime}.`,
          icon: 'calendar',
          appointmentId: appt._id.toString(),
          doctorName: doctorName,
          timestamp: new Date()
        });
        
        console.log(`✅ Created patient notification in Patient_Notifications successfully!`);
        console.log(`   Notification ID: ${patientNotificationResult.insertedId}`);
        console.log(`   Patient ID used: ${appointmentPatientId}`);
        console.log(`   Appointment ID: ${appt._id}`);
        console.log(`   Stored in collection: Patient_Notifications`);
        
        // Verify the notification was created with correct patientId
        try {
          const createdNotif = await PatientNotificationModel.getNotificationById(patientNotificationResult.insertedId);
          if (createdNotif) {
            const storedPatientId = createdNotif.patientId?.toString ? createdNotif.patientId.toString() : createdNotif.patientId;
            console.log(`   ✅ Verification: Notification stored with patientId: ${storedPatientId}`);
            console.log(`   ✅ Verification: Matches appointment patientId: ${storedPatientId === appointmentPatientId}`);
          }
        } catch (verifyError) {
          console.log(`   ⚠️ Could not verify notification: ${verifyError.message}`);
        }
      } else {
        console.log(`⚠️ Patient notification already exists for appointment ${appt._id}`);
      }
    } catch (error) {
      console.error("❌ Error creating patient notification:", error);
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
      // Don't throw - continue with appointment creation
    }

    // Log patient appointment activity (booked)
    try {
      console.log(`📝 Logging patient appointment activity for appointment ${appt._id}`);
      await logPatientAppointmentActivity({
        patientId: patientId,
        appointmentId: appt._id,
        doctorId: doctorId,
        action: 'booked',
        appointmentDate: finalAppointmentDate,
        appointmentTime: appointmentTimeStr,
        consultationType: type,
        notes: notes || reason
      });
    } catch (error) {
      console.error("❌ Error logging patient appointment activity:", error);
      console.error("Error stack:", error.stack);
    }

    // Log doctor appointment activity (booked)
    try {
      if (availability) {
        console.log(`📝 Logging doctor appointment activity for appointment ${appt._id}`);
        await logDoctorAppointmentActivity({
          doctorId: doctorId,
          date: dateStr,
          totalSlots: availability.totalSlots || "0",
          bookedSlots: availability.bookedSlots || "0",
          availableSlots: availability.availableSlots || "0",
          action: 'booked',
          notes: `Appointment ${appt._id} booked by ${patientName} for ${formattedDate} at ${formattedTime}`
        });
      } else {
        console.log(`⚠️ Cannot log doctor appointment activity - availability not found`);
      }
    } catch (error) {
      console.error("❌ Error logging doctor appointment activity:", error);
      console.error("Error stack:", error.stack);
    }

    res.status(201).json(appt);
  } catch (err) {
    console.error("❌ createAppointment ERROR:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Helper function to parse appointment time string to datetime
const parseAppointmentDateTime = (appointment_date, appointment_time, appointmentDate) => {
  // If we have appointmentDate (Date object), use it directly
  if (appointmentDate) {
    return new Date(appointmentDate);
  }
  
  // If we have both date and time strings, combine them
  if (appointment_date && appointment_time) {
    let timeStr = appointment_time.trim();
    
    // Handle dot format (08.30 AM -> 08:30 AM)
    timeStr = timeStr.replace(/\./g, ':');
    
    // Try to parse as 12-hour format first
    const match12Hour = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (match12Hour) {
      let hours = parseInt(match12Hour[1], 10);
      const minutes = parseInt(match12Hour[2], 10);
      const amPm = match12Hour[3].toUpperCase();
      
      if (amPm === 'PM' && hours !== 12) hours += 12;
      if (amPm === 'AM' && hours === 12) hours = 0;
      
      const dateTimeStr = `${appointment_date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
      return new Date(dateTimeStr);
    }
    
    // Try to parse as 24-hour format (HH:MM)
    const match24Hour = timeStr.match(/(\d{1,2}):(\d{2})/);
    if (match24Hour) {
      const hours = parseInt(match24Hour[1], 10);
      const minutes = parseInt(match24Hour[2], 10);
      const dateTimeStr = `${appointment_date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
      return new Date(dateTimeStr);
    }
  }
  
  // If only date is available, use start of day
  if (appointment_date) {
    return new Date(appointment_date + 'T00:00:00');
  }
  
  return null;
};

// Helper function to check and notify about missed appointments
const checkAndNotifyMissedAppointments = async (appointments) => {
  try {
    const now = new Date();
    
    // Find missed appointments (status: 'upcoming', datetime < now)
    const missedAppointments = appointments.filter(apt => {
      if (apt.status?.toLowerCase() !== 'upcoming') return false;
      
      const appointmentDateTime = parseAppointmentDateTime(
        apt.appointment_date,
        apt.appointment_time,
        apt.appointmentDate
      );
      
      if (!appointmentDateTime) return false;
      
      // Appointment is missed if current datetime is strictly greater than appointment datetime
      return now > appointmentDateTime;
    });
    
    if (missedAppointments.length === 0) {
      return;
    }
    
    console.log(`🔔 Found ${missedAppointments.length} missed appointment(s) to notify`);
    
    // Notify each patient and doctor about their missed appointment
    for (const appointment of missedAppointments) {
      try {
        const patientId = appointment.patientId?._id || appointment.patientId;
        const doctorId = appointment.doctorId?._id || appointment.doctorId;
        const appointmentId = appointment._id?.toString() || appointment._id;
        
        // Format appointment date and time (used for both notifications)
        const appointmentDate = appointment.appointment_date ? new Date(appointment.appointment_date) : 
                               appointment.appointmentDate ? new Date(appointment.appointmentDate) : new Date();
        const formattedDate = appointmentDate.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        
        // Get appointment time if available
        let formattedTime = '';
        if (appointment.appointment_time) {
          try {
            const timeStr = appointment.appointment_time;
            if (timeStr.includes('AM') || timeStr.includes('PM')) {
              formattedTime = timeStr;
            } else {
              // Convert 24-hour to 12-hour
              const [hours, minutes] = timeStr.split(':').map(Number);
              const period = hours >= 12 ? 'PM' : 'AM';
              const displayHours = hours % 12 || 12;
              formattedTime = `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
            }
          } catch (e) {
            formattedTime = appointment.appointment_time;
          }
        }
        
        const timeText = formattedTime ? ` at ${formattedTime}` : '';
        
        // Notify patient
        if (patientId) {
          try {
            // Check if patient notification already exists
            const patientNotificationExists = await PatientNotificationModel.notificationExistsForAppointment(
              patientId.toString(),
              appointmentId,
              'appointment_missed'
            );
            
            if (!patientNotificationExists) {
              // Get doctor name
              const doctorName = appointment.doctorId?.DoctorName || 
                                (appointment.doctorId?.DoctorName ? appointment.doctorId.DoctorName : 'Doctor');
              
              // Create patient notification
              await PatientNotificationModel.createNotification({
                patientId: patientId.toString(),
                type: 'appointment_missed',
                title: 'Missed Appointment',
                description: `You missed your appointment with ${doctorName} scheduled for ${formattedDate}${timeText}. Please contact the clinic to reschedule.`,
                icon: 'alert-circle',
                appointmentId: appointmentId,
                doctorName: doctorName,
                timestamp: new Date()
              });
              
              console.log(`✅ Created missed appointment notification for patient ${patientId} (appointment ${appointmentId})`);
            }
          } catch (error) {
            console.error(`❌ Error creating patient notification for appointment ${appointmentId}:`, error.message);
          }
        }
        
        // Notify doctor
        if (doctorId) {
          try {
            // Check if doctor notification already exists
            const doctorNotificationExists = await DoctorNotificationModel.notificationExistsForAppointment(
              doctorId.toString(),
              appointmentId,
              'appointment_missed'
            );
            
            if (!doctorNotificationExists) {
              // Get patient name
              const patientName = appointment.patientInfo?.name || 
                                 (appointment.patientInfo?.firstName && appointment.patientInfo?.lastName
                                   ? `${appointment.patientInfo.firstName} ${appointment.patientInfo.lastName}`.trim()
                                   : appointment.patientId?.firstName && appointment.patientId?.lastName
                                   ? `${appointment.patientId.firstName} ${appointment.patientId.lastName}`.trim()
                                   : 'Patient');
              
              // Create doctor notification
              await DoctorNotificationModel.createNotification({
                doctorId: doctorId.toString(),
                type: 'appointment_missed',
                title: 'Missed Appointment',
                description: `Patient ${patientName} missed their appointment scheduled for ${formattedDate}${timeText}.`,
                icon: 'alert-circle',
                appointmentId: appointmentId,
                patientName: patientName,
                timestamp: new Date()
              });
              
              console.log(`✅ Created missed appointment notification for doctor ${doctorId} (appointment ${appointmentId})`);
            }
          } catch (error) {
            console.error(`❌ Error creating doctor notification for appointment ${appointmentId}:`, error.message);
          }
        }
      } catch (error) {
        console.error(`❌ Error processing missed appointment ${appointment._id}:`, error.message);
      }
    }
  } catch (error) {
    console.error('❌ Error in checkAndNotifyMissedAppointments:', error);
    // Don't throw - this is a background process
  }
};

const getAppointmentsByDoctor = async (req, res) => {
  try {
    const doctorId = new mongoose.Types.ObjectId(req.doctor.doctorId);
    const { status } = req.query;

    const filter = { doctorId };
    if (status) {
      // If status filter is provided, apply it
      // But if status is 'upcoming', we MUST exclude cancelled
      if (status.toLowerCase() === 'upcoming') {
        filter.status = { $in: ['upcoming', 'pending_reschedule'], $nin: ['cancelled', 'canceled', 'doctor_cancelled', 'patient_cancelled', 'removed'] };
      } else {
        filter.status = status.toLowerCase();
      }
    }

    const appts = await DocAppointment.find(filter)
      .populate("patientId", "firstName lastName Age gender phone emailAddress")
      .populate("doctorId", "DoctorName")
      .sort({ appointmentDate: 1 });

    if (!appts.length) {
      return res.json({ success: true, message: "No appointments found for this doctor", count: 0, appointments: [] });
    }

    // Check for missed appointments and notify patients (async, non-blocking)
    checkAndNotifyMissedAppointments(appts).catch(err => 
      console.error('Background missed appointment check failed:', err)
    );

    // Transform appointments to match frontend expectations
    const transformedAppointments = await Promise.all(appts.map(transformAppointment));
    
    // Debug logging
    const now = new Date();
    const futureActive = transformedAppointments.filter(a => {
      const aptDate = new Date(a.appointment_date || a.appointmentDate);
      return aptDate > now && !['cancelled', 'canceled', 'doctor_cancelled', 'patient_cancelled', 'removed'].includes(a.status?.toLowerCase());
    }).length;
    const futureCancelled = transformedAppointments.filter(a => {
      const aptDate = new Date(a.appointment_date || a.appointmentDate);
      return aptDate > now && ['cancelled', 'canceled', 'doctor_cancelled', 'patient_cancelled', 'removed'].includes(a.status?.toLowerCase());
    }).length;
    
    console.log(`📊 [APPT_FILTER_BACKEND] getAppointmentsByDoctor:`);
    console.log(`   Total: ${transformedAppointments.length}, Future Active: ${futureActive}, Future Cancelled: ${futureCancelled}`);
    console.log(`   Status filter: ${status || 'none'}`);
    
    if (transformedAppointments.length > 0) {
      const firstAppt = transformedAppointments[0];
      console.log('   Sample appointment:', {
        hasPatientInfo: !!firstAppt.patientInfo,
        patientName: firstAppt.patientInfo?.name || 'N/A',
        appointment_date: firstAppt.appointment_date,
        status: firstAppt.status,
        consultation_type: firstAppt.consultation_type
      });
    }

    res.json({ success: true, message: "Appointments fetched", count: transformedAppointments.length, appointments: transformedAppointments });
  } catch (err) {
    console.error("❌ getAppointmentsByDoctor ERROR:", err);
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

const getAppointmentById = async (req, res) => {
  try {
    const appt = await DocAppointment.findById(req.params.id)
      .populate("patientId", "firstName lastName Age gender phone emailAddress")
      .populate("doctorId", "DoctorName email specialization");

    if (!appt) return res.status(404).json({ message: "Appointment not found" });

    // Transform appointment to match frontend expectations
    let transformedAppointment = await transformAppointment(appt);

    // Translate for patient's preferred language
    const patientId = transformedAppointment.patientInfo?._id || appt.patientId?.toString?.();
    transformedAppointment = await translateAppointment(transformedAppointment, patientId);

    res.json({ success: true, appointment: transformedAppointment });
  } catch (err) {
    console.error("❌ getAppointmentById ERROR:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

const updateAppointmentStatus = async (req, res) => {
  try {
    const { status, appointmentDate, appointment_date, appointment_time, notes, cancellation_reason } = req.body;
    const { id } = req.params;

    console.log(`\n📝 Updating appointment ${id} with:`, { status, cancellation_reason, notes });

    // Fetch appointment and ensure all required fields are loaded
    const appt = await DocAppointment.findById(id);
    if (!appt) {
      console.log(`❌ Appointment ${id} not found`);
      return res.status(404).json({ success: false, message: "Appointment not found" });
    }

    // Log existing appointment data
    console.log(`   Existing appointment data:`, {
      status: appt.status,
      appointmentDate: appt.appointmentDate,
      hasAppointmentDate: !!appt.appointmentDate,
      appointmentDateType: typeof appt.appointmentDate
    });

    // Ensure appointmentDate exists - if it's missing, this is a data integrity issue
    if (!appt.appointmentDate) {
      console.error(`   ⚠️ CRITICAL: Appointment ${id} has no appointmentDate in database!`);
      // Try to get it from a fresh query
      const freshAppt = await DocAppointment.findById(id).select('appointmentDate');
      if (freshAppt && freshAppt.appointmentDate) {
        appt.appointmentDate = freshAppt.appointmentDate;
        console.log(`   ✅ Restored appointmentDate from fresh query: ${freshAppt.appointmentDate}`);
      } else {
        // This should never happen, but if it does, we need to handle it
        console.error(`   ⚠️ No appointmentDate found even in fresh query - using current date as emergency fallback`);
        appt.appointmentDate = new Date();
      }
    }

    // Store old status before updating (for activity logging)
    const oldStatus = appt.status?.toLowerCase() || 'unknown';
    
    // Update status if provided
    if (status) {
      const newStatus = status.toLowerCase();
      console.log(`   Updating status: ${oldStatus} -> ${newStatus}`);
      appt.status = newStatus;
    }

    // Update cancellation reason if provided
    if (cancellation_reason !== undefined) {
      console.log(`   Setting cancellation_reason: ${cancellation_reason}`);
      appt.cancellation_reason = cancellation_reason;
    }
    
    // Store original appointment date for reschedule detection
    const originalAppointmentDate = appt.appointmentDate ? new Date(appt.appointmentDate) : null;
    let newAppointmentDate = null;
    let isRescheduled = false;
    
    // Handle appointmentDate updates - only update if provided, otherwise preserve existing
    if (appointmentDate) {
      newAppointmentDate = new Date(appointmentDate);
      appt.appointmentDate = appointmentDate;
      console.log(`   Updating appointmentDate: ${appointmentDate}`);
      isRescheduled = originalAppointmentDate && originalAppointmentDate.getTime() !== newAppointmentDate.getTime();
    } else if (appointment_date && appointment_time) {
      // Combine date and time into a single Date object
      newAppointmentDate = new Date(`${appointment_date}T${appointment_time}`);
      appt.appointmentDate = newAppointmentDate;
      console.log(`   Updating appointmentDate from date/time: ${newAppointmentDate}`);
      isRescheduled = originalAppointmentDate && originalAppointmentDate.getTime() !== newAppointmentDate.getTime();
    } else if (appointment_date) {
      // If only date is provided, keep existing time or set to current time
      const existingDate = appt.appointmentDate ? new Date(appt.appointmentDate) : new Date();
      newAppointmentDate = new Date(appointment_date);
      newAppointmentDate.setHours(existingDate.getHours(), existingDate.getMinutes());
      appt.appointmentDate = newAppointmentDate;
      console.log(`   Updating appointmentDate from date only: ${newAppointmentDate}`);
      isRescheduled = originalAppointmentDate && originalAppointmentDate.getTime() !== newAppointmentDate.getTime();
    } else {
      // No appointmentDate update requested - ensure existing one is preserved
      if (!appt.appointmentDate) {
        console.error(`   ⚠️ WARNING: Appointment ${id} has no appointmentDate after fetch!`);
        // This should have been caught earlier, but double-check
        const freshAppt = await DocAppointment.findById(id).select('appointmentDate');
        if (freshAppt && freshAppt.appointmentDate) {
          appt.appointmentDate = freshAppt.appointmentDate;
          console.log(`   ✅ Restored appointmentDate from database: ${freshAppt.appointmentDate}`);
        } else {
          // If still no date, this is a data integrity issue - use current date as fallback
          console.error(`   ⚠️ No appointmentDate found in database, using current date as fallback`);
          appt.appointmentDate = new Date();
        }
      } else {
        console.log(`   ✅ Preserving existing appointmentDate: ${appt.appointmentDate}`);
      }
    }
    
    if (notes) appt.notes = notes;

    // Handle slot booking/freeing for reschedules and cancellations
    if (isRescheduled && originalAppointmentDate && newAppointmentDate) {
      // Free the old slot (make it available again)
      const oldDateStr = originalAppointmentDate.toISOString().split('T')[0];
      const oldTimeStr = originalAppointmentDate.toTimeString().split(' ')[0].substring(0, 5);
      await freeTimeSlotInAvailability(appt.doctorId.toString(), oldDateStr, oldTimeStr, appt._id.toString());
      console.log(`   ✅ Freed old slot: ${oldDateStr} ${oldTimeStr}`);
      
      const newDateStr = newAppointmentDate.toISOString().split('T')[0];
      const newTimeStr = newAppointmentDate.toTimeString().split(' ')[0].substring(0, 5);
      
      // Determine if this is a patient-initiated reschedule (when appointment_date and appointment_time are provided)
      // Patient-initiated reschedules should be immediately confirmed since patients can only see available slots
      const isPatientInitiated = !!(appointment_date && appointment_time);
      
      if (isPatientInitiated) {
        // Patient-initiated reschedule: immediately book the new slot and confirm
        console.log(`   📅 Patient-initiated reschedule - booking new slot immediately`);
        const slotBooked = await bookTimeSlotInAvailability(
          appt.doctorId.toString(),
          newDateStr,
          newTimeStr,
          appt._id.toString()
        );
        
        if (slotBooked) {
          console.log(`   ✅ Booked new slot: ${newDateStr} ${newTimeStr}`);
          // Keep status as 'upcoming' for patient-initiated reschedules (immediately confirmed)
          if (appt.status !== 'pending_reschedule') {
            appt.status = 'upcoming';
          } else {
            // If it was pending_reschedule (from doctor), change to upcoming
            appt.status = 'upcoming';
          }
        } else {
          console.log(`   ⚠️ Warning: Could not book new slot ${newDateStr} ${newTimeStr} - slot may be unavailable`);
          // If slot booking fails, keep as pending or set appropriate status
          appt.status = 'pending_reschedule';
        }
        
        // Log doctor appointment activity (rescheduled by patient, immediately confirmed)
        await logDoctorAppointmentActivity({
          doctorId: appt.doctorId.toString(),
          date: newDateStr,
          totalSlots: "1",
          bookedSlots: slotBooked ? "1" : "0",
          availableSlots: slotBooked ? "0" : "1",
          action: 'rescheduled',
          notes: `Appointment ${appt._id} rescheduled by patient from ${oldDateStr} ${oldTimeStr} to ${newDateStr} ${newTimeStr} - immediately confirmed`
        });
        
        // Log patient appointment activity (rescheduled by patient)
        await logPatientAppointmentActivity({
          patientId: appt.patientId,
          appointmentId: appt._id,
          doctorId: appt.doctorId,
          action: 'rescheduled',
          appointmentDate: newAppointmentDate,
          appointmentTime: newTimeStr,
          consultationType: appt.type,
          notes: `Appointment rescheduled by patient from ${oldDateStr} ${oldTimeStr} to ${newDateStr} ${newTimeStr} - immediately confirmed`
        });
        
        // Create notifications for both doctor and patient when patient reschedules
        if (slotBooked) {
          try {
            // Get doctor and patient info for notifications
            const Doctor = require("../models/DoctorModel");
            const Patient = require("../models/PatientModel");
            const doctorInfo = await Doctor.findById(appt.doctorId);
            const patientInfo = await Patient.findById(appt.patientId);
            
            // Format doctor name with "Dr." prefix
            const formatDoctorName = (name) => {
              if (!name) return 'Dr. Unknown';
              const cleanName = String(name).trim();
              const nameWithoutPrefix = cleanName.replace(/^Dr\.?\s*/i, '');
              return `Dr. ${nameWithoutPrefix}`;
            };
            
            const rawDoctorName = doctorInfo?.DoctorName || doctorInfo?.name || 'Unknown';
            const doctorName = formatDoctorName(rawDoctorName);
            
            const patientName = patientInfo 
              ? `${patientInfo.firstName || ''} ${patientInfo.lastName || ''}`.trim() || 'Patient'
              : 'Patient';
            
            // Format dates and times for notifications
            const oldDateFormatted = originalAppointmentDate.toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            });
            const oldTimeFormatted = originalAppointmentDate.toLocaleTimeString('en-US', { 
              hour: 'numeric', 
              minute: '2-digit',
              hour12: true 
            });
            const newDateFormatted = newAppointmentDate.toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            });
            const newTimeFormatted = newAppointmentDate.toLocaleTimeString('en-US', { 
              hour: 'numeric', 
              minute: '2-digit',
              hour12: true 
            });
            
            // Create Patient notification (appointment rescheduled by patient)
            try {
              const patientNotificationExists = await PatientNotificationModel.notificationExistsForAppointment(
                appt.patientId.toString(),
                appt._id.toString(),
                'appointment_rescheduled'
              );
              
              if (!patientNotificationExists) {
                await PatientNotificationModel.createNotification({
                  patientId: appt.patientId.toString(),
                  type: 'appointment_rescheduled',
                  title: 'Appointment Rescheduled',
                  description: `You have rescheduled your appointment with ${doctorName} from ${oldDateFormatted} at ${oldTimeFormatted} to ${newDateFormatted} at ${newTimeFormatted}.`,
                  icon: 'calendar',
                  appointmentId: appt._id.toString(),
                  doctorName: doctorName,
                  timestamp: new Date()
                });
                console.log(`   ✅ Created patient notification for rescheduled appointment`);
              }
            } catch (patientNotifError) {
              console.error(`   ⚠️ Error creating patient notification:`, patientNotifError);
            }
            
            // Create Doctor notification (appointment rescheduled by patient)
            try {
              const doctorNotificationExists = await DoctorNotificationModel.notificationExistsForAppointment(
                appt.doctorId.toString(),
                appt._id.toString(),
                'appointment_rescheduled'
              );
              
              if (!doctorNotificationExists) {
                await DoctorNotificationModel.createNotification({
                  doctorId: appt.doctorId.toString(),
                  type: 'appointment_rescheduled',
                  title: 'Appointment Rescheduled',
                  description: `${patientName} has rescheduled their appointment from ${oldDateFormatted} at ${oldTimeFormatted} to ${newDateFormatted} at ${newTimeFormatted}.`,
                  icon: 'calendar',
                  appointmentId: appt._id.toString(),
                  patientName: patientName,
                  timestamp: new Date()
                });
                console.log(`   ✅ Created doctor notification for rescheduled appointment`);
              }
            } catch (doctorNotifError) {
              console.error(`   ⚠️ Error creating doctor notification:`, doctorNotifError);
            }
          } catch (notificationError) {
            console.error(`   ⚠️ Error creating reschedule notifications:`, notificationError);
          }
        }
      } else {
        // Doctor-initiated reschedule: wait for patient confirmation
        console.log(`   ⏳ Doctor-initiated reschedule - new slot ${newDateStr} ${newTimeStr} will be booked after patient confirmation`);
        appt.status = 'pending_reschedule';
        
        // Log doctor appointment activity (rescheduled by doctor, pending patient confirmation)
        await logDoctorAppointmentActivity({
          doctorId: appt.doctorId.toString(),
          date: oldDateStr,
          totalSlots: "1",
          bookedSlots: "0", // Old slot is now free
          availableSlots: "1",
          action: 'rescheduled',
          notes: `Appointment ${appt._id} rescheduled by doctor from ${oldDateStr} ${oldTimeStr} to ${newDateStr} ${newTimeStr} - awaiting patient confirmation`
        });
      }
    } else if (status && status.toLowerCase() === 'canceled' && appt.appointmentDate) {
      // Determine who canceled (from request body or default to doctor if called by doctor)
      const canceledByValue = req.body.canceledBy || 'doctor'; // Default to 'doctor' if not specified
      
      // Mark appointment as canceled with canceledBy and canceledAt
      appt.canceledBy = canceledByValue;
      appt.canceledAt = new Date();
      
      // Start transaction for atomic cancellation and visibility update
      const session = await mongoose.startSession();
      session.startTransaction();
      
      try {
        // Lock the doctor-patient mapping to avoid race conditions
        const DoctorPatientMapping = require('../models/DoctorPatientMappingModel');
        await DoctorPatientMapping.findOne({ 
          doctorId: appt.doctorId, 
          patientId: appt.patientId 
        }).session(session).lean(); // Lock the document
        
        // Free the slot when appointment is cancelled
        const cancelDateStr = new Date(appt.appointmentDate).toISOString().split('T')[0];
        const cancelTimeStr = new Date(appt.appointmentDate).toTimeString().split(' ')[0].substring(0, 5);
        await freeTimeSlotInAvailability(appt.doctorId.toString(), cancelDateStr, cancelTimeStr, appt._id.toString());
        console.log(`   ✅ Freed slot: ${cancelDateStr} ${cancelTimeStr}`);
        
        // Save appointment with canceledBy and canceledAt (within transaction)
        await appt.save({ session });
        
        // Update patient visibility based on remaining appointments
        const visibilityResult = await updateVisibilityAfterCancellation(
          appt.doctorId,
          appt.patientId,
          appt._id,
          session
        );
        
        // Log to Doctor_AppointmentActivity
        try {
          await logDoctorAppointmentActivity({
            doctorId: appt.doctorId.toString(),
            date: cancelDateStr,
            totalSlots: "1",
            bookedSlots: "0",
            availableSlots: "1",
            action: 'deleted',
            notes: `Appointment ${appt._id} canceled by doctor. Slot ${cancelDateStr} ${cancelTimeStr} is now available.`
          });
        } catch (activityError) {
          console.error(`   ⚠️ Error logging doctor appointment activity:`, activityError);
        }
        
        // Log to Patient_AppointmentActivity
        try {
          await logPatientAppointmentActivity({
            patientId: appt.patientId,
            appointmentId: appt._id,
            doctorId: appt.doctorId,
            action: 'deleted',
            appointmentDate: appt.appointmentDate,
            appointmentTime: cancelTimeStr,
            consultationType: appt.type,
            notes: `Appointment canceled by doctor. Original date: ${cancelDateStr} ${cancelTimeStr}`
          });
        } catch (activityError) {
          console.error(`   ⚠️ Error logging patient appointment activity:`, activityError);
        }
        
        // Commit transaction
        await session.commitTransaction();
        console.log(`   ✅ Transaction committed: cancellation and visibility update completed`);
        
        // Store visibility result for response and socket emission
        appt._visibilityUpdate = visibilityResult;
        
        // Log audit entry for debugging
        try {
          const DoctorPatientMapping = require('../models/DoctorPatientMappingModel');
          const mapping = await DoctorPatientMapping.findOne({ 
            doctorId: appt.doctorId, 
            patientId: appt.patientId 
          });
          if (mapping) {
            console.log(`   📋 Visibility audit: doctorId=${appt.doctorId}, patientId=${appt.patientId}, isRemoved=${visibilityResult.isRemoved}, lastVisibleDate=${visibilityResult.lastVisibleDate ? visibilityResult.lastVisibleDate.toISOString() : 'null'}`);
          }
        } catch (auditError) {
          console.error(`   ⚠️ Error logging audit entry:`, auditError);
        }
        
        // Emit socket event for real-time UI updates
        try {
          const { io } = require('../server');
          if (io) {
            const visibilityStatus = visibilityResult.isRemoved ? 'removed' : 
                                   (visibilityResult.lastVisibleDate ? 'limited' : 'visible');
            io.emit('patient-visibility-updated', {
              doctorId: appt.doctorId.toString(),
              patientId: appt.patientId.toString(),
              appointmentId: appt._id.toString(),
              visibilityFlag: !visibilityResult.isRemoved,
              last_visible_date: visibilityResult.lastVisibleDate ? visibilityResult.lastVisibleDate.toISOString().split('T')[0] : null,
              visibility: visibilityStatus,
              isRemoved: visibilityResult.isRemoved,
              lastVisibleDate: visibilityResult.lastVisibleDate ? visibilityResult.lastVisibleDate.toISOString() : null,
              nextAppointmentDate: visibilityResult.nextAppointmentDate ? visibilityResult.nextAppointmentDate.toISOString() : null
            });
            console.log(`   ✅ Emitted patient-visibility-updated socket event with nextAppointmentDate: ${visibilityResult.nextAppointmentDate ? visibilityResult.nextAppointmentDate.toISOString() : 'null'}`);
          }
        } catch (socketError) {
          console.error(`   ⚠️ Error emitting socket event:`, socketError);
        }
      } catch (transactionError) {
        // Rollback transaction on error
        await session.abortTransaction();
        console.error(`   ❌ Transaction aborted due to error:`, transactionError);
        throw transactionError;
      } finally {
        session.endSession();
      }
    }

    // Create Patient notification if appointment was canceled by doctor
    if (status && status.toLowerCase() === 'canceled' && appt.appointmentDate) {
      try {
        const PatientNotificationModel = require("../models/PatientNotificationModel");
        
        // Get doctor name and format with "Dr." prefix
        const formatDoctorName = (name) => {
          if (!name) return 'Dr. Unknown';
          const cleanName = String(name).trim();
          const nameWithoutPrefix = cleanName.replace(/^Dr\.?\s*/i, '');
          return `Dr. ${nameWithoutPrefix}`;
        };
        
        let doctorName = 'Dr. Unknown';
        try {
          const Doctor = require("../models/DoctorModel");
          const doctor = await Doctor.findById(appt.doctorId);
          if (doctor) {
            const rawName = doctor.DoctorName || doctor.name || `${doctor.firstName || ''} ${doctor.lastName || ''}`.trim() || 'Unknown';
            doctorName = formatDoctorName(rawName);
          }
        } catch (doctorError) {
          console.error(`   ⚠️ Error fetching doctor name:`, doctorError);
        }
        
        // Format date and time for notification
        const cancelDateObj = new Date(appt.appointmentDate);
        const formattedDate = cancelDateObj.toLocaleDateString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        });
        const formattedTime = cancelDateObj.toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true 
        });
        
        // Create patient notification
        await PatientNotificationModel.createNotification({
          patientId: appt.patientId.toString(),
          type: 'appointment_cancelled',
          title: 'Appointment Canceled',
          description: `${doctorName} has canceled your appointment scheduled for ${formattedDate} at ${formattedTime}.${appt.cancellation_reason ? ` Reason: ${appt.cancellation_reason}` : ''}`,
          icon: 'close-circle',
          appointmentId: appt._id.toString(),
          doctorName: doctorName,
          timestamp: new Date()
        });
        
        console.log(`   ✅ Created patient notification for canceled appointment`);
      } catch (notificationError) {
        console.error(`   ⚠️ Error creating patient notification:`, notificationError);
      }
    }

    // Create notifications for rescheduled appointments (only for doctor-initiated reschedules)
    // Patient-initiated reschedules are already handled above with immediate confirmation
    if (isRescheduled && originalAppointmentDate && newAppointmentDate && !(appointment_date && appointment_time)) {
      try {
        // This is a doctor-initiated reschedule, create patient notification
        const PatientNotificationModel = require("../models/PatientNotificationModel");
        const Doctor = require("../models/DoctorModel");
        
        // Get doctor info
        const doctorInfo = await Doctor.findById(appt.doctorId);
        const formatDoctorName = (name) => {
          if (!name) return 'Dr. Unknown';
          const cleanName = String(name).trim();
          const nameWithoutPrefix = cleanName.replace(/^Dr\.?\s*/i, '');
          return `Dr. ${nameWithoutPrefix}`;
        };
        
        const rawDoctorName = doctorInfo?.DoctorName || doctorInfo?.name || 'Unknown';
        const doctorName = formatDoctorName(rawDoctorName);
        
        // Format dates for notification
        const formatDate = (date) => {
          return date.toISOString().split('T')[0]; // YYYY-MM-DD
        };
        
        const formatDateTime = (date) => {
          const d = new Date(date);
          const dateStr = formatDate(d);
          const timeStr = d.toTimeString().split(' ')[0].substring(0, 5); // HH:MM
          return `${dateStr} ${timeStr}`;
        };
        
        const oldDateTime = formatDateTime(originalAppointmentDate);
        const newDateTime = formatDateTime(newAppointmentDate);
        const newDateStr = formatDate(newAppointmentDate);
        
        // Format for display in notification
        const oldDateFormatted = originalAppointmentDate.toLocaleDateString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        });
        const oldTimeFormatted = originalAppointmentDate.toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true 
        });
        const newDateFormatted = newAppointmentDate.toLocaleDateString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        });
        const newTimeFormatted = newAppointmentDate.toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true 
        });
        
        // Create patient notification for doctor-initiated reschedule
        const patientNotificationExists = await PatientNotificationModel.notificationExistsForAppointment(
          appt.patientId.toString(),
          appt._id.toString(),
          'appointment_reschedule_pending'
        );
        
        if (!patientNotificationExists) {
          await PatientNotificationModel.createNotification({
            patientId: appt.patientId.toString(),
            type: 'appointment_reschedule_pending',
            title: 'Appointment Reschedule Request',
            description: `${doctorName} has requested to reschedule your appointment from ${oldDateFormatted} at ${oldTimeFormatted} to ${newDateFormatted} at ${newTimeFormatted}. Please confirm or cancel this request.`,
            icon: 'calendar',
            appointmentId: appt._id.toString(),
            doctorName: doctorName,
            oldDate: oldDateFormatted,
            oldTime: oldTimeFormatted,
            newDate: newDateFormatted,
            newTime: newTimeFormatted,
            timestamp: new Date()
          });
          console.log(`   ✅ Created patient notification for doctor-initiated reschedule request`);
        }
        
        // Log to Patient_AppointmentActivity for doctor-initiated reschedule
        try {
          const PatientAppointmentActivity = require("../models/PatientAppointmentActivityModel");
          const oldTimeStr = originalAppointmentDate.toTimeString().split(' ')[0].substring(0, 5);
          const newTimeStr = newAppointmentDate.toTimeString().split(' ')[0].substring(0, 5);
          
          await PatientAppointmentActivity.create({
            patientId: appt.patientId.toString(),
            appointmentId: appt._id.toString(),
            doctorId: appt.doctorId.toString(),
            action: 'rescheduled',
            appointmentDate: newAppointmentDate,
            appointmentTime: newTimeStr,
            consultationType: appt.type,
            previousDate: originalAppointmentDate,
            previousTime: oldTimeStr,
            notes: `Appointment rescheduled by doctor from ${oldDateTime} to ${newDateTime} - awaiting patient confirmation`
          });
          
          console.log(`   ✅ Logged rescheduled appointment to Patient_AppointmentActivity`);
        } catch (patientActivityError) {
          console.error(`   ⚠️ Error logging patient appointment activity for reschedule:`, patientActivityError);
        }
      } catch (rescheduleError) {
        console.error(`   ⚠️ Error handling doctor-initiated reschedule notification:`, rescheduleError);
      }
    }

    // Log activity for status changes (completed, or other status changes not already handled)
    if (status && !isRescheduled && status.toLowerCase() !== 'canceled') {
      const newStatus = status.toLowerCase();
      
      // Only log if status actually changed
      if (oldStatus !== newStatus && appt.appointmentDate) {
        const appointmentDateStr = new Date(appt.appointmentDate).toISOString().split('T')[0];
        const appointmentTimeStr = new Date(appt.appointmentDate).toTimeString().split(' ')[0].substring(0, 5);
        
        // Log to Patient_AppointmentActivity
        try {
          await logPatientAppointmentActivity({
            patientId: appt.patientId,
            appointmentId: appt._id,
            doctorId: appt.doctorId,
            action: newStatus === 'completed' ? 'completed' : 'updated',
            appointmentDate: appt.appointmentDate,
            appointmentTime: appointmentTimeStr,
            consultationType: appt.type,
            notes: `Appointment status changed from ${oldStatus} to ${newStatus}`
          });
          console.log(`   ✅ Logged patient appointment activity for status change: ${oldStatus} -> ${newStatus}`);
        } catch (activityError) {
          console.error(`   ⚠️ Error logging patient appointment activity:`, activityError);
        }
        
        // Log to Doctor_AppointmentActivity
        try {
          // Get availability to get slot counts
          const availability = await DoctorAvailability.findOne({ 
            doctorId: appt.doctorId.toString(), 
            date: appointmentDateStr 
          });
          
          await logDoctorAppointmentActivity({
            doctorId: appt.doctorId.toString(),
            date: appointmentDateStr,
            totalSlots: availability?.totalSlots || "1",
            bookedSlots: availability?.bookedSlots || "0",
            availableSlots: availability?.availableSlots || "1",
            action: newStatus === 'completed' ? 'completed' : 'updated',
            notes: `Appointment ${appt._id} status changed from ${oldStatus} to ${newStatus}`
          });
          console.log(`   ✅ Logged doctor appointment activity for status change: ${oldStatus} -> ${newStatus}`);
        } catch (activityError) {
          console.error(`   ⚠️ Error logging doctor appointment activity:`, activityError);
        }
      }
    }

    // Save the appointment with all updates
    await appt.save();

    // Invalidate translation cache so next read re-translates with new data
    invalidateTranslation('Doctor_appointment', appt._id).catch(() => {});

    console.log(`   ✅ Appointment ${id} updated successfully`);

    // Include visibility update info in response if available
    const responseData = {
      success: true,
      message: "Appointment updated successfully",
      appointment: appt
    };
    
    if (appt._visibilityUpdate) {
      const visibilityStatus = appt._visibilityUpdate.isRemoved ? 'removed' : 
                              (appt._visibilityUpdate.lastVisibleDate ? 'limited' : 'visible');
      responseData.visibility = visibilityStatus;
      responseData.visibilityUpdate = {
        isRemoved: appt._visibilityUpdate.isRemoved,
        lastVisibleDate: appt._visibilityUpdate.lastVisibleDate ? appt._visibilityUpdate.lastVisibleDate.toISOString() : null
      };
      responseData.lastVisibleDate = appt._visibilityUpdate.lastVisibleDate ? 
        appt._visibilityUpdate.lastVisibleDate.toISOString().split('T')[0] : null;
    }
    
    res.json(responseData);
  } catch (err) {
    console.error("❌ updateAppointmentStatus ERROR:", err);
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

// Patient confirms rescheduled appointment
const confirmRescheduledAppointment = async (req, res) => {
  try {
    const { id } = req.params; // appointment ID
    const { patientId } = req.body;

    console.log(`\n✅ Patient confirming rescheduled appointment ${id}`);

    // Fetch appointment
    const appt = await DocAppointment.findById(id);
    if (!appt) {
      return res.status(404).json({ success: false, message: "Appointment not found" });
    }

    // Verify patient owns this appointment
    if (appt.patientId.toString() !== patientId) {
      return res.status(403).json({ success: false, message: "Unauthorized: This appointment does not belong to you" });
    }

    // Verify appointment is in pending_reschedule status
    if (appt.status !== 'pending_reschedule') {
      return res.status(400).json({ 
        success: false, 
        message: `Appointment is not pending reschedule. Current status: ${appt.status}` 
      });
    }

    // Get the new appointment date from the appointment
    const newAppointmentDate = appt.appointmentDate;
    if (!newAppointmentDate) {
      return res.status(400).json({ success: false, message: "New appointment date not found" });
    }

    const newDateStr = newAppointmentDate.toISOString().split('T')[0];
    const newTimeStr = newAppointmentDate.toTimeString().split(' ')[0].substring(0, 5);

    // Book the new slot
    const bookingResult = await bookTimeSlotInAvailability(
      appt.doctorId.toString(), 
      newDateStr, 
      newTimeStr, 
      appt._id.toString()
    );

    if (!bookingResult) {
      return res.status(400).json({ 
        success: false, 
        message: "Failed to book the new time slot. It may no longer be available." 
      });
    }

    // Update appointment status to 'upcoming'
    appt.status = 'upcoming';
    await appt.save();

    // Get doctor and patient info for logging
    const Doctor = require("../models/DoctorModel");
    const Patient = require("../models/PatientModel");
    const doctorInfo = await Doctor.findById(appt.doctorId);
    const patientInfo = await Patient.findById(patientId);
    const doctorName = doctorInfo?.DoctorName || doctorInfo?.name || 'Dr. Unknown';
    const patientName = patientInfo 
      ? `${patientInfo.firstName || ''} ${patientInfo.lastName || ''}`.trim() || 'Patient'
      : 'Patient';

    // Format date and time for display
    const formattedDate = newAppointmentDate.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    const formattedTime = newAppointmentDate.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });

    // Log to Patient_AppointmentActivity
    await logPatientAppointmentActivity({
      patientId: patientId,
      appointmentId: appt._id,
      doctorId: appt.doctorId.toString(),
      action: 'rescheduled',
      appointmentDate: newAppointmentDate,
      appointmentTime: newTimeStr,
      consultationType: appt.type,
      notes: `Patient confirmed rescheduled appointment for ${formattedDate} at ${formattedTime}`
    });

    // Log to Doctor_AppointmentActivity
    const availability = await DoctorAvailability.findOne({ 
      doctorId: appt.doctorId.toString(), 
      date: newDateStr 
    });
    await logDoctorAppointmentActivity({
      doctorId: appt.doctorId.toString(),
      date: newDateStr,
      totalSlots: availability?.totalSlots || "1",
      bookedSlots: availability?.bookedSlots || "1",
      availableSlots: availability?.availableSlots || "0",
      action: 'rescheduled',
      notes: `Appointment ${appt._id} reschedule confirmed by patient ${patientName} for ${formattedDate} at ${formattedTime}`
    });

    // Create confirmation notification for patient
    try {
      const PatientNotificationModel = require("../models/PatientNotificationModel");
      await PatientNotificationModel.createNotification({
        patientId: patientId,
        type: 'appointment_rescheduled',
        title: 'Appointment Reschedule Confirmed',
        description: `Your appointment with ${doctorName} has been confirmed for ${formattedDate} at ${formattedTime}.`,
        icon: 'checkmark-circle',
        appointmentId: appt._id.toString(),
        doctorName: doctorName,
        timestamp: new Date()
      });
    } catch (notifError) {
      console.error("Error creating patient confirmation notification:", notifError);
    }

    // Create notification for doctor - patient confirmed reschedule
    try {
      const notificationExists = await DoctorNotificationModel.notificationExistsForAppointment(
        appt.doctorId.toString(),
        appt._id.toString(),
        'appointment_reschedule_confirmed'
      );

      if (!notificationExists) {
        await DoctorNotificationModel.createNotification({
          doctorId: appt.doctorId.toString(),
          type: 'appointment_reschedule_confirmed',
          title: 'Reschedule Request Accepted',
          description: `${patientName} has accepted the reschedule request. Appointment confirmed for ${formattedDate} at ${formattedTime}.`,
          icon: 'checkmark-circle',
          appointmentId: appt._id.toString(),
          patientName: patientName,
          timestamp: new Date()
        });
        console.log(`✅ Created doctor notification for reschedule confirmation`);
      }
    } catch (doctorNotifError) {
      console.error("Error creating doctor confirmation notification:", doctorNotifError);
    }

    console.log(`✅ Patient confirmed rescheduled appointment ${id}`);
    res.json({ 
      success: true, 
      message: "Appointment reschedule confirmed successfully",
      appointment: appt
    });
  } catch (err) {
    console.error("❌ confirmRescheduledAppointment ERROR:", err);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: err.message 
    });
  }
};

// Patient cancels rescheduled appointment
const cancelRescheduledAppointment = async (req, res) => {
  try {
    const { id } = req.params; // appointment ID
    const { patientId } = req.body;

    console.log(`\n❌ Patient canceling rescheduled appointment ${id}`);

    // Fetch appointment
    const appt = await DocAppointment.findById(id);
    if (!appt) {
      return res.status(404).json({ success: false, message: "Appointment not found" });
    }

    // Verify patient owns this appointment
    if (appt.patientId.toString() !== patientId) {
      return res.status(403).json({ success: false, message: "Unauthorized: This appointment does not belong to you" });
    }

    // Verify appointment is in pending_reschedule status
    if (appt.status !== 'pending_reschedule') {
      return res.status(400).json({ 
        success: false, 
        message: `Appointment is not pending reschedule. Current status: ${appt.status}` 
      });
    }

    // Get the new appointment date (the one that was proposed)
    const newAppointmentDate = appt.appointmentDate;
    const newDateStr = newAppointmentDate ? newAppointmentDate.toISOString().split('T')[0] : null;
    const newTimeStr = newAppointmentDate ? newAppointmentDate.toTimeString().split(' ')[0].substring(0, 5) : null;

    // Free the new slot (make it available again since patient canceled)
    if (newDateStr && newTimeStr) {
      // Note: The slot was never booked, but we should ensure it's available
      // This is a safety check in case the slot was somehow reserved
      console.log(`   Ensuring slot ${newDateStr} ${newTimeStr} is available`);
    }

    // Get doctor and patient info for logging
    const Doctor = require("../models/DoctorModel");
    const Patient = require("../models/PatientModel");
    const doctorInfo = await Doctor.findById(appt.doctorId);
    const patientInfo = await Patient.findById(patientId);
    const doctorName = doctorInfo?.DoctorName || doctorInfo?.name || 'Dr. Unknown';
    const patientName = patientInfo 
      ? `${patientInfo.firstName || ''} ${patientInfo.lastName || ''}`.trim() || 'Patient'
      : 'Patient';

    // Format date and time for display
    const formattedDate = newAppointmentDate 
      ? newAppointmentDate.toLocaleDateString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })
      : 'N/A';
    const formattedTime = newAppointmentDate
      ? newAppointmentDate.toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true 
        })
      : 'N/A';

    // Log to Patient_AppointmentActivity
    await logPatientAppointmentActivity({
      patientId: patientId,
      appointmentId: appt._id,
      doctorId: appt.doctorId.toString(),
      action: 'deleted',
      appointmentDate: newAppointmentDate || new Date(),
      appointmentTime: newTimeStr || '00:00',
      consultationType: appt.type,
      notes: `Patient canceled rescheduled appointment that was proposed for ${formattedDate} at ${formattedTime}`
    });

    // Log to Doctor_AppointmentActivity
    await logDoctorAppointmentActivity({
      doctorId: appt.doctorId.toString(),
      date: newDateStr || new Date().toISOString().split('T')[0],
      totalSlots: "1",
      bookedSlots: "0",
      availableSlots: "1",
      action: 'deleted',
      notes: `Appointment ${appt._id} reschedule canceled by patient ${patientName}. Proposed time was ${formattedDate} at ${formattedTime}`
    });

    // Delete the appointment
    await DocAppointment.findByIdAndDelete(id);

    // Create cancellation notification for patient
    try {
      const PatientNotificationModel = require("../models/PatientNotificationModel");
      await PatientNotificationModel.createNotification({
        patientId: patientId,
        type: 'appointment_cancelled',
        title: 'Appointment Reschedule Canceled',
        description: `You have canceled the rescheduled appointment with ${doctorName} that was proposed for ${formattedDate} at ${formattedTime}.`,
        icon: 'close-circle',
        appointmentId: appt._id.toString(),
        doctorName: doctorName,
        timestamp: new Date()
      });
    } catch (notifError) {
      console.error("Error creating patient cancellation notification:", notifError);
    }

    // Create notification for doctor - patient canceled reschedule
    try {
      // Check if notification already exists to avoid duplicates
      const notificationExists = await DoctorNotificationModel.notificationExistsForAppointment(
        appt.doctorId.toString(),
        appt._id.toString(),
        'appointment_reschedule_canceled'
      );

      if (!notificationExists) {
        await DoctorNotificationModel.createNotification({
          doctorId: appt.doctorId.toString(),
          type: 'appointment_reschedule_canceled',
          title: 'Reschedule Request Canceled',
          description: `${patientName} has canceled the reschedule request. The appointment that was proposed for ${formattedDate} at ${formattedTime} has been canceled.`,
          icon: 'close-circle',
          appointmentId: appt._id.toString(),
          patientName: patientName,
          timestamp: new Date()
        });
        console.log(`✅ Created doctor notification for reschedule cancellation`);
      }
    } catch (doctorNotifError) {
      console.error("Error creating doctor cancellation notification:", doctorNotifError);
    }

    console.log(`✅ Patient canceled rescheduled appointment ${id}`);
    res.json({ 
      success: true, 
      message: "Appointment reschedule canceled successfully. The appointment has been deleted."
    });
  } catch (err) {
    console.error("❌ cancelRescheduledAppointment ERROR:", err);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: err.message 
    });
  }
};

const deleteAppointment = async (req, res) => {
  try {
    const appt = await DocAppointment.findById(req.params.id);
    if (!appt) return res.status(404).json({ success: false, message: "Appointment not found" });

    // Log activities and free slot before deleting
    if (appt.appointmentDate) {
      const appointmentDateStr = new Date(appt.appointmentDate).toISOString().split('T')[0];
      const appointmentTimeStr = new Date(appt.appointmentDate).toTimeString().split(' ')[0].substring(0, 5);
      
      // Log patient appointment activity (canceled)
      try {
        await logPatientAppointmentActivity({
          patientId: appt.patientId,
          appointmentId: appt._id,
          doctorId: appt.doctorId,
          action: 'canceled',
          appointmentDate: appt.appointmentDate,
          appointmentTime: appointmentTimeStr,
          consultationType: appt.type,
          notes: 'Appointment canceled by patient'
        });
      } catch (activityError) {
        console.error(`   ⚠️ Error logging patient appointment activity:`, activityError);
      }

      // Log doctor appointment activity (canceled)
      try {
        // Get availability to get slot counts
        const availability = await DoctorAvailability.findOne({ 
          doctorId: appt.doctorId.toString(), 
          date: appointmentDateStr 
        });

        await logDoctorAppointmentActivity({
          doctorId: appt.doctorId.toString(),
          date: appointmentDateStr,
          totalSlots: availability?.totalSlots || "1",
          bookedSlots: availability?.bookedSlots || "0",
          availableSlots: availability?.availableSlots || "1",
          action: 'canceled',
          notes: `Appointment ${appt._id} canceled by patient. Slot ${appointmentDateStr} ${appointmentTimeStr} is now available.`
        });
      } catch (activityError) {
        console.error(`   ⚠️ Error logging doctor appointment activity:`, activityError);
      }

      // Free the time slot
      await freeTimeSlotInAvailability(appt.doctorId.toString(), appointmentDateStr, appointmentTimeStr, appt._id.toString());

      // Get doctor and patient info for notifications
      const Doctor = require("../models/DoctorModel");
      const Patient = require("../models/PatientModel");
      const doctorInfo = await Doctor.findById(appt.doctorId);
      const patientInfo = await Patient.findById(appt.patientId);
      
      // Format doctor name with "Dr." prefix
      const formatDoctorName = (name) => {
        if (!name) return 'Dr. Unknown';
        const cleanName = String(name).trim();
        const nameWithoutPrefix = cleanName.replace(/^Dr\.?\s*/i, '');
        return `Dr. ${nameWithoutPrefix}`;
      };
      
      const rawDoctorName = doctorInfo?.DoctorName || doctorInfo?.name || 'Unknown';
      const doctorName = formatDoctorName(rawDoctorName);
      
      const patientName = patientInfo 
        ? `${patientInfo.firstName || ''} ${patientInfo.lastName || ''}`.trim() || 'Patient'
        : 'Patient';

      // Format date and time for notifications
      const appointmentDateObj = new Date(appt.appointmentDate);
      const formattedDate = appointmentDateObj.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      const formattedTime = appointmentDateObj.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });

      // Create Patient notification (appointment cancelled by patient)
      try {
        const patientNotificationExists = await PatientNotificationModel.notificationExistsForAppointment(
          appt.patientId.toString(),
          appt._id.toString(),
          'appointment_cancelled'
        );

        if (!patientNotificationExists) {
          await PatientNotificationModel.createNotification({
            patientId: appt.patientId.toString(),
            type: 'appointment_cancelled',
            title: 'Appointment Cancelled',
            description: `You have cancelled your appointment with ${doctorName} scheduled for ${formattedDate} at ${formattedTime}.`,
            icon: 'close-circle',
            appointmentId: appt._id.toString(),
            doctorName: doctorName,
            timestamp: new Date()
          });
          console.log(`   ✅ Created patient notification for cancelled appointment`);
        }
      } catch (patientNotifError) {
        console.error(`   ⚠️ Error creating patient notification:`, patientNotifError);
      }

      // Create Doctor notification (appointment cancelled by patient)
      try {
        const doctorNotificationExists = await DoctorNotificationModel.notificationExistsForAppointment(
          appt.doctorId.toString(),
          appt._id.toString(),
          'appointment_cancelled'
        );

        if (!doctorNotificationExists) {
          await DoctorNotificationModel.createNotification({
            doctorId: appt.doctorId.toString(),
            type: 'appointment_cancelled',
            title: 'Appointment Cancelled',
            description: `${patientName} has cancelled their appointment scheduled for ${formattedDate} at ${formattedTime}. The time slot is now available.`,
            icon: 'close-circle',
            appointmentId: appt._id.toString(),
            patientName: patientName,
            timestamp: new Date()
          });
          console.log(`   ✅ Created doctor notification for cancelled appointment`);
        }
      } catch (doctorNotifError) {
        console.error(`   ⚠️ Error creating doctor notification:`, doctorNotifError);
      }
    }

    // Start transaction for atomic cancellation and visibility update
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // Mark appointment as canceled instead of deleting it (so it remains visible)
      appt.status = 'canceled';
      appt.cancellation_reason = 'Cancelled by patient';
      appt.canceledBy = 'patient';
      appt.canceledAt = new Date();
      await appt.save({ session });
      
      // Update patient visibility based on remaining appointments
      const { updateVisibilityAfterCancellation } = require('../services/patientVisibilityService');
      const visibilityResult = await updateVisibilityAfterCancellation(
        appt.doctorId,
        appt.patientId,
        appt._id,
        session
      );
      
      // Commit transaction
      await session.commitTransaction();
      console.log(`   ✅ Transaction committed: cancellation and visibility update completed`);
      
      // Emit socket event for real-time UI updates
      try {
        const { io } = require('../server');
        if (io) {
          const visibilityStatus = visibilityResult.isRemoved ? 'removed' : 
                                 (visibilityResult.lastVisibleDate ? 'limited' : 'visible');
          io.emit('patient-visibility-updated', {
            doctorId: appt.doctorId.toString(),
            patientId: appt.patientId.toString(),
            appointmentId: appt._id.toString(),
            visibilityFlag: !visibilityResult.isRemoved,
            last_visible_date: visibilityResult.lastVisibleDate ? visibilityResult.lastVisibleDate.toISOString().split('T')[0] : null,
            visibility: visibilityStatus,
            isRemoved: visibilityResult.isRemoved,
            lastVisibleDate: visibilityResult.lastVisibleDate ? visibilityResult.lastVisibleDate.toISOString() : null,
            nextAppointmentDate: visibilityResult.nextAppointmentDate ? visibilityResult.nextAppointmentDate.toISOString() : null
          });
          console.log(`   ✅ Emitted patient-visibility-updated socket event with nextAppointmentDate: ${visibilityResult.nextAppointmentDate ? visibilityResult.nextAppointmentDate.toISOString() : 'null'}`);
        }
      } catch (socketError) {
        console.error(`   ⚠️ Error emitting socket event:`, socketError);
      }
      
      console.log(`   ✅ Appointment ${req.params.id} marked as cancelled (not deleted)`);
    } catch (transactionError) {
      // Rollback transaction on error
      await session.abortTransaction();
      console.error(`   ❌ Transaction aborted due to error:`, transactionError);
      throw transactionError;
    } finally {
      session.endSession();
    }

    res.json({ success: true, message: "Appointment cancelled successfully" });
  } catch (err) {
    console.error("❌ deleteAppointment ERROR:", err);
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

const deleteAllCompletedAppointments = async (req, res) => {
  try {
    const { doctorId } = req.params;
    
    console.log(`\n🗑️ Deleting all completed appointments${doctorId ? ` for doctor: ${doctorId}` : ' (all doctors)'}`);

    let filter = { status: 'completed' };
    
    // If doctorId is provided, only delete for that doctor
    if (doctorId) {
      filter.doctorId = new mongoose.Types.ObjectId(doctorId);
    }
    
    // Delete all completed appointments
    const result = await DocAppointment.deleteMany(filter);

    console.log(`✅ Deleted ${result.deletedCount} completed appointment(s)\n`);

    res.json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} completed appointment(s)`,
      deletedCount: result.deletedCount
    });
  } catch (err) {
    console.error("❌ deleteAllCompletedAppointments ERROR:", err);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: err.message 
    });
  }
};

const getAllAppointments = async (req, res) => {
  try {
    const appts = await DocAppointment.find()
      .populate("doctorId", "DoctorName email specialization")
      .populate("patientId", "firstName lastName Age gender phone emailAddress")
      .sort({ appointmentDate: 1 });

    // Transform appointments to match frontend expectations
    const transformedAppointments = await Promise.all(appts.map(transformAppointment));

    res.json({
      success: true,
      count: transformedAppointments.length,
      appointments: transformedAppointments,
    });
  } catch (err) {
    console.error("❌ getAllAppointments ERROR:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

const getAppointmentsByPatient = async (req, res) => {
  try {
    const patientId = new mongoose.Types.ObjectId(req.params.patientId.trim());
    const { status } = req.query;

    const filter = { patientId };
    if (status) filter.status = status.toLowerCase();

    const appts = await DocAppointment.find(filter)
      .populate("doctorId", "DoctorName email specialization")
      .populate("patientId", "firstName lastName Age gender phone emailAddress")
      .sort({ appointmentDate: -1 }); // Most recent first

    if (!appts.length) {
      return res.json({ success: true, message: "No appointments found for this patient", count: 0, appointments: [] });
    }

    // Check for missed appointments and notify patient (non-blocking)
    (async () => {
      try {
        const now = new Date();
        
        const missedAppts = appts.filter(apt => {
          if (apt.status?.toLowerCase() !== 'upcoming') return false;
          
          // Use the parseAppointmentDateTime helper function
          const appointmentDateTime = parseAppointmentDateTime(
            apt.appointment_date,
            apt.appointment_time,
            apt.appointmentDate
          );
          
          if (!appointmentDateTime) return false;
          
          // Appointment is missed if current datetime is strictly greater than appointment datetime
          return now > appointmentDateTime;
        });
        
        for (const appointment of missedAppts) {
          try {
            const appointmentId = appointment._id.toString();
            
            // Check if notification already exists
            const notificationExists = await PatientNotificationModel.notificationExistsForAppointment(
              patientId.toString(),
              appointmentId,
              'appointment_missed'
            );
            
            if (notificationExists) continue;
            
            // Get doctor name
            const doctorName = appointment.doctorId?.DoctorName || 'Doctor';
            
            // Format appointment date and time
            const appointmentDate = new Date(appointment.appointmentDate);
            const formattedDate = appointmentDate.toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            });
            
            // Get appointment time if available
            let formattedTime = '';
            if (appointment.appointment_time) {
              try {
                const timeStr = appointment.appointment_time;
                if (timeStr.includes('AM') || timeStr.includes('PM')) {
                  formattedTime = timeStr;
                } else {
                  const [hours, minutes] = timeStr.split(':').map(Number);
                  const period = hours >= 12 ? 'PM' : 'AM';
                  const displayHours = hours % 12 || 12;
                  formattedTime = `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
                }
              } catch (e) {
                formattedTime = appointment.appointment_time;
              }
            }
            
            const timeText = formattedTime ? ` at ${formattedTime}` : '';
            
            // Create notification
            await PatientNotificationModel.createNotification({
              patientId: patientId.toString(),
              type: 'appointment_missed',
              title: 'Missed Appointment',
              description: `You missed your appointment with ${doctorName} scheduled for ${formattedDate}${timeText}. Please contact the clinic to reschedule.`,
              icon: 'alert-circle',
              appointmentId: appointmentId,
              doctorName: doctorName,
              timestamp: new Date()
            });
            
            console.log(`✅ Created missed appointment notification for patient ${patientId} (appointment ${appointmentId})`);
          } catch (notifError) {
            console.error(`⚠️ Error creating missed appointment notification:`, notifError);
          }
        }
      } catch (error) {
        console.error('⚠️ Error checking for missed appointments:', error);
      }
    })();

    // Transform appointments to match frontend expectations
    const transformedAppointments = await Promise.all(appts.map(transformAppointment));

    // Translate for patient's preferred language
    const patientIdStr = patientId.toString();
    const translatedAppointments = await Promise.all(
      transformedAppointments.map((appt) => translateAppointment(appt, patientIdStr))
    );

    // Log for debugging
    console.log(`✅ Transformed ${translatedAppointments.length} appointments for patient ${patientId}`);

    res.json({ success: true, message: "Appointments fetched", count: translatedAppointments.length, appointments: translatedAppointments });
  } catch (err) {
    console.error("❌ getAppointmentsByPatient ERROR:", err);
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

/**
 * Get booked appointments from the past 30 days for a doctor (excluding today and upcoming)
 */
const getPast30DaysAppointments = async (req, res) => {
  try {
    const doctorId = new mongoose.Types.ObjectId(req.doctor.doctorId);
    
    // Calculate date 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);
    
    // Get yesterday's date (end of day) - exclude today
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(23, 59, 59, 999);
    
    // Find appointments within the past 30 days, excluding today and upcoming appointments
    const appts = await DocAppointment.find({
      doctorId: doctorId,
      appointmentDate: {
        $gte: thirtyDaysAgo,
        $lte: yesterday
      },
      status: { $in: ['completed', 'booked'] } // Only completed and booked, exclude upcoming
    })
      .populate("patientId", "firstName lastName Age gender phone emailAddress")
      .sort({ appointmentDate: -1 }); // Most recent first

    if (!appts.length) {
      return res.json({ 
        success: true, 
        message: "No appointments found in the past 30 days", 
        count: 0, 
        appointments: [] 
      });
    }

    // Transform appointments to match frontend expectations
    const transformedAppointments = await Promise.all(appts.map(transformAppointment));
    
    console.log(`✅ Found ${transformedAppointments.length} appointments in the past 30 days for doctor ${doctorId}`);

    res.json({ 
      success: true, 
      message: "Past 30 days appointments fetched", 
      count: transformedAppointments.length, 
      appointments: transformedAppointments 
    });
  } catch (err) {
    console.error("❌ getPast30DaysAppointments ERROR:", err);
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

module.exports = {
  getAllAppointments,
  getAppointmentById,
  getAppointmentsByDoctor,
  getAppointmentsByPatient,
  getPast30DaysAppointments,
  createAppointment,
  updateAppointmentStatus,
  confirmRescheduledAppointment,
  cancelRescheduledAppointment,
  deleteAppointment,
  deleteAllCompletedAppointments
};

