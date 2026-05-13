// controller/PatientDetailController.js
const Patient = require("../models/PatientModel");
const PatientMedicalRecord = require("../models/PatientMedicalRecordModel");
const DocAppointment = require("../models/DoctorAppointmentModel");
const { getOrCreateTranslation } = require('../services/translationService');
const { getPatientLanguage } = require('../utils/getPatientLanguage');
const DoctorPatientMapping = require("../models/DoctorPatientMappingModel");
const PatientAppointmentActivity = require("../models/PatientAppointmentActivityModel");
const { checkPatientVisibility, normalizeToUTCDay, logAccess } = require("../services/patientVisibilityService");
const { 
  filterValidFutureAppointments, 
  getNextAppointmentDate, 
  buildValidFutureAppointmentsQuery,
  logAppointmentFiltering,
  isCancelledStatus
} = require("../services/appointmentFilterService");
const mongoose = require("mongoose");

/**
 * Check if appointment date has passed (end of day)
 * @param {Date} appointmentDate - The appointment date
 * @returns {boolean} - True if appointment date has passed
 */
const hasAppointmentDatePassed = (appointmentDate) => {
  if (!appointmentDate) return false;
  
  const appointment = new Date(appointmentDate);
  const now = new Date();
  
  // Set to end of appointment day (23:59:59.999)
  const endOfAppointmentDay = new Date(appointment);
  endOfAppointmentDay.setHours(23, 59, 59, 999);
  
  return now > endOfAppointmentDay;
};

/**
 * Create a restricted version of medical record (hides sensitive data)
 * @param {Object} medicalRecord - The full medical record
 * @returns {Object} - Restricted medical record
 */
const createRestrictedMedicalRecord = (medicalRecord) => {
  if (!medicalRecord) return null;
  
  // Return only non-sensitive information
  return {
    _id: medicalRecord._id,
    patientId: medicalRecord.patientId,
    doctorId: medicalRecord.doctorId,
    appointmentId: medicalRecord.appointmentId,
    // Keep basic health info (less sensitive)
    allergies: medicalRecord.allergies || [],
    chronicConditions: medicalRecord.chronicConditions || [],
    vaccinations: medicalRecord.vaccinations || [],
    // Hide sensitive data
    diagnosis: "",
    symptoms: [],
    medications: [],
    vitals: null,
    notes: "",
    // Preserve follow-up information (not sensitive)
    followUpRequired: medicalRecord.followUpRequired || false,
    followUpDate: medicalRecord.followUpDate || null,
    prescriptions: [],
    createdAt: medicalRecord.createdAt,
    updatedAt: medicalRecord.updatedAt,
    __v: medicalRecord.__v,
    // Flag to indicate data is restricted
    _restricted: true,
    _restrictionReason: "Appointment date has passed. Access to detailed medical information is no longer available."
  };
};

