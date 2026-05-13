// controller/ePrescriptionController.js
const mongoose = require("mongoose");
const EPrescription = require("../models/EPrescriptionModel");
const DocAppointment = require("../models/DoctorAppointmentModel");
const PatientAppointmentActivity = require("../models/PatientAppointmentActivityModel");
const Patient = require("../models/PatientModel");
const Doctor = require("../models/DoctorModel");
const PatientNotificationModel = require("../models/PatientNotificationModel");
const DoctorNotificationModel = require("../models/DoctorNotificationModel");
const { checkPatientVisibility, logAccess } = require("../services/patientVisibilityService");
const { checkPrescriptionPermission } = require("./prescriptionController");
const path = require("path");
const fs = require("fs").promises;

/**
 * Generate PDF for e-prescription (mock implementation)
 * In production, use a library like pdfkit or puppeteer
 */
const generatePDF = async (prescriptionData) => {
  try {
    // Mock PDF generation - in production, use actual PDF library
    const pdfContent = `
E-PRESCRIPTION
==============

Patient: ${prescriptionData.patientName || 'N/A'}
Doctor: ${prescriptionData.doctorName || 'N/A'}
Date: ${new Date().toLocaleDateString()}
Appointment ID: ${prescriptionData.appointmentId || 'N/A'}

Diagnosis: ${prescriptionData.diagnosis || 'N/A'}

Medications:
${prescriptionData.medications.map((med, idx) => `
${idx + 1}. ${med.name}
   Dosage: ${med.dosage}
   Frequency: ${med.frequency}
   Instructions: ${med.instructions || 'N/A'}
`).join('\n')}

Notes: ${prescriptionData.notes || 'N/A'}

Doctor Signature: ${prescriptionData.signedByDoctor ? 'Signed' : 'Pending'}
Signed At: ${prescriptionData.signedAt ? new Date(prescriptionData.signedAt).toLocaleString() : 'N/A'}
    `.trim();
    
    // In production, convert this to actual PDF
    // For now, return mock file path
    return {
      content: pdfContent,
      filename: `EPRESC_${prescriptionData.doctorId}_${prescriptionData.patientId}_${Date.now()}.pdf`
    };
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw error;
  }
};

/**
 * Create an e-prescription
 * POST /api/doctor/e-prescriptions
 */
