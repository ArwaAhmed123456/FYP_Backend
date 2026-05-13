const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const DoctorAppointmentModel = require('../models/DoctorAppointmentModel');
const { getAppointmentsByPatient, deleteAppointment } = require('../controller/docAppointmentController');
const { getCollection } = require('../services/mongodb');

// Helper function to convert ObjectId to string and populate patient info
const convertAppointment = async (appointment) => {
  if (!appointment) return appointment;
  
  // Convert _id to string
  if (appointment._id && appointment._id.toString) {
    appointment._id = appointment._id.toString();
  }
  
  // Convert doctorId and patientId to strings
  if (appointment.doctorId && appointment.doctorId.toString) {
    appointment.doctorId = appointment.doctorId.toString();
  }
  if (appointment.patientId && appointment.patientId.toString) {
    appointment.patientId = appointment.patientId.toString();
  }
  
  // Populate patient information if patientId exists
  if (appointment.patientId) {
    try {
      const patientsCollection = await getCollection('Patient');
      const patient = await patientsCollection.findOne({ 
        _id: new ObjectId(appointment.patientId) 
      });
      
      if (patient) {
        appointment.patientInfo = {
          _id: patient._id.toString(),
          firstName: patient.firstName || '',
          lastName: patient.lastName || '',
          name: `${patient.firstName || ''} ${patient.lastName || ''}`.trim(),
          age: patient.Age || 0,
          gender: patient.gender || '',
          phone: patient.phone || '',
          emailAddress: patient.emailAddress || ''
        };
      }
    } catch (error) {
      console.error('Error populating patient info:', error);
    }
  }
  
  return appointment;
};

// Prevent missing patientId
router.get('/patient', (req, res) => {
  return res.status(400).json({
    success: false,
    message: "❌ Patient ID is required in the URL. Example: /api/appointments/patient/<patientId>"
  });
});

// Get appointments by patient ID
router.get('/patient/:patientId', getAppointmentsByPatient);

// Get all appointments for a doctor
router.get('/doctor/:doctorId', async (req, res) => {
  try {
    const { doctorId } = req.params;
    console.log(`\n📅 ===== Fetching appointments for doctorId: ${doctorId} =====`);
    console.log(`   doctorId type: ${typeof doctorId}`);
    
    // First, let's check if there are ANY appointments in the collection
    const { getCollection } = require('../services/mongodb');
    const appointmentsCollection = await getCollection('Doctor_appointment');
    const totalCount = await appointmentsCollection.countDocuments({});
    console.log(`   Total appointments in collection: ${totalCount}`);
    
    // Try direct query to see what's happening
    const { ObjectId } = require('mongodb');
    const doctorObjectId = new ObjectId(doctorId);
    console.log(`   Converted to ObjectId: ${doctorObjectId}`);
    
    const directQuery = await appointmentsCollection.find({ doctorId: doctorObjectId }).toArray();
    console.log(`   Direct query found: ${directQuery.length} appointments`);
    
    const appointments = await DoctorAppointmentModel.find({ doctorId: doctorObjectId }).lean();
    console.log(`   Model method found: ${appointments.length} appointments`);
    
    // Convert and populate all appointments
    const convertedAppointments = await Promise.all(
      appointments.map(convertAppointment)
    );
    
    console.log(`   Converted appointments: ${convertedAppointments.length}`);
    console.log(`===== End appointment fetch =====\n`);
    
    res.json({
      success: true,
      appointments: convertedAppointments,
      count: convertedAppointments.length,
      message: convertedAppointments.length > 0 
        ? `Found ${convertedAppointments.length} appointment(s)` 
        : 'No appointments found for this doctor'
    });
  } catch (error) {
    console.error('❌ Get appointments by doctor error:', error);
    console.error('   Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch appointments',
      error: error.message
    });
  }
});

// Get appointment by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const appointment = await DoctorAppointmentModel.findById(id).lean();
    
    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }
    
    const convertedAppointment = await convertAppointment(appointment);
    
    res.json({
      success: true,
      appointment: convertedAppointment
    });
  } catch (error) {
    console.error('Get appointment by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch appointment',
      error: error.message
    });
  }
});

// Create a new appointment
router.post('/', async (req, res) => {
  try {
    const { doctorId, patientId, appointment_date, appointment_time, type, reason, notes } = req.body;

    if (!doctorId || !patientId || !appointment_date) {
      return res.status(400).json({ success: false, message: 'doctorId, patientId and appointment_date are required' });
    }

    // Build appointmentDate from date + optional time string
    let appointmentDate;
    if (appointment_time) {
      appointmentDate = new Date(`${appointment_date}T${appointment_time}:00`);
    } else {
      appointmentDate = new Date(appointment_date);
    }

    if (isNaN(appointmentDate.getTime())) {
      return res.status(400).json({ success: false, message: `Invalid date/time: ${appointment_date} ${appointment_time || ''}` });
    }

    const appointment = await DoctorAppointmentModel.create({
      doctorId: new ObjectId(doctorId),
      patientId: new ObjectId(patientId),
      appointmentDate,
      type: type || 'In-Person',
      reason: reason || '',
      notes: notes || '',
      status: 'upcoming',
    });

    const convertedAppointment = await convertAppointment(appointment.toObject());

    res.status(201).json({
      success: true,
      message: 'Appointment created successfully',
      appointment: convertedAppointment,
    });
  } catch (error) {
    console.error('Create appointment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create appointment',
      error: error.message,
    });
  }
});

// Update appointment
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const appointment = await DoctorAppointmentModel.findByIdAndUpdate(
      id, updateData, { new: true }
    ).lean();

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    const convertedAppointment = await convertAppointment(appointment);
    
    res.json({
      success: true,
      message: 'Appointment updated successfully',
      appointment: convertedAppointment
    });
  } catch (error) {
    console.error('Update appointment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update appointment',
      error: error.message
    });
  }
});

// Delete appointment (uses controller function that properly frees time slot)
router.delete('/:id', deleteAppointment);

// Get appointments by status for a doctor
router.get('/doctor/:doctorId/status/:status', async (req, res) => {
  try {
    const { doctorId, status } = req.params;
    const appointments = await DoctorAppointmentModel.getAppointmentsByStatus(doctorId, status);
    
    // Convert and populate all appointments
    const convertedAppointments = await Promise.all(
      appointments.map(convertAppointment)
    );
    
    res.json({
      success: true,
      appointments: convertedAppointments,
      count: convertedAppointments.length
    });
  } catch (error) {
    console.error('Get appointments by status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch appointments',
      error: error.message
    });
  }
});

module.exports = router;