const getPatients = async (req, res) => {
  try {
    const doctorId = req.doctor?.doctorId;
    const sortBy = req.query.sortBy || 'most_recent'; // Default to most recent appointment
    const search = req.query.search || ''; // Search query
    
    // Note: Access logging for patient list is done per-patient when viewing details
    // We don't log list access to avoid excessive logging
    
    // If doctorId is provided, only return patients who have had at least one appointment with that doctor
    // AND who are still visible according to visibility rules
    if (doctorId) {
      try {
        // Build search query for appointments
        let appointmentQuery = { doctorId: doctorId };
        
        // If search is provided, filter appointments by search criteria
        if (search) {
          const searchLower = search.toLowerCase().trim();
          
          // Search by appointment ID
          if (mongoose.Types.ObjectId.isValid(search)) {
            appointmentQuery._id = new mongoose.Types.ObjectId(search);
          } else {
            // Search by patient name, phone, or diagnosis
            // First, find patients matching search criteria
            const patientSearchQuery = {
              $or: [
                { firstName: { $regex: search, $options: 'i' } },
                { lastName: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } }
              ]
            };
            const matchingPatients = await Patient.find(patientSearchQuery).select('_id').lean();
            const matchingPatientIds = matchingPatients.map(p => p._id);
            
            // Also search in appointments for diagnosis
            const diagnosisAppointments = await DocAppointment.find({
              doctorId: doctorId,
              diagnosis: { $regex: search, $options: 'i' }
            }).select('patientId').lean();
            const diagnosisPatientIds = diagnosisAppointments.map(a => a.patientId);
            
            // Combine patient IDs
            const allMatchingPatientIds = [...new Set([...matchingPatientIds, ...diagnosisPatientIds])];
            
            if (allMatchingPatientIds.length > 0) {
              appointmentQuery.patientId = { $in: allMatchingPatientIds };
            } else {
              // No matches found, return empty array
              return res.json([]);
            }
          }
        }
        
        // Find all distinct patient IDs who have appointments with this doctor (matching search if provided)
        const appointments = await DocAppointment.find(appointmentQuery).distinct('patientId');
        
        if (appointments.length === 0) {
          // No appointments found for this doctor, return empty array
          return res.json([]);
        }
        
        // Get visibility mappings for all these patients
        const today = normalizeToUTCDay(new Date());
        const visibilityMappings = await DoctorPatientMapping.find({
          doctorId: doctorId,
          patientId: { $in: appointments }
        }).lean();
        
        // Create a map for quick lookup
        const visibilityMap = new Map();
        visibilityMappings.forEach(mapping => {
          visibilityMap.set(mapping.patientId.toString(), mapping);
        });
        
        // Filter patients based on visibility rules
        const visiblePatientIds = appointments.filter(patientId => {
          const mapping = visibilityMap.get(patientId.toString());
          
          // If no mapping exists, patient is fully visible (backward compatibility)
          if (!mapping) {
            return true;
          }
          
          // If explicitly removed, exclude
          if (mapping.isRemoved) {
            return false;
          }
          
          // If lastVisibleDate is set, check if it has passed
          if (mapping.lastVisibleDate) {
            const lastVisible = normalizeToUTCDay(mapping.lastVisibleDate);
            // Include if today <= lastVisibleDate (still visible)
            return today <= lastVisible;
          }
          
          // No restriction - fully visible
          return true;
        });
        
        if (visiblePatientIds.length === 0) {
          return res.json([]);
        }
        
        // Find patients who are visible
        const patients = await Patient.find({
          _id: { $in: visiblePatientIds }
        });
        
        // Get appointment data for sorting
        const allAppointments = await DocAppointment.find({
          doctorId: doctorId,
          patientId: { $in: visiblePatientIds }
        }).lean();
        
        // Group appointments by patient
        const appointmentsByPatient = new Map();
        allAppointments.forEach(apt => {
          const pid = apt.patientId.toString();
          if (!appointmentsByPatient.has(pid)) {
            appointmentsByPatient.set(pid, []);
          }
          appointmentsByPatient.get(pid).push(apt);
        });
        
        // Get medical records for condition severity sorting
        const medicalRecords = await PatientMedicalRecord.find({
          doctorId: doctorId,
          patientId: { $in: visiblePatientIds }
        }).lean();
        
        // Add visibility metadata and sorting data to each patient
        let patientsWithMetadata = patients.map(patient => {
          const patientObj = patient.toObject ? patient.toObject() : patient;
          const mapping = visibilityMap.get(patient._id.toString());
          const patientAppointments = appointmentsByPatient.get(patient._id.toString()) || [];
          
          if (mapping && mapping.lastVisibleDate && !mapping.isRemoved) {
            patientObj.lastVisibleDate = mapping.lastVisibleDate.toISOString();
            patientObj.visibilityRestricted = true;
          } else {
            patientObj.visibilityRestricted = false;
          }
          
          // Add sorting metadata - ONLY use valid appointments
          const now = new Date();
          const pastAppointments = patientAppointments.filter(apt => {
            const aptDate = new Date(apt.appointmentDate);
            return aptDate < now && apt.status === 'completed';
          });
          
          // Use global filter for future appointments (excludes cancelled)
          const futureAppointments = filterValidFutureAppointments(patientAppointments, now);
          
          patientObj._mostRecentAppointment = pastAppointments.length > 0 
            ? new Date(Math.max(...pastAppointments.map(a => new Date(a.appointmentDate))))
            : null;
          patientObj._upcomingAppointment = futureAppointments.length > 0
            ? new Date(futureAppointments[0].appointmentDate)
            : null;
          
          // Set nextAppointment - ONLY from valid future appointments, NEVER from past or canceled
          const nextApptDate = getNextAppointmentDate(patientAppointments, now);
          patientObj.nextAppointment = nextApptDate ? nextApptDate.toISOString() : null;
          
          // Debug logging
          logAppointmentFiltering(patientAppointments, futureAppointments, `patient_list_${patient._id}`);
          console.log(`🔍 [SORT] Patient ${patient._id}: nextAppointment=${patientObj.nextAppointment || 'null'}, upcomingCount=${futureAppointments.length}`);
          
          patientObj._lastMessagingInteraction = null; // TODO: Add when messaging is implemented
          
          // Get condition severity from medical record
          const medicalRecord = medicalRecords.find(mr => mr.patientId.toString() === patient._id.toString());
          patientObj._conditionSeverity = medicalRecord?.diagnosis ? 'medium' : 'low'; // Simplified for now
          
          return patientObj;
        });
        
        // Apply sorting with proper null handling
        console.log(`🔍 [SORT] Sorting ${patientsWithMetadata.length} patients by: ${sortBy}`);
        patientsWithMetadata.sort((a, b) => {
          try {
            switch (sortBy) {
              case 'most_recent':
                // Sort by most recent past appointment (nulls go to end)
                if (!a._mostRecentAppointment && !b._mostRecentAppointment) return 0;
                if (!a._mostRecentAppointment) return 1;
                if (!b._mostRecentAppointment) return -1;
                const dateA = new Date(a._mostRecentAppointment);
                const dateB = new Date(b._mostRecentAppointment);
                if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) return 0;
                return dateB.getTime() - dateA.getTime(); // Descending (most recent first)
              
              case 'upcoming':
                // Sort by upcoming appointment (nulls go to end)
                if (!a._upcomingAppointment && !b._upcomingAppointment) return 0;
                if (!a._upcomingAppointment) return 1;
                if (!b._upcomingAppointment) return -1;
                const upcomingA = new Date(a._upcomingAppointment);
                const upcomingB = new Date(b._upcomingAppointment);
                if (isNaN(upcomingA.getTime()) || isNaN(upcomingB.getTime())) return 0;
                return upcomingA.getTime() - upcomingB.getTime(); // Ascending (earliest first)
              
              case 'alphabetical':
                const nameA = `${a.firstName || ''} ${a.lastName || ''}`.trim().toLowerCase();
                const nameB = `${b.firstName || ''} ${b.lastName || ''}`.trim().toLowerCase();
                if (!nameA && !nameB) return 0;
                if (!nameA) return 1;
                if (!nameB) return -1;
                return nameA.localeCompare(nameB);
              
              case 'condition_severity':
                const severityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
                const severityA = severityOrder[a._conditionSeverity] || 0;
                const severityB = severityOrder[b._conditionSeverity] || 0;
                return severityB - severityA;
              
              case 'last_messaging':
                // TODO: Implement when messaging is available
                return 0;
              
              default:
                return 0;
            }
          } catch (sortError) {
            console.error(`⚠️ [SORT] Error sorting patients:`, sortError);
            return 0;
          }
        });
        
        console.log(`✅ [SORT] Sorted ${patientsWithMetadata.length} patients. Top 3:`);
        patientsWithMetadata.slice(0, 3).forEach((p, idx) => {
          console.log(`   ${idx + 1}. ${p.firstName} ${p.lastName} - nextAppt: ${p.nextAppointment || 'null'}`);
        });
        
        // Remove sorting metadata before sending
        const patientsWithVisibility = patientsWithMetadata.map(p => {
          delete p._mostRecentAppointment;
          delete p._upcomingAppointment;
          delete p._lastMessagingInteraction;
          delete p._conditionSeverity;
          return p;
        });
        
        console.log(`📋 Returning ${patientsWithVisibility.length} visible patients for doctor ${doctorId} (sorted by ${sortBy})`);
        res.json(patientsWithVisibility);
      } catch (appointmentError) {
        console.error('Error filtering patients by appointments:', appointmentError);
        // If filtering fails, return empty array to be safe
        res.json([]);
      }
    } else {
      // No doctorId provided, return all patients (backward compatibility)
      const patients = await Patient.find({});
      res.json(patients);
    }
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
};

const getPatientById = async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) return res.status(404).json({ message: "Patient not found" });
    res.json(patient);
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
};