const createEPrescription = async (req, res) => {
  try {
    const { patientId, appointmentId, medications, diagnosis, notes } = req.body;
    const doctorId = req.user?.doctorId || req.body.doctorId;
    
    if (!doctorId || !patientId) {
      return res.status(400).json({ success: false, message: "doctorId and patientId are required" });
    }
    
    if (!medications || !Array.isArray(medications) || medications.length === 0) {
      return res.status(400).json({ success: false, message: "medications array is required" });
    }
    
    // Check permission
    const permissionCheck = await checkPrescriptionPermission(doctorId, patientId);
    if (!permissionCheck.allowed) {
      return res.status(403).json({ success: false, message: permissionCheck.reason });
    }
    
    // Check patient visibility
    const visibilityCheck = await checkPatientVisibility(doctorId, patientId);
    if (!visibilityCheck.canView) {
      return res.status(403).json({ success: false, message: "Access denied. Patient is not visible." });
    }
    
    // Create e-prescription
    const ePrescription = new EPrescription({
      patientId: new mongoose.Types.ObjectId(patientId),
      doctorId: new mongoose.Types.ObjectId(doctorId),
      appointmentId: appointmentId ? new mongoose.Types.ObjectId(appointmentId) : permissionCheck.appointment?._id,
      medications: medications,
      diagnosis: diagnosis || "",
      notes: notes || "",
      signedByDoctor: false,
      isDeleted: false
    });
    
    await ePrescription.save();
    
    // Generate PDF (mock)
    try {
      const pdfData = await generatePDF({
        patientId: patientId,
        doctorId: doctorId,
        appointmentId: appointmentId || permissionCheck.appointment?._id?.toString(),
        medications: medications,
        diagnosis: diagnosis,
        notes: notes
      });
      
      // In production, upload PDF to cloud storage (S3, Azure Blob, etc.)
      // For now, store filename
      ePrescription.pdfUrl = `/uploads/e-prescriptions/${pdfData.filename}`;
      await ePrescription.save();
    } catch (pdfError) {
      console.error("Error generating PDF:", pdfError);
      // Continue without PDF - can be generated later
    }
    
    // Log activity
    try {
      await PatientAppointmentActivity.create({
        doctorId: doctorId.toString(),
        patientId: patientId.toString(),
        appointmentId: appointmentId || permissionCheck.appointment?._id?.toString(),
        activityType: "e_prescription_created",
        description: `E-prescription created with ${medications.length} medication(s)`,
        metadata: {
          ePrescriptionId: ePrescription._id.toString(),
          medicationCount: medications.length
        }
      });
    } catch (activityError) {
      console.error("Error logging e-prescription activity:", activityError);
    }
    
    // Log access
    await logAccess(doctorId, patientId, 'issue_prescription', {
      ePrescriptionId: ePrescription._id.toString(),
      type: 'e_prescription'
    });
    
    // Get patient and doctor info for notifications
    const patient = await Patient.findById(patientId);
    const doctor = await Doctor.findById(doctorId);
    
    // Create patient notification
    try {
      const result = await PatientNotificationModel.createNotification({
        patientId: patientId.toString(),
        type: 'e_prescription_created',
        title: 'New E-Prescription Created',
        description: `Dr. ${doctor?.DoctorName || 'Your doctor'} has created an e-prescription with ${medications.length} medication(s). Please check your Prescription Manager for details.`,
        icon: 'healing',
        appointmentId: appointmentId || permissionCheck.appointment?._id?.toString(),
        doctorName: doctor?.DoctorName || null,
        timestamp: new Date()
      });
      console.log(`✅ Patient notification created for e-prescription ${ePrescription._id}:`, result.insertedId);
    } catch (notifError) {
      console.error("❌ Error creating patient notification:", notifError);
      console.error("Error details:", {
        message: notifError.message,
        stack: notifError.stack,
        patientId: patientId.toString()
      });
    }
    
    // Create doctor notification
    try {
      const result = await DoctorNotificationModel.createNotification({
        doctorId: doctorId.toString(),
        type: 'e_prescription_created',
        title: 'E-Prescription Created',
        description: `You have created an e-prescription with ${medications.length} medication(s) for ${patient?.firstName || ''} ${patient?.lastName || ''}. The prescription is pending your signature.`,
        icon: 'medication',
        appointmentId: appointmentId || permissionCheck.appointment?._id?.toString(),
        patientName: patient ? `${patient.firstName || ''} ${patient.lastName || ''}`.trim() : null,
        timestamp: new Date()
      });
      console.log(`✅ Doctor notification created for e-prescription ${ePrescription._id}:`, result.insertedId);
    } catch (notifError) {
      console.error("❌ Error creating doctor notification:", notifError);
      console.error("Error details:", {
        message: notifError.message,
        stack: notifError.stack,
        doctorId: doctorId.toString()
      });
    }
    
    res.json({
      success: true,
      message: "E-prescription created successfully",
      ePrescription: ePrescription
    });
  } catch (error) {
    console.error("Error creating e-prescription:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

/**
 * Sign an e-prescription
 * POST /api/doctor/e-prescriptions/:id/sign
 */
const signEPrescription = async (req, res) => {
  try {
    const { id } = req.params;
    const doctorId = req.user?.doctorId || req.body.doctorId;
    
    if (!doctorId) {
      return res.status(400).json({ success: false, message: "doctorId is required" });
    }
    
    const ePrescription = await EPrescription.findOne({
      _id: new mongoose.Types.ObjectId(id),
      isDeleted: false
    });
    
    if (!ePrescription) {
      return res.status(404).json({ success: false, message: "E-prescription not found" });
    }
    
    // Check permission
    if (ePrescription.doctorId.toString() !== doctorId) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    
    // Sign the prescription
    ePrescription.signedByDoctor = true;
    ePrescription.signedAt = new Date();
    
    // Regenerate PDF with signature
    try {
      const pdfData = await generatePDF({
        patientId: ePrescription.patientId.toString(),
        doctorId: ePrescription.doctorId.toString(),
        appointmentId: ePrescription.appointmentId?.toString(),
        medications: ePrescription.medications,
        diagnosis: ePrescription.diagnosis,
        notes: ePrescription.notes,
        signedByDoctor: true,
        signedAt: ePrescription.signedAt
      });
      
      ePrescription.pdfUrl = `/uploads/e-prescriptions/${pdfData.filename}`;
    } catch (pdfError) {
      console.error("Error regenerating PDF:", pdfError);
    }
    
    await ePrescription.save();
    
    // Get patient and doctor info for notifications
    const patient = await Patient.findById(ePrescription.patientId);
    const doctor = await Doctor.findById(doctorId);
    
    // Create patient notification
    try {
      const medicationNames = ePrescription.medications?.map(m => m.name).join(', ') || 'medication(s)';
      const result = await PatientNotificationModel.createNotification({
        patientId: ePrescription.patientId.toString(),
        type: 'e_prescription_signed',
        title: 'E-Prescription Signed',
        description: `Dr. ${doctor?.DoctorName || 'Your doctor'} has signed your e-prescription for ${medicationNames}. The prescription is now ready for use.`,
        icon: 'healing',
        appointmentId: ePrescription.appointmentId?.toString(),
        doctorName: doctor?.DoctorName || null,
        timestamp: new Date()
      });
      console.log(`✅ Patient notification created for signed e-prescription ${id}:`, result.insertedId);
    } catch (notifError) {
      console.error("❌ Error creating patient notification:", notifError);
      console.error("Error details:", {
        message: notifError.message,
        stack: notifError.stack,
        patientId: ePrescription.patientId.toString()
      });
    }
    
    // Create doctor notification
    try {
      const medicationNames = ePrescription.medications?.map(m => m.name).join(', ') || 'medication(s)';
      const result = await DoctorNotificationModel.createNotification({
        doctorId: doctorId.toString(),
        type: 'e_prescription_signed',
        title: 'E-Prescription Signed Successfully',
        description: `You have successfully signed the e-prescription for ${medicationNames} for ${patient?.firstName || ''} ${patient?.lastName || ''}.`,
        icon: 'check-circle',
        appointmentId: ePrescription.appointmentId?.toString(),
        patientName: patient ? `${patient.firstName || ''} ${patient.lastName || ''}`.trim() : null,
        timestamp: new Date()
      });
      console.log(`✅ Doctor notification created for signed e-prescription ${id}:`, result.insertedId);
    } catch (notifError) {
      console.error("❌ Error creating doctor notification:", notifError);
      console.error("Error details:", {
        message: notifError.message,
        stack: notifError.stack,
        doctorId: doctorId.toString()
      });
    }
    
    // Log activity
    try {
      await PatientAppointmentActivity.create({
        doctorId: doctorId.toString(),
        patientId: ePrescription.patientId.toString(),
        appointmentId: ePrescription.appointmentId?.toString(),
        activityType: "e_prescription_signed",
        description: "E-prescription signed by doctor",
        metadata: {
          ePrescriptionId: ePrescription._id.toString()
        }
      });
    } catch (activityError) {
      console.error("Error logging e-prescription sign activity:", activityError);
    }
    
    res.json({
      success: true,
      message: "E-prescription signed successfully",
      ePrescription: ePrescription
    });
  } catch (error) {
    console.error("Error signing e-prescription:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

/**
 * Get e-prescriptions for a patient
 * GET /api/doctor/e-prescriptions/patient/:patientId
 */
const getPatientEPrescriptions = async (req, res) => {
  const startTime = Date.now();
  console.log(`\n🚀 ========== [EPRESCRIPTION_PERF] START ==========`);
  console.log(`⏱️ [EPRESCRIPTION_PERF] START - getPatientEPrescriptions at ${new Date().toISOString()}`);
  console.log(`⏱️ [EPRESCRIPTION_PERF] Request method: ${req.method}`);
  console.log(`⏱️ [EPRESCRIPTION_PERF] Request URL: ${req.originalUrl}`);
  console.log(`⏱️ [EPRESCRIPTION_PERF] Request IP: ${req.ip}`);
  
  try {
    const { patientId } = req.params;
    const doctorId = req.user?.doctorId || req.query.doctorId;
    const authenticatedPatientId = req.user?.patientId || req.user?.userId || req.query.authenticatedPatientId;
    const { status, search, limit } = req.query; // status: 'signed', 'unsigned', 'all'
    const queryLimit = limit ? parseInt(limit) : 30; // Reduced default limit for faster loading
    
    console.log(`⏱️ [EPRESCRIPTION_PERF] Params: patientId=${patientId}, status=${status}, limit=${queryLimit}`);
    console.log(`⏱️ [EPRESCRIPTION_PERF] Time elapsed: ${Date.now() - startTime}ms`);
    
    // Allow patient to view their own e-prescriptions OR doctor to view patient's e-prescriptions
    const isPatientViewingOwn = authenticatedPatientId && authenticatedPatientId.toString() === patientId.toString();
    
    if (!isPatientViewingOwn && !doctorId) {
      return res.status(400).json({ success: false, message: "doctorId or authenticated patient access required" });
    }
    
    if (!isPatientViewingOwn && doctorId) {
      // Doctor viewing patient - check visibility
      const visibilityCheck = await checkPatientVisibility(doctorId, patientId);
      if (!visibilityCheck.canView) {
        return res.status(403).json({ success: false, message: "Access denied. Patient is not visible." });
      }
    }
    
    // Build query
    const query = {
      patientId: new mongoose.Types.ObjectId(patientId),
      isDeleted: false
    };
    
    // If doctor is viewing, filter by doctorId. If patient is viewing own, show all their e-prescriptions
    if (!isPatientViewingOwn && doctorId) {
      query.doctorId = new mongoose.Types.ObjectId(doctorId);
    }
    
    // IMPORTANT: Patients should only see signed e-prescriptions (completed prescriptions)
    // Doctors can see all (signed and unsigned) to manage them
    if (isPatientViewingOwn && !doctorId) {
      // Patient viewing own prescriptions - only show signed ones
      query.signedByDoctor = true;
      console.log(`⏱️ [EPRESCRIPTION_PERF] Patient viewing own - filtering to signed prescriptions only`);
    }
    
    // Filter by status (only applies if not already filtered by patient view)
    if (status === 'signed') {
      query.signedByDoctor = true;
    } else if (status === 'unsigned') {
      query.signedByDoctor = false;
    }
    
    // Search filter
    if (search) {
      query.$or = [
        { diagnosis: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } },
        { 'medications.name': { $regex: search, $options: 'i' } }
      ];
    }
    
    // Use aggregation pipeline for better performance
    const aggregationStart = Date.now();
    console.log(`⏱️ [EPRESCRIPTION_PERF] Starting aggregation pipeline...`);
    console.log(`⏱️ [EPRESCRIPTION_PERF] Query:`, JSON.stringify(query, null, 2));
    console.log(`⏱️ [EPRESCRIPTION_PERF] Time elapsed: ${Date.now() - startTime}ms`);
    
    const ePrescriptions = await EPrescription.aggregate([
      { $match: query },
      { $sort: { createdAt: -1 } },
      { $limit: queryLimit },
      {
        $project: {
          medications: 1,
          diagnosis: 1,
          notes: 1,
          pdfUrl: 1,
          signedByDoctor: 1,
          signedAt: 1,
          isDeleted: 1,
          doctorId: 1,
          createdAt: 1
        }
      },
      {
        $lookup: {
          from: 'Doctor', // Collection name in MongoDB (capital D)
          localField: 'doctorId',
          foreignField: '_id',
          as: 'doctorInfo',
          pipeline: [
            { $project: { DoctorName: 1, _id: 0 } }
          ]
        }
      },
      {
        $addFields: {
          doctorId: {
            $cond: {
              if: { $gt: [{ $size: '$doctorInfo' }, 0] },
              then: { DoctorName: { $arrayElemAt: ['$doctorInfo.DoctorName', 0] } },
              else: null
            }
          }
        }
      },
      { $unset: 'doctorInfo' }
    ]);
    
    const aggregationEnd = Date.now();
    const aggregationTime = aggregationEnd - aggregationStart;
    const totalTime = Date.now() - startTime;
    console.log(`⏱️ [EPRESCRIPTION_PERF] Aggregation completed in ${aggregationTime}ms`);
    console.log(`⏱️ [EPRESCRIPTION_PERF] Found ${ePrescriptions.length} e-prescriptions`);
    console.log(`⏱️ [EPRESCRIPTION_PERF] END - Total time: ${totalTime}ms`);
    console.log(`⏱️ [EPRESCRIPTION_PERF] Response size: ${JSON.stringify(ePrescriptions).length} bytes`);
    
    res.json({
      success: true,
      count: ePrescriptions.length,
      ePrescriptions: ePrescriptions,
      _performance: {
        totalTime: totalTime,
        aggregationTime: aggregationTime
      }
    });
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`❌ [EPRESCRIPTION_PERF] ERROR after ${totalTime}ms:`, error);
    console.error(`❌ [EPRESCRIPTION_PERF] Error stack:`, error.stack);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

/**
 * Get a single e-prescription by ID
 * GET /api/doctor/e-prescriptions/:id
 */
const getEPrescriptionById = async (req, res) => {
  try {
    const { id } = req.params;
    const doctorId = req.user?.doctorId || req.query.doctorId;
    
    const ePrescription = await EPrescription.findOne({
      _id: new mongoose.Types.ObjectId(id),
      isDeleted: false
    }).lean();
    
    if (!ePrescription) {
      return res.status(404).json({ success: false, message: "E-prescription not found" });
    }
    
    // Check permission
    if (ePrescription.doctorId.toString() !== doctorId) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    
    // Check patient visibility
    const visibilityCheck = await checkPatientVisibility(doctorId, ePrescription.patientId.toString());
    if (!visibilityCheck.canView) {
      return res.status(403).json({ success: false, message: "Access denied. Patient is not visible." });
    }
    
    res.json({
      success: true,
      ePrescription: ePrescription
    });
  } catch (error) {
    console.error("Error fetching e-prescription:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

/**
 * Soft delete an e-prescription
 * DELETE /api/doctor/e-prescriptions/:id
 */
const deleteEPrescription = async (req, res) => {
  try {
    const { id } = req.params;
    const doctorId = req.user?.doctorId || req.body.doctorId;
    
    if (!doctorId) {
      return res.status(400).json({ success: false, message: "doctorId is required" });
    }
    
    const ePrescription = await EPrescription.findOne({
      _id: new mongoose.Types.ObjectId(id),
      isDeleted: false
    });
    
    if (!ePrescription) {
      return res.status(404).json({ success: false, message: "E-prescription not found" });
    }
    
    // Check permission
    if (ePrescription.doctorId.toString() !== doctorId) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    
    // Soft delete
    ePrescription.isDeleted = true;
    ePrescription.deletedAt = new Date();
    await ePrescription.save();
    
    // Get patient and doctor info for notifications
    const patient = await Patient.findById(ePrescription.patientId);
    const doctor = await Doctor.findById(doctorId);
    
    // Create patient notification
    try {
      const medicationNames = ePrescription.medications?.map(m => m.name).join(', ') || 'medication(s)';
      const result = await PatientNotificationModel.createNotification({
        patientId: ePrescription.patientId.toString(),
        type: 'e_prescription_deleted',
        title: 'E-Prescription Cancelled',
        description: `Dr. ${doctor?.DoctorName || 'Your doctor'} has cancelled your e-prescription for ${medicationNames}. Please contact your doctor if you have any questions.`,
        icon: 'healing',
        appointmentId: ePrescription.appointmentId?.toString(),
        doctorName: doctor?.DoctorName || null,
        timestamp: new Date()
      });
      console.log(`✅ Patient notification created for deleted e-prescription ${id}:`, result.insertedId);
    } catch (notifError) {
      console.error("❌ Error creating patient notification:", notifError);
      console.error("Error details:", {
        message: notifError.message,
        stack: notifError.stack,
        patientId: ePrescription.patientId.toString()
      });
    }
    
    // Create doctor notification
    try {
      const medicationNames = ePrescription.medications?.map(m => m.name).join(', ') || 'medication(s)';
      const result = await DoctorNotificationModel.createNotification({
        doctorId: doctorId.toString(),
        type: 'e_prescription_deleted',
        title: 'E-Prescription Deleted',
        description: `You have deleted the e-prescription for ${medicationNames} for ${patient?.firstName || ''} ${patient?.lastName || ''}.`,
        icon: 'cancel',
        appointmentId: ePrescription.appointmentId?.toString(),
        patientName: patient ? `${patient.firstName || ''} ${patient.lastName || ''}`.trim() : null,
        timestamp: new Date()
      });
      console.log(`✅ Doctor notification created for deleted e-prescription ${id}:`, result.insertedId);
    } catch (notifError) {
      console.error("❌ Error creating doctor notification:", notifError);
      console.error("Error details:", {
        message: notifError.message,
        stack: notifError.stack,
        doctorId: doctorId.toString()
      });
    }
    
    // Log activity
    try {
      await PatientAppointmentActivity.create({
        doctorId: doctorId.toString(),
        patientId: ePrescription.patientId.toString(),
        appointmentId: ePrescription.appointmentId?.toString(),
        activityType: "e_prescription_deleted",
        description: "E-prescription deleted",
        metadata: {
          ePrescriptionId: ePrescription._id.toString()
        }
      });
    } catch (activityError) {
      console.error("Error logging e-prescription delete activity:", activityError);
    }
    
    res.json({
      success: true,
      message: "E-prescription deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting e-prescription:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

module.exports = {
  createEPrescription,
  signEPrescription,
  getPatientEPrescriptions,
  getEPrescriptionById,
  deleteEPrescription
};