const getPatientWithMedicalRecord = async (req, res) => {
  try {
    const patientId = req.params.id;
    const patient = await Patient.findById(patientId);
    if (!patient) return res.status(404).json({ message: "Patient not found" });

    // Authorization check
    const { canAccessMedicalRecord, extractUserFromRequest } = require('../services/authorizationService');
    const userInfo = extractUserFromRequest(req);
    
    // Get doctor ID from verified JWT token
    const doctorId = req.doctor?.doctorId || null;
    
    // Check patient visibility for this doctor
    if (doctorId) {
      const visibilityCheck = await checkPatientVisibility(doctorId, patientId);
      if (!visibilityCheck.canView) {
        // Log access attempt (denied)
        await logAccess(doctorId, patientId, 'view_profile', { 
          action: 'access_denied', 
          reason: visibilityCheck.reason 
        });
        return res.status(403).json({
          message: visibilityCheck.reason || "Access denied — patient details are not available after the last shared appointment date.",
          lastVisibleDate: visibilityCheck.lastVisibleDate ? visibilityCheck.lastVisibleDate.toISOString() : null
        });
      }
      
      // Log successful access
      await logAccess(doctorId, patientId, 'view_profile', { action: 'view_medical_record' });
    }

    // Find medical record, prioritizing by doctorId if provided
    let medicalRecord;
    if (doctorId) {
      medicalRecord = await PatientMedicalRecord.findOne({ 
        patientId,
        doctorId: doctorId
      });
    } else {
      medicalRecord = await PatientMedicalRecord.findOne({ patientId });
    }
    
    // Authorization check: verify user can access this medical record
    if (medicalRecord && userInfo) {
      const { userId, userRole } = userInfo;
      if (!canAccessMedicalRecord(medicalRecord, userId, userRole)) {
        return res.status(403).json({
          message: 'Unauthorized: You do not have access to this medical record'
        });
      }
    } else if (medicalRecord && doctorId) {
      // Legacy check: verify doctorId matches
      const recordDoctorId = medicalRecord.doctorId?.toString() || medicalRecord.doctorId;
      if (recordDoctorId !== doctorId.toString()) {
        return res.status(403).json({
          message: 'Unauthorized: You do not have access to this medical record'
        });
      }
    }
    
    // Check if patient has a valid follow-up appointment date
    const hasFollowUpDate = medicalRecord && 
                            medicalRecord.followUpDate && 
                            medicalRecord.followUpDate !== null &&
                            medicalRecord.followUpDate !== '' &&
                            !isNaN(new Date(medicalRecord.followUpDate).getTime());
    
    // If patient doesn't have a follow-up appointment date, find the last appointment with the same doctor
    if (medicalRecord && !hasFollowUpDate) {
      const recordDoctorId = medicalRecord.doctorId || doctorId;
      
      if (recordDoctorId) {
        try {
          // Find the last appointment for this patient-doctor pair
          const lastAppointment = await DocAppointment.findOne({
            patientId: patientId,
            doctorId: recordDoctorId
          })
          .sort({ appointmentDate: -1 }) // Most recent first
          .limit(1);
          
          if (lastAppointment && lastAppointment._id) {
            console.log(`📅 No follow-up date found. Using last appointment: ${lastAppointment.appointmentDate}`);
            
            // Find the medical record associated with this last appointment
            const lastAppointmentMedicalRecord = await PatientMedicalRecord.findOne({
              patientId: patientId,
              appointmentId: lastAppointment._id
            });
            
            // If we found a medical record for the last appointment, use it
            if (lastAppointmentMedicalRecord) {
              console.log(`✅ Found medical record from last appointment: ${lastAppointmentMedicalRecord._id}`);
              medicalRecord = lastAppointmentMedicalRecord;
            } else {
              // If no medical record exists for the last appointment, update the current one to reference it
              if (medicalRecord && medicalRecord._id) {
                medicalRecord.appointmentId = lastAppointment._id;
                await medicalRecord.save();
                console.log(`📝 Updated medical record to reference last appointment`);
              }
            }
          }
        } catch (lastAppointmentError) {
          console.error('Error finding last appointment:', lastAppointmentError);
          // Continue with current medical record if lookup fails
        }
      }
    }
    
    // Calculate next appointment for this patient-doctor pair (ALWAYS, regardless of medical record)
    let nextAppointmentDate = null;
    if (doctorId) {
      try {
        const now = new Date();
        console.log(`🔍 [NEXT_APPT] Searching for next appointment: doctorId=${doctorId}, patientId=${patientId}, now=${now.toISOString()}`);
        
        // Get ALL appointments first for debugging
        const allAppointments = await DocAppointment.find({
          patientId: new mongoose.Types.ObjectId(patientId),
          doctorId: new mongoose.Types.ObjectId(doctorId)
        })
        .sort({ appointmentDate: 1 })
        .lean();
        
        // Use global filter to get valid future appointments
        const validFutureAppointments = filterValidFutureAppointments(allAppointments, now);
        
        // Debug logging
        logAppointmentFiltering(allAppointments, validFutureAppointments, 'patient_detail');
        
        // Get the next appointment date
        nextAppointmentDate = getNextAppointmentDate(allAppointments, now);
        
        if (nextAppointmentDate) {
          console.log(`✅ [NEXT_APPT] Found next appointment: ${nextAppointmentDate.toISOString()}`);
        } else {
          console.log(`ℹ️ [NEXT_APPT] No valid future appointments found`);
        }
        
      } catch (nextApptError) {
        console.error('❌ [NEXT_APPT] Error finding next appointment:', nextApptError);
        // Continue without next appointment if lookup fails
      }
    }
    
    // If medical record doesn't have a follow-up date, use next appointment
    // BUT only if the follow-up date is from a valid (non-cancelled) appointment
    if (medicalRecord && !hasFollowUpDate && nextAppointmentDate) {
      try {
        // Verify the follow-up date is from a valid future appointment (not cancelled)
        const now = new Date();
        if (nextAppointmentDate > now) {
          medicalRecord.followUpDate = nextAppointmentDate;
          medicalRecord.followUpRequired = true;
          console.log(`📅 [FOLLOWUP] Set follow-up date from valid next appointment: ${nextAppointmentDate.toLocaleDateString()}`);
        } else {
          console.log(`⚠️ [FOLLOWUP] Next appointment date is not in the future, not setting follow-up`);
        }
      } catch (followUpError) {
        console.error('❌ [FOLLOWUP] Error setting follow-up date:', followUpError);
      }
    } else if (medicalRecord && hasFollowUpDate) {
      // Verify existing follow-up date is from a valid appointment
      try {
        const followUpDate = new Date(medicalRecord.followUpDate);
        const now = new Date();
        
        // Check if the follow-up date corresponds to a cancelled appointment
        if (doctorId) {
          const matchingAppointment = await DocAppointment.findOne({
            patientId: new mongoose.Types.ObjectId(patientId),
            doctorId: new mongoose.Types.ObjectId(doctorId),
            appointmentDate: {
              $gte: new Date(followUpDate.getTime() - 24 * 60 * 60 * 1000), // 1 day before
              $lte: new Date(followUpDate.getTime() + 24 * 60 * 60 * 1000)  // 1 day after
            }
          }).lean();
          
          if (matchingAppointment && isCancelledStatus(matchingAppointment.status)) {
            console.log(`⚠️ [FOLLOWUP] Follow-up date ${followUpDate.toLocaleDateString()} is from cancelled appointment, clearing it`);
            medicalRecord.followUpDate = null;
            medicalRecord.followUpRequired = false;
          } else if (followUpDate <= now) {
            console.log(`⚠️ [FOLLOWUP] Follow-up date ${followUpDate.toLocaleDateString()} is in the past, clearing it`);
            medicalRecord.followUpDate = null;
            medicalRecord.followUpRequired = false;
          }
        }
      } catch (followUpCheckError) {
        console.error('⚠️ [FOLLOWUP] Error checking follow-up date:', followUpCheckError);
      }
    }
    
    // Check if medical record has an appointment and if access should be restricted
    let finalMedicalRecord = medicalRecord;
    
    if (medicalRecord && medicalRecord.appointmentId) {
      try {
        // Fetch the appointment to check the date
        const appointment = await DocAppointment.findById(medicalRecord.appointmentId);
        
        if (appointment && appointment.appointmentDate) {
          // Check if appointment date has passed
          if (hasAppointmentDatePassed(appointment.appointmentDate)) {
            console.log(`🔒 Restricting access to medical record ${medicalRecord._id} - appointment date (${appointment.appointmentDate}) has passed`);
            // Return restricted version
            finalMedicalRecord = createRestrictedMedicalRecord(medicalRecord);
          } else {
            console.log(`✅ Full access granted to medical record ${medicalRecord._id} - appointment date (${appointment.appointmentDate}) has not passed`);
          }
        }
      } catch (appointmentError) {
        console.error('Error checking appointment date:', appointmentError);
        // If appointment lookup fails, allow access (fail open for existing functionality)
        // This ensures we don't break existing features
      }
    }
    
    // Convert to plain object to ensure proper JSON serialization
    let responseData = {
      patient: patient ? (patient.toObject ? patient.toObject() : patient) : null,
      medicalRecord: finalMedicalRecord ? (finalMedicalRecord.toObject ? finalMedicalRecord.toObject() : finalMedicalRecord) : null,
      nextAppointment: nextAppointmentDate ? nextAppointmentDate.toISOString() : null
    };

    // Translate medical record fields for patient's language preference (after decryption)
    if (responseData.medicalRecord && !responseData.medicalRecord._restricted) {
      const lang = await getPatientLanguage(patientId);
      if (lang === 'ur') {
        const mr = responseData.medicalRecord;
        const fieldsToTranslate = {};
        if (mr.diagnosis && typeof mr.diagnosis === 'string' && mr.diagnosis.trim()) {
          fieldsToTranslate.diagnosis = mr.diagnosis;
        }
        if (mr.notes && typeof mr.notes === 'string' && mr.notes.trim()) {
          fieldsToTranslate.notes = mr.notes;
        }
        // Translate array fields: join → translate → split
        if (Array.isArray(mr.symptoms) && mr.symptoms.length > 0) {
          fieldsToTranslate.symptoms = mr.symptoms.join(', ');
        }
        if (Array.isArray(mr.medications) && mr.medications.length > 0) {
          fieldsToTranslate.medications = mr.medications.join(', ');
        }
        if (Array.isArray(mr.allergies) && mr.allergies.length > 0) {
          fieldsToTranslate.allergies = mr.allergies.join(', ');
        }

        if (Object.keys(fieldsToTranslate).length > 0) {
          const translated = await getOrCreateTranslation(
            'PatientMedicalRecord',
            mr._id,
            fieldsToTranslate,
            lang
          );
          const updated = { ...mr };
          if (translated.diagnosis !== undefined) updated.diagnosis = translated.diagnosis;
          if (translated.notes !== undefined) updated.notes = translated.notes;
          if (translated.symptoms !== undefined) {
            updated.symptoms = translated.symptoms.split(',').map((s) => s.trim()).filter(Boolean);
          }
          if (translated.medications !== undefined) {
            updated.medications = translated.medications.split(',').map((s) => s.trim()).filter(Boolean);
          }
          if (translated.allergies !== undefined) {
            updated.allergies = translated.allergies.split(',').map((s) => s.trim()).filter(Boolean);
          }
          responseData.medicalRecord = updated;
        }
      }
    }
    
    // Also add nextAppointment to patient object for convenience
    if (responseData.patient) {
      responseData.patient.nextAppointment = nextAppointmentDate ? nextAppointmentDate.toISOString() : null;
    }
    
    console.log(`📤 [NEXT_APPT] Sending response - nextAppointment: ${nextAppointmentDate ? nextAppointmentDate.toISOString() : 'null'}`);
    
    // If medicalRecord is a Mongoose document, ensure followUpDate is included even if dynamically added
    if (finalMedicalRecord && finalMedicalRecord.followUpDate && responseData.medicalRecord) {
      // Ensure the dynamically added followUpDate is included in the response
      responseData.medicalRecord.followUpDate = finalMedicalRecord.followUpDate;
    }
    
    // Ensure follow-up date is properly serialized as ISO string if it exists
    if (responseData.medicalRecord && responseData.medicalRecord.followUpDate) {
      try {
        const date = new Date(responseData.medicalRecord.followUpDate);
        if (!isNaN(date.getTime())) {
          responseData.medicalRecord.followUpDate = date.toISOString();
        } else {
          console.warn('⚠️ Invalid follow-up date, removing from response');
          responseData.medicalRecord.followUpDate = null;
        }
      } catch (e) {
        console.error('Error serializing follow-up date:', e);
        responseData.medicalRecord.followUpDate = null;
      }
    }
    
    // Debug log to verify follow-up date is in response
    console.log(`📤 Sending response - Follow-up date: ${responseData.medicalRecord?.followUpDate || 'null'}`);
    
    res.json(responseData);
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
};

/**
 * Get patient activity timeline filtered by visibility rules
 * Only shows entries up to last_visible_date
 * Merges data from appointments, medical records, and activity logs
 */
const getPatientTimeline = async (req, res) => {
  try {
    console.log('📋 [TIMELINE] Starting timeline fetch...');
    const patientId = req.params.id;
    const doctorId = req.doctor?.doctorId;

    if (!doctorId) {
      console.log('❌ [TIMELINE] Missing doctorId');
      return res.status(400).json({ message: "doctorId is required" });
    }
    
    if (!patientId) {
      console.log('❌ [TIMELINE] Missing patientId');
      return res.status(400).json({ message: "patientId is required" });
    }
    
    console.log(`📋 [TIMELINE] Fetching timeline for doctorId=${doctorId}, patientId=${patientId}`);
    
    // Check patient visibility
    let visibilityCheck;
    try {
      visibilityCheck = await checkPatientVisibility(doctorId, patientId);
      console.log(`📋 [TIMELINE] Visibility check: canView=${visibilityCheck.canView}`);
    } catch (visibilityError) {
      console.error('❌ [TIMELINE] Error checking visibility:', visibilityError);
      return res.status(500).json({ message: "Error checking patient visibility", error: visibilityError.message });
    }
    
    if (!visibilityCheck.canView) {
      await logAccess(doctorId, patientId, 'view_timeline', { action: 'access_denied' });
      console.log('❌ [TIMELINE] Access denied');
      return res.status(403).json({
        message: visibilityCheck.reason || "Access denied — patient timeline is not available after the last shared appointment date.",
        lastVisibleDate: visibilityCheck.lastVisibleDate ? visibilityCheck.lastVisibleDate.toISOString() : null
      });
    }
    
    // Log access
    try {
      await logAccess(doctorId, patientId, 'view_timeline', { action: 'view_timeline' });
    } catch (logError) {
      console.error('⚠️ [TIMELINE] Error logging access (non-fatal):', logError);
    }
    
    // Get last visible date (end of day UTC)
    const lastVisibleDate = visibilityCheck.lastVisibleDate 
      ? new Date(visibilityCheck.lastVisibleDate)
      : null;
    
    // If lastVisibleDate exists, set to end of that day (23:59:59.999 UTC)
    let maxDate = null;
    if (lastVisibleDate) {
      maxDate = new Date(lastVisibleDate);
      maxDate.setUTCHours(23, 59, 59, 999);
      console.log(`📋 [TIMELINE] Max date filter: ${maxDate.toISOString()}`);
    } else {
      console.log('📋 [TIMELINE] No max date filter (fully visible)');
    }
    
    const timelineEntries = [];
    let appointments = []; // Store appointments for later use in medical records section
    
    // 1. Get appointments (past appointments only, filtered by last_visible_date)
    try {
      console.log('📋 [TIMELINE] Fetching appointments...');
      const appointmentQuery = {
        doctorId: new mongoose.Types.ObjectId(doctorId),
        patientId: new mongoose.Types.ObjectId(patientId),
        status: { $in: ['completed', 'canceled'] }
      };
      
      if (maxDate) {
        appointmentQuery.appointmentDate = { $lte: maxDate };
      }
      
      appointments = await DocAppointment.find(appointmentQuery)
        .sort({ appointmentDate: -1 })
        .lean();
      
      console.log(`📋 [TIMELINE] Found ${appointments.length} appointments`);
      
      appointments.forEach(apt => {
        try {
          if (!apt.appointmentDate) {
            console.warn(`⚠️ [TIMELINE] Appointment ${apt._id} has no appointmentDate, skipping`);
            return;
          }
          
          const aptDate = new Date(apt.appointmentDate);
          if (isNaN(aptDate.getTime())) {
            console.warn(`⚠️ [TIMELINE] Invalid appointment date for ${apt._id}, skipping`);
            return;
          }
          
          timelineEntries.push({
            id: apt._id.toString(),
            type: 'appointment',
            date: aptDate.toISOString(),
            title: `Appointment - ${apt.type || 'In-Person'}`,
            description: apt.reason || apt.notes || 'No description',
            consultationType: apt.type || 'In-Person',
            status: apt.status,
            canceledBy: apt.canceledBy || null,
            canceledAt: apt.canceledAt ? new Date(apt.canceledAt).toISOString() : null,
            hasNotes: !!apt.notes,
            appointmentId: apt._id.toString()
          });
        } catch (aptError) {
          console.error(`⚠️ [TIMELINE] Error processing appointment ${apt._id}:`, aptError);
        }
      });
    } catch (appointmentError) {
      console.error('❌ [TIMELINE] Error fetching appointments:', appointmentError);
      // Continue with other data sources
    }
    
    // 2. Get medical records (prescriptions, notes, diagnosis, etc.) filtered by last_visible_date
    try {
      console.log('📋 [TIMELINE] Fetching medical records...');
      const medicalRecordQuery = {
        doctorId: new mongoose.Types.ObjectId(doctorId),
        patientId: new mongoose.Types.ObjectId(patientId)
      };
      
      const medicalRecords = await PatientMedicalRecord.find(medicalRecordQuery)
        .sort({ createdAt: -1 })
        .lean();
      
      console.log(`📋 [TIMELINE] Found ${medicalRecords.length} medical records`);
      
      medicalRecords.forEach(record => {
        try {
          if (!record.createdAt) {
            console.warn(`⚠️ [TIMELINE] Medical record ${record._id} has no createdAt, skipping`);
            return;
          }
          
          const recordDate = new Date(record.createdAt);
          if (isNaN(recordDate.getTime())) {
            console.warn(`⚠️ [TIMELINE] Invalid createdAt for medical record ${record._id}, skipping`);
            return;
          }
          
          // Only include if within visibility window
          if (maxDate && recordDate > maxDate) {
            return;
          }
          
          // Check if associated appointment is within visibility window
          if (record.appointmentId) {
            try {
              // Try to find the appointment to check its date
              const associatedAppt = appointments.find(a => a._id.toString() === record.appointmentId.toString());
              if (associatedAppt && associatedAppt.appointmentDate) {
                const aptDate = new Date(associatedAppt.appointmentDate);
                if (maxDate && aptDate > maxDate) {
                  return; // Skip if appointment is outside visibility window
                }
              }
            } catch (apptCheckError) {
              console.warn(`⚠️ [TIMELINE] Error checking associated appointment for record ${record._id}:`, apptCheckError);
            }
          }
          
          // Add diagnosis entry if diagnosis exists
          if (record.diagnosis && record.diagnosis.trim()) {
            timelineEntries.push({
              id: `diagnosis_${record._id}`,
              type: 'medical_record',
              date: recordDate.toISOString(),
              title: 'Diagnosis Recorded',
              description: record.diagnosis.substring(0, 200) + (record.diagnosis.length > 200 ? '...' : ''),
              diagnosis: record.diagnosis,
              appointmentId: record.appointmentId?.toString() || null
            });
          }
          
          // Add symptoms entry if symptoms exist
          if (record.symptoms && Array.isArray(record.symptoms) && record.symptoms.length > 0) {
            timelineEntries.push({
              id: `symptoms_${record._id}`,
              type: 'medical_record',
              date: recordDate.toISOString(),
              title: 'Symptoms Recorded',
              description: `Symptoms: ${record.symptoms.join(', ')}`,
              symptoms: record.symptoms,
              appointmentId: record.appointmentId?.toString() || null
            });
          }
          
          // Add prescription entry if prescriptions exist
          if (record.prescriptions && Array.isArray(record.prescriptions) && record.prescriptions.length > 0) {
            timelineEntries.push({
              id: `prescription_${record._id}`,
              type: 'prescription',
              date: recordDate.toISOString(),
              title: 'Prescription Issued',
              description: `${record.prescriptions.length} medication(s) prescribed: ${record.prescriptions.join(', ')}`,
              prescriptions: record.prescriptions,
              appointmentId: record.appointmentId?.toString() || null
            });
          }
          
          // Add medications entry if medications exist
          if (record.medications && Array.isArray(record.medications) && record.medications.length > 0) {
            timelineEntries.push({
              id: `medications_${record._id}`,
              type: 'medical_record',
              date: recordDate.toISOString(),
              title: 'Medications Recorded',
              description: `Medications: ${record.medications.join(', ')}`,
              medications: record.medications,
              appointmentId: record.appointmentId?.toString() || null
            });
          }
          
          // Add vaccinations entry if vaccinations exist
          if (record.vaccinations && Array.isArray(record.vaccinations) && record.vaccinations.length > 0) {
            timelineEntries.push({
              id: `vaccinations_${record._id}`,
              type: 'medical_record',
              date: recordDate.toISOString(),
              title: 'Vaccinations Recorded',
              description: `Vaccinations: ${record.vaccinations.join(', ')}`,
              vaccinations: record.vaccinations,
              appointmentId: record.appointmentId?.toString() || null
            });
          }
          
          // Add vitals entry if vitals exist
          if (record.vitals && typeof record.vitals === 'object' && Object.keys(record.vitals).length > 0) {
            timelineEntries.push({
              id: `vitals_${record._id}`,
              type: 'medical_record',
              date: recordDate.toISOString(),
              title: 'Vitals Recorded',
              description: `Vitals recorded: ${JSON.stringify(record.vitals)}`,
              vitals: record.vitals,
              appointmentId: record.appointmentId?.toString() || null
            });
          }
          
          // Add notes entry if notes exist
          if (record.notes && record.notes.trim()) {
            timelineEntries.push({
              id: `notes_${record._id}`,
              type: 'notes',
              date: recordDate.toISOString(),
              title: 'Notes Added',
              description: record.notes.substring(0, 200) + (record.notes.length > 200 ? '...' : ''),
              notes: record.notes,
              appointmentId: record.appointmentId?.toString() || null
            });
          }
          
          // Add follow-up entry if follow-up is required
          if (record.followUpRequired && record.followUpDate) {
            try {
              const followUpDate = new Date(record.followUpDate);
              if (!isNaN(followUpDate.getTime())) {
                timelineEntries.push({
                  id: `followup_${record._id}`,
                  type: 'follow_up',
                  date: followUpDate.toISOString(),
                  title: 'Follow-up Scheduled',
                  description: `Follow-up required on ${followUpDate.toLocaleDateString()}`,
                  followUpDate: followUpDate.toISOString(),
                  appointmentId: record.appointmentId?.toString() || null
                });
              }
            } catch (followUpError) {
              console.warn(`⚠️ [TIMELINE] Error processing follow-up date for record ${record._id}:`, followUpError);
            }
          }
        } catch (recordError) {
          console.error(`⚠️ [TIMELINE] Error processing medical record ${record._id}:`, recordError);
        }
      });
    } catch (medicalRecordError) {
      console.error('❌ [TIMELINE] Error fetching medical records:', medicalRecordError);
      // Continue with other data sources
    }
    
    // 3. Get appointment activities (cancellations, reschedules)
    try {
      console.log('📋 [TIMELINE] Fetching appointment activities...');
      // PatientAppointmentActivity uses String IDs, not ObjectId
      const activityQuery = {
        doctorId: doctorId.toString(),
        patientId: patientId.toString()
      };
      
      const activities = await PatientAppointmentActivity.find(activityQuery)
        .sort({ createdAt: -1 })
        .lean();
      
      console.log(`📋 [TIMELINE] Found ${activities.length} appointment activities`);
      
      activities.forEach(activity => {
        try {
          const activityDate = activity.createdAt 
            ? new Date(activity.createdAt)
            : (activity.appointmentDate ? new Date(activity.appointmentDate) : null);
          
          if (!activityDate || isNaN(activityDate.getTime())) {
            console.warn(`⚠️ [TIMELINE] Invalid date for activity ${activity._id}, skipping`);
            return;
          }
          
          // Only include if within visibility window
          if (maxDate && activityDate > maxDate) {
            return;
          }
          
          if (activity.action === 'rescheduled' || activity.action === 'deleted' || activity.action === 'booked') {
            let title = 'Appointment Activity';
            if (activity.action === 'rescheduled') {
              title = 'Appointment Rescheduled';
            } else if (activity.action === 'deleted') {
              title = 'Appointment Canceled';
            } else if (activity.action === 'booked') {
              title = 'Appointment Booked';
            }
            
            timelineEntries.push({
              id: `activity_${activity._id}`,
              type: 'activity',
              date: activityDate.toISOString(),
              title: title,
              description: activity.notes || `${activity.action} appointment`,
              action: activity.action,
              previousDate: activity.previousDate ? new Date(activity.previousDate).toISOString() : null,
              previousTime: activity.previousTime || null,
              appointmentId: activity.appointmentId?.toString() || null
            });
          }
        } catch (activityError) {
          console.error(`⚠️ [TIMELINE] Error processing activity ${activity._id}:`, activityError);
        }
      });
    } catch (activityError) {
      console.error('❌ [TIMELINE] Error fetching appointment activities:', activityError);
      // Continue - activities are optional
    }
    
    // 4. Get prescriptions (from Patient_Prescription collection)
    try {
      console.log('📋 [TIMELINE] Fetching prescriptions...');
      const PatientPrescription = require("../models/PatientPrescriptionModel");
      
      const prescriptions = await PatientPrescription.find({
        patientId: new mongoose.Types.ObjectId(patientId),
        doctorId: new mongoose.Types.ObjectId(doctorId),
        isDeleted: false
      })
      .sort({ createdAt: -1 })
      .lean();
      
      console.log(`📋 [TIMELINE] Found ${prescriptions.length} prescriptions`);
      
      prescriptions.forEach(prescription => {
        try {
          const prescriptionDate = prescription.createdAt 
            ? new Date(prescription.createdAt)
            : (prescription.startDate ? new Date(prescription.startDate) : null);
          
          if (!prescriptionDate || isNaN(prescriptionDate.getTime())) {
            console.warn(`⚠️ [TIMELINE] Invalid date for prescription ${prescription._id}, skipping`);
            return;
          }
          
          // Only include if within visibility window
          if (maxDate && prescriptionDate > maxDate) {
            return;
          }
          
          // Prescription created
          timelineEntries.push({
            id: `prescription_${prescription._id}`,
            type: 'prescription',
            date: prescriptionDate.toISOString(),
            title: 'Prescription Created',
            description: `${prescription.medicationName} (${prescription.dosage}) - ${prescription.frequency}`,
            medicationName: prescription.medicationName,
            dosage: prescription.dosage,
            frequency: prescription.frequency,
            instructions: prescription.instructions,
            appointmentId: prescription.appointmentId?.toString() || null,
            prescriptionId: prescription._id.toString()
          });
          
          // If prescription was edited (has previousVersionId), add edit entry
          if (prescription.previousVersionId) {
            timelineEntries.push({
              id: `prescription_edit_${prescription._id}`,
              type: 'prescription_edited',
              date: prescription.updatedAt ? new Date(prescription.updatedAt).toISOString() : prescriptionDate.toISOString(),
              title: 'Prescription Updated',
              description: `Prescription updated: ${prescription.medicationName}`,
              medicationName: prescription.medicationName,
              previousVersionId: prescription.previousVersionId.toString(),
              appointmentId: prescription.appointmentId?.toString() || null,
              prescriptionId: prescription._id.toString()
            });
          }
        } catch (prescriptionError) {
          console.error(`⚠️ [TIMELINE] Error processing prescription ${prescription._id}:`, prescriptionError);
        }
      });
    } catch (prescriptionError) {
      console.error('❌ [TIMELINE] Error fetching prescriptions:', prescriptionError);
      // Continue - prescriptions are optional
    }
    
    // 5. Get e-prescriptions (from E_Prescription collection)
    try {
      console.log('📋 [TIMELINE] Fetching e-prescriptions...');
      const EPrescription = require("../models/EPrescriptionModel");
      
      const ePrescriptions = await EPrescription.find({
        patientId: new mongoose.Types.ObjectId(patientId),
        doctorId: new mongoose.Types.ObjectId(doctorId),
        isDeleted: false
      })
      .sort({ createdAt: -1 })
      .lean();
      
      console.log(`📋 [TIMELINE] Found ${ePrescriptions.length} e-prescriptions`);
      
      ePrescriptions.forEach(ePrescription => {
        try {
          const ePrescriptionDate = ePrescription.createdAt 
            ? new Date(ePrescription.createdAt)
            : new Date();
          
          if (isNaN(ePrescriptionDate.getTime())) {
            console.warn(`⚠️ [TIMELINE] Invalid date for e-prescription ${ePrescription._id}, skipping`);
            return;
          }
          
          // Only include if within visibility window
          if (maxDate && ePrescriptionDate > maxDate) {
            return;
          }
          
          // E-prescription created
          timelineEntries.push({
            id: `eprescription_${ePrescription._id}`,
            type: 'e_prescription',
            date: ePrescriptionDate.toISOString(),
            title: 'E-Prescription Created',
            description: `E-prescription with ${ePrescription.medications?.length || 0} medication(s)`,
            medicationCount: ePrescription.medications?.length || 0,
            diagnosis: ePrescription.diagnosis,
            signedByDoctor: ePrescription.signedByDoctor,
            signedAt: ePrescription.signedAt ? new Date(ePrescription.signedAt).toISOString() : null,
            appointmentId: ePrescription.appointmentId?.toString() || null,
            ePrescriptionId: ePrescription._id.toString()
          });
          
          // If signed, add signed entry
          if (ePrescription.signedByDoctor && ePrescription.signedAt) {
            timelineEntries.push({
              id: `eprescription_signed_${ePrescription._id}`,
              type: 'e_prescription_signed',
              date: new Date(ePrescription.signedAt).toISOString(),
              title: 'E-Prescription Signed',
              description: 'E-prescription signed by doctor',
              appointmentId: ePrescription.appointmentId?.toString() || null,
              ePrescriptionId: ePrescription._id.toString()
            });
          }
        } catch (ePrescriptionError) {
          console.error(`⚠️ [TIMELINE] Error processing e-prescription ${ePrescription._id}:`, ePrescriptionError);
        }
      });
    } catch (ePrescriptionError) {
      console.error('❌ [TIMELINE] Error fetching e-prescriptions:', ePrescriptionError);
      // Continue - e-prescriptions are optional
    }
    
    // 6. Get medication adherence logs from prescriptions
    try {
      console.log('📋 [TIMELINE] Fetching medication adherence logs...');
      const PatientPrescription = require("../models/PatientPrescriptionModel");
      
      const prescriptionsWithLogs = await PatientPrescription.find({
        patientId: new mongoose.Types.ObjectId(patientId),
        doctorId: new mongoose.Types.ObjectId(doctorId),
        isDeleted: false,
        adherenceLog: { $exists: true, $ne: [] }
      })
      .lean();
      
      prescriptionsWithLogs.forEach(prescription => {
        if (!prescription.adherenceLog || prescription.adherenceLog.length === 0) {
          return;
        }
        
        prescription.adherenceLog.forEach(log => {
          try {
            const logDate = log.timestamp 
              ? new Date(log.timestamp)
              : (log.date ? new Date(log.date) : null);
            
            if (!logDate || isNaN(logDate.getTime())) {
              return;
            }
            
            // Only include if within visibility window
            if (maxDate && logDate > maxDate) {
              return;
            }
            
            timelineEntries.push({
              id: `adherence_${prescription._id}_${log.timestamp || log.date}`,
              type: log.taken ? 'medication_taken' : 'medication_skipped',
              date: logDate.toISOString(),
              title: log.taken ? 'Medication Taken' : 'Medication Skipped',
              description: `${prescription.medicationName} ${log.taken ? 'taken' : 'skipped'} at ${log.time}`,
              medicationName: prescription.medicationName,
              time: log.time,
              taken: log.taken,
              appointmentId: prescription.appointmentId?.toString() || null,
              prescriptionId: prescription._id.toString()
            });
          } catch (logError) {
            console.error(`⚠️ [TIMELINE] Error processing adherence log:`, logError);
          }
        });
      });
    } catch (adherenceError) {
      console.error('❌ [TIMELINE] Error fetching adherence logs:', adherenceError);
      // Continue - adherence logs are optional
    }
    
    // Sort all entries by date (reverse chronological - most recent first)
    timelineEntries.sort((a, b) => {
      try {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
          return 0;
        }
        return dateB.getTime() - dateA.getTime();
      } catch (sortError) {
        console.warn('⚠️ [TIMELINE] Error sorting timeline entries:', sortError);
        return 0;
      }
    });
    
    console.log(`✅ [TIMELINE] Returning ${timelineEntries.length} timeline entries`);
    
    res.json({
      success: true,
      timeline: timelineEntries,
      lastVisibleDate: lastVisibleDate ? lastVisibleDate.toISOString().split('T')[0] : null
    });
  } catch (err) {
    console.error('❌ [TIMELINE] Fatal error fetching patient timeline:', err);
    console.error('❌ [TIMELINE] Error stack:', err.stack);
    res.status(500).json({ 
      message: "Server Error", 
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};

/**
 * Diagnostic endpoint for developers to debug visibility and access logs
 */
const getDiagnosticInfo = async (req, res) => {
  try {
    const doctorId = req.query.doctorId;
    const patientId = req.query.patientId;
    const limit = parseInt(req.query.limit) || 50;
    
    if (!doctorId || !patientId) {
      return res.status(400).json({ 
        message: "Both doctorId and patientId are required" 
      });
    }
    
    // Get visibility mapping
    const mapping = await DoctorPatientMapping.findOne({ doctorId, patientId }).lean();
    
    // Get access logs (last N entries)
    const accessLogs = mapping && mapping.accessLog 
      ? mapping.accessLog
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .slice(0, limit)
      : [];
    
    // Get all appointments for this doctor-patient pair
    const appointments = await DocAppointment.find({
      doctorId: new mongoose.Types.ObjectId(doctorId),
      patientId: new mongoose.Types.ObjectId(patientId)
    })
    .sort({ appointmentDate: 1 })
    .lean();
    
    // Compute visibility status
    const visibilityCheck = await checkPatientVisibility(doctorId, patientId);
    
    res.json({
      success: true,
      visibility: {
        canView: visibilityCheck.canView,
        reason: visibilityCheck.reason,
        lastVisibleDate: visibilityCheck.lastVisibleDate ? visibilityCheck.lastVisibleDate.toISOString() : null,
        isRemoved: mapping?.isRemoved || false,
        lastUpdatedBy: mapping?.lastUpdatedBy || null,
        lastUpdatedReason: mapping?.lastUpdatedReason || null
      },
      appointments: {
        total: appointments.length,
        completed: appointments.filter(a => a.status === 'completed').length,
        upcoming: appointments.filter(a => a.status === 'upcoming' || a.status === 'pending_reschedule').length,
        canceled: appointments.filter(a => a.status === 'canceled').length,
        list: appointments.map(a => ({
          id: a._id.toString(),
          date: a.appointmentDate,
          status: a.status,
          type: a.type,
          canceledBy: a.canceledBy,
          canceledAt: a.canceledAt
        }))
      },
      accessLogs: accessLogs.map(log => ({
        timestamp: log.timestamp,
        purpose: log.purpose,
        metadata: log.metadata
      }))
    });
  } catch (err) {
    console.error('Error fetching diagnostic info:', err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
};

/**
 * GET /api/doctor/patients/:patientId/health-records
 * Returns OCR-scanned health records for a patient.
 * Requires a valid doctor JWT (req.doctor.doctorId) and a positive visibility check.
 * Never returns base64 image data — only HTTPS Cloudinary URLs.
 */
const getPatientHealthRecords = async (req, res) => {
  try {
    const doctorId = req.doctor.doctorId;
    const { patientId } = req.params;

    if (!patientId) {
      return res.status(400).json({ success: false, message: 'patientId is required' });
    }

    // Enforce visibility: doctor must have an active relationship with this patient
    const visibility = await checkPatientVisibility(doctorId, patientId);
    if (!visibility.canView) {
      return res.status(403).json({
        success: false,
        message: visibility.reason || 'Access denied',
      });
    }

    const HealthRecordOcr = require('../models/HealthRecordOcrModel');
    const records = await HealthRecordOcr.find({ userId: patientId })
      .sort({ createdAt: -1 })
      .lean();

    const safeRecords = records.map((r) => ({
      _id: r._id,
      ocrText: r.ocrText || '',
      simplifiedText: r.simplifiedText || '',
      wasSimplified: !!r.wasSimplified,
      language: r.language || 'english',
      sourceFileName: r.sourceFileName || '',
      createdAt: r.createdAt,
      // Only include imageUrl if it is a real HTTPS URL — never base64 blobs
      ...(r.imageUrl && r.imageUrl.startsWith('https://') ? { imageUrl: r.imageUrl } : {}),
    }));

    return res.json({ success: true, records: safeRecords });
  } catch (err) {
    console.error('getPatientHealthRecords error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load health records' });
  }
};

module.exports = {
  getPatients,
  getPatientById,
  getPatientWithMedicalRecord,
  getPatientTimeline,
  getDiagnosticInfo,
  getPatientHealthRecords,
};

