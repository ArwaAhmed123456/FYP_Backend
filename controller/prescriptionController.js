// controller/prescriptionController.js
const mongoose = require("mongoose");
const crypto = require("crypto");
const PatientPrescription = require("../models/PatientPrescriptionModel");
const EPrescription = require("../models/EPrescriptionModel");
const DocAppointment = require("../models/DoctorAppointmentModel");
const PatientMedicalRecord = require("../models/PatientMedicalRecordModel");
const PatientAppointmentActivity = require("../models/PatientAppointmentActivityModel");
const PrescriptionOTP = require("../models/PrescriptionOTPModel");
const Doctor = require("../models/DoctorModel");
const Patient = require("../models/PatientModel");
const PatientNotificationModel = require("../models/PatientNotificationModel");
const DoctorNotificationModel = require("../models/DoctorNotificationModel");
const { performSafetyCheck, checkDrugInteractions, checkAllergies } = require("../services/prescriptionSafetyService");
const { checkPatientVisibility, logAccess } = require("../services/patientVisibilityService");
const otpService = require("../services/otpService");
const { logPrescriptionAudit } = require("../utils/prescriptionAuditLogger");
const { getOrCreateTranslation, invalidateTranslation } = require('../services/translationService');
const { getPatientLanguage } = require('../utils/getPatientLanguage');

// Prescription fields to translate (skip medicationName, dosage, frequency — standardized terms)
const PRESCRIPTION_TRANSLATABLE_FIELDS = ['instructions', 'diagnosis', 'notes'];

/**
 * Translate translatable fields in a single prescription object.
 * rx must be a plain object (post-aggregation / post-lean).
 */
async function translatePrescription(rx, patientId) {
  const lang = await getPatientLanguage(patientId);
  if (lang !== 'ur') return rx;

  const fieldsToTranslate = {};
  for (const key of PRESCRIPTION_TRANSLATABLE_FIELDS) {
    if (typeof rx[key] === 'string' && rx[key].trim().length > 0) {
      fieldsToTranslate[key] = rx[key];
    }
  }
  if (Object.keys(fieldsToTranslate).length === 0) return rx;

  const translated = await getOrCreateTranslation(
    'Patient_Prescription',
    rx._id,
    fieldsToTranslate,
    lang
  );
  return { ...rx, ...translated };
}

/**
 * Middleware to check if doctor has permission to prescribe to patient
 * Doctor can prescribe ONLY if a past appointment OR current appointment exists
 */
const checkPrescriptionPermission = async (doctorId, patientId) => {
  try {
    // Check if there's any appointment (past or current) between doctor and patient
    const appointment = await DocAppointment.findOne({
      doctorId: new mongoose.Types.ObjectId(doctorId),
      patientId: new mongoose.Types.ObjectId(patientId),
      status: { $in: ['completed', 'upcoming', 'pending_reschedule'] }
    }).sort({ appointmentDate: -1 }).lean();
    
    if (!appointment) {
      return {
        allowed: false,
        reason: "No appointment found. Doctor must have at least one appointment with the patient before prescribing."
      };
    }
    
    return { allowed: true, appointment };
  } catch (error) {
    console.error("Error checking prescription permission:", error);
    return { allowed: false, reason: "Error checking permissions" };
  }
};

/**
 * Create a new prescription
 * POST /api/doctor/prescriptions
 */
/**
 * Generate signature hash for prescription
 */
const generateSignatureHash = (prescriptionData, doctorId, timestamp) => {
  const signatureString = `${prescriptionData.patientId}_${doctorId}_${prescriptionData.medicationName}_${prescriptionData.dosage}_${timestamp}`;
  return crypto.createHash('sha256').update(signatureString).digest('hex');
};

const createPrescription = async (req, res) => {
  try {
    const { 
      patientId, 
      appointmentId, 
      medicationName, 
      dosage, 
      frequency, 
      instructions, 
      medications, // New: medications array
      diagnosis, // New: diagnosis field
      notes, // New: notes field
      startDate, 
      endDate, 
      reminders,
      // Signature data
      signatureData,
      signatureIP,
      signatureDevice
    } = req.body;
    const doctorId = req.user?.doctorId || req.body.doctorId; // Support both auth and body
    const clientIP = req.ip || req.connection.remoteAddress || signatureIP;
    
    if (!doctorId || !patientId) {
      return res.status(400).json({ success: false, message: "doctorId and patientId are required" });
    }
    
    // Support both legacy (medicationName) and new (medications array) formats
    const hasLegacyFields = medicationName && dosage && frequency;
    const hasNewFields = medications && Array.isArray(medications) && medications.length > 0;
    
    if (!hasLegacyFields && !hasNewFields) {
      return res.status(400).json({ success: false, message: "Either (medicationName, dosage, frequency) or medications array is required" });
    }
    
    if (!endDate) {
      return res.status(400).json({ success: false, message: "endDate is required" });
    }

    // Note: Signature will be done via OTP verification after prescription creation
    
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
    
    // Perform safety checks - use first medication from array if available, otherwise use legacy fields
    const medNameForCheck = (medications && medications.length > 0) ? medications[0].name : medicationName;
    const dosageForCheck = (medications && medications.length > 0) ? medications[0].dosage : dosage;
    const safetyCheck = await performSafetyCheck(patientId, medNameForCheck, dosageForCheck, startDate || new Date());
    
    // If there are interactions or allergies, return them but don't block (doctor can override)
    if (safetyCheck.requiresOverride) {
      // Log the safety check result
      console.log(`⚠️ [PRESCRIPTION] Safety warnings for ${medicationName}:`, {
        interactions: safetyCheck.interactions.length,
        allergies: safetyCheck.allergies.length
      });
    }
    
    // Create prescription (unsigned - will be signed via OTP)
    const prescription = new PatientPrescription({
      patientId: new mongoose.Types.ObjectId(patientId),
      doctorId: new mongoose.Types.ObjectId(doctorId),
      appointmentId: appointmentId ? new mongoose.Types.ObjectId(appointmentId) : permissionCheck.appointment?._id,
      // Legacy single medication fields (for backward compatibility)
      medicationName: medicationName ? medicationName.trim() : undefined,
      dosage: dosage ? dosage.trim() : undefined,
      frequency: frequency ? frequency.trim() : undefined,
      instructions: instructions || "",
      // New fields to support multiple medications (like E_Prescription)
      medications: medications || [],
      diagnosis: diagnosis || "",
      notes: notes || "",
      pdfUrl: null, // Will be set after signing if PDF is generated
      startDate: startDate ? new Date(startDate) : new Date(),
      endDate: new Date(endDate),
      reminders: reminders || [],
      isActive: false, // Inactive until signed
      isDeleted: false,
      // Signature data - will be set after OTP verification
      signedByDoctor: false,
      signedAt: null,
      signatureHash: null,
      signatureIP: null,
      signatureDevice: null,
      signatureVersion: 0
    });
    
    await prescription.save();
    
    // Log prescription creation audit
    await logPrescriptionAudit({
      prescriptionId: prescription._id,
      eventType: 'CREATE',
      changedBy: doctorId,
      before: {},
      after: prescription,
      req,
      reason: 'Prescription created'
    });
    
    // Get patient and doctor info for notifications
    const patient = await Patient.findById(patientId);
    const doctor = await Doctor.findById(doctorId);
    
    // Create patient notification (prescription created, pending signature)
    try {
      const result = await PatientNotificationModel.createNotification({
        patientId: patientId.toString(),
        type: 'prescription_created',
        title: 'New Prescription Created',
        description: `Dr. ${doctor?.DoctorName || 'Your doctor'} has created a prescription for ${medicationName} (${dosage}). The prescription is pending doctor's signature and will be available once signed.`,
        icon: 'clipboard-outline',
        appointmentId: appointmentId || permissionCheck.appointment?._id?.toString(),
        doctorName: doctor?.DoctorName || null,
        timestamp: new Date()
      });
      console.log(`✅ Patient notification created for prescription creation ${prescription._id}:`, result.insertedId);
    } catch (notifError) {
      console.error("❌ Error creating patient notification for prescription creation:", notifError);
      console.error("Error details:", {
        message: notifError.message,
        stack: notifError.stack,
        patientId: patientId.toString()
      });
    }

    // Create doctor notification (prescription created)
    try {
      const result = await DoctorNotificationModel.createNotification({
        doctorId: doctorId.toString(),
        type: 'prescription_created',
        title: 'Prescription Created',
        description: `You have created a prescription for ${medicationName} (${dosage}) for ${patient?.firstName || ''} ${patient?.lastName || ''}. The prescription is pending your signature.`,
        icon: 'clipboard-outline',
        appointmentId: appointmentId || permissionCheck.appointment?._id?.toString(),
        patientName: patient ? `${patient.firstName || ''} ${patient.lastName || ''}`.trim() : null,
        timestamp: new Date()
      });
      console.log(`✅ Doctor notification created for prescription creation ${prescription._id}:`, result.insertedId);
    } catch (notifError) {
      console.error("❌ Error creating doctor notification for prescription creation:", notifError);
      console.error("Error details:", {
        message: notifError.message,
        stack: notifError.stack,
        doctorId: doctorId.toString()
      });
    }
    
    // Log activity in timeline
    try {
      await PatientAppointmentActivity.create({
        doctorId: doctorId.toString(),
        patientId: patientId.toString(),
        appointmentId: appointmentId || permissionCheck.appointment?._id?.toString(),
        activityType: "prescription_created",
        description: `Prescription created (pending signature): ${medicationName} (${dosage})`,
        metadata: {
          prescriptionId: prescription._id.toString(),
          medicationName,
          dosage,
          frequency,
          hasInteractions: safetyCheck.hasInteractions,
          hasAllergies: safetyCheck.allergies.length > 0,
          signedByDoctor: false
        }
      });
    } catch (activityError) {
      console.error("Error logging prescription activity:", activityError);
    }
    
    // Log access
    await logAccess(doctorId, patientId, 'issue_prescription', {
      prescriptionId: prescription._id.toString(),
      medicationName
    });
    
    res.json({
      success: true,
      message: "Prescription created successfully",
      prescription: prescription,
      safetyCheck: {
        hasWarnings: safetyCheck.requiresOverride,
        interactions: safetyCheck.interactions,
        allergies: safetyCheck.allergies,
        warnings: safetyCheck.warnings
      }
    });
  } catch (error) {
    console.error("Error creating prescription:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

/**
 * Get all prescriptions for a patient (doctor view)
 * GET /api/doctor/prescriptions/patient/:patientId
 */
const getPatientPrescriptions = async (req, res) => {
  const startTime = Date.now();
  console.log(`\n🚀 ========== [PRESCRIPTION_PERF] START ==========`);
  console.log(`⏱️ [PRESCRIPTION_PERF] START - getPatientPrescriptions at ${new Date().toISOString()}`);
  console.log(`⏱️ [PRESCRIPTION_PERF] Request method: ${req.method}`);
  console.log(`⏱️ [PRESCRIPTION_PERF] Request URL: ${req.originalUrl}`);
  console.log(`⏱️ [PRESCRIPTION_PERF] Request IP: ${req.ip}`);
  
  try {
    const { patientId } = req.params;
    const doctorId = req.user?.doctorId || req.query.doctorId;
    const authenticatedPatientId = req.user?.patientId || req.user?.userId || req.query.authenticatedPatientId;
    const { status, search, limit } = req.query; // status: 'active', 'past', 'all'
    const queryLimit = limit ? parseInt(limit) : 30; // Reduced default limit for faster loading
    
    console.log(`⏱️ [PRESCRIPTION_PERF] Params: patientId=${patientId}, status=${status}, limit=${queryLimit}`);
    console.log(`⏱️ [PRESCRIPTION_PERF] Time elapsed: ${Date.now() - startTime}ms`);
    
    // Allow patient to view their own prescriptions OR doctor to view patient's prescriptions
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
    const queryBuildStart = Date.now();
    const query = {
      patientId: new mongoose.Types.ObjectId(patientId),
      isDeleted: false
    };
    
    // If doctor is viewing, filter by doctorId. If patient is viewing own, show all their prescriptions
    if (!isPatientViewingOwn && doctorId) {
      query.doctorId = new mongoose.Types.ObjectId(doctorId);
    }
    
    // IMPORTANT: Patients should only see signed prescriptions (completed prescriptions)
    // Doctors can see all (signed and unsigned) to manage them
    if (isPatientViewingOwn && !doctorId) {
      // Patient viewing own prescriptions - only show signed ones
      query.signedByDoctor = true;
      console.log(`⏱️ [PRESCRIPTION_PERF] Patient viewing own - filtering to signed prescriptions only`);
    }
    
    // Filter by status (optimized for index usage)
    const now = new Date();
    if (status === 'active') {
      query.isActive = true;
      query.startDate = { $lte: now };
      query.endDate = { $gte: now };
    } else if (status === 'past') {
      query.$or = [
        { isActive: false },
        { endDate: { $lt: now } }
      ];
    }
    
    console.log(`⏱️ [PRESCRIPTION_PERF] Query built in ${Date.now() - queryBuildStart}ms`);
    console.log(`⏱️ [PRESCRIPTION_PERF] Query:`, JSON.stringify(query, null, 2));
    console.log(`⏱️ [PRESCRIPTION_PERF] Time elapsed: ${Date.now() - startTime}ms`);
    
    // Search filter (only if search term provided)
    if (search && search.trim()) {
      const searchRegex = { $regex: search.trim(), $options: 'i' };
      // Combine with existing $or if status is 'past', otherwise create new
      if (query.$or) {
        query.$and = [
          { $or: query.$or },
          {
            $or: [
              { medicationName: searchRegex },
              { dosage: searchRegex },
              { instructions: searchRegex }
            ]
          }
        ];
        delete query.$or;
      } else {
        query.$or = [
          { medicationName: searchRegex },
          { dosage: searchRegex },
          { instructions: searchRegex }
        ];
      }
    }
    
    // Use aggregation pipeline for better performance
    const aggregationStart = Date.now();
    console.log(`⏱️ [PRESCRIPTION_PERF] Starting aggregation pipeline...`);
    console.log(`⏱️ [PRESCRIPTION_PERF] Time elapsed: ${Date.now() - startTime}ms`);
    
    const prescriptions = await PatientPrescription.aggregate([
      { $match: query },
      { $sort: { createdAt: -1 } },
      { $limit: queryLimit },
      {
        $project: {
          medicationName: 1,
          dosage: 1,
          frequency: 1,
          instructions: 1,
          medications: 1, // New medications array field
          diagnosis: 1, // New diagnosis field
          notes: 1, // New notes field
          pdfUrl: 1, // New pdfUrl field
          startDate: 1,
          endDate: 1,
          isActive: 1,
          signedByDoctor: 1, // Include signed status
          signedAt: 1, // Include signed date
          isDeleted: 1, // Include deleted status
          doctorId: 1,
          createdAt: 1,
          reminders: 1, // Include reminders for daily medication schedule
          // Calculate adherence percentage in aggregation
          adherencePercentage: {
            $cond: {
              if: { $gt: [{ $size: { $ifNull: ['$adherenceLog', []] } }, 0] },
              then: {
                $round: [
                  {
                    $multiply: [
                      100,
                      {
                        $divide: [
                          { $size: { $filter: { input: '$adherenceLog', as: 'log', cond: '$$log.taken' } } },
                          { $size: '$adherenceLog' }
                        ]
                      }
                    ]
                  },
                  0
                ]
              },
              else: 0
            }
          },
          // Limit adherenceLog to last 30 entries for performance
          adherenceLog: { $slice: ['$adherenceLog', -30] }
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
    console.log(`⏱️ [PRESCRIPTION_PERF] Aggregation completed in ${aggregationTime}ms`);
    console.log(`⏱️ [PRESCRIPTION_PERF] Found ${prescriptions.length} prescriptions`);
    console.log(`⏱️ [PRESCRIPTION_PERF] Time elapsed: ${Date.now() - startTime}ms`);
    
    // Translate for patient's language preference
    const translatedPrescriptions = await Promise.all(
      prescriptions.map((rx) => translatePrescription(rx, patientId))
    );

    const totalTime = Date.now() - startTime;
    console.log(`⏱️ [PRESCRIPTION_PERF] END - Total time: ${totalTime}ms`);
    console.log(`⏱️ [PRESCRIPTION_PERF] Response size: ${JSON.stringify(translatedPrescriptions).length} bytes`);

    res.json({
      success: true,
      count: translatedPrescriptions.length,
      prescriptions: translatedPrescriptions,
      _performance: {
        totalTime: totalTime,
        aggregationTime: aggregationTime
      }
    });
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`❌ [PRESCRIPTION_PERF] ERROR after ${totalTime}ms:`, error);
    console.error(`❌ [PRESCRIPTION_PERF] Error stack:`, error.stack);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

/**
 * Get a single prescription by ID
 * GET /api/doctor/prescriptions/:id
 */
const getPrescriptionById = async (req, res) => {
  try {
    const { id } = req.params;
    const doctorId = req.user?.doctorId || req.query.doctorId;
    
    const prescription = await PatientPrescription.findOne({
      _id: new mongoose.Types.ObjectId(id),
      isDeleted: false
    }).lean();
    
    if (!prescription) {
      return res.status(404).json({ success: false, message: "Prescription not found" });
    }
    
    // Check permission
    if (prescription.doctorId.toString() !== doctorId) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    
    // Check patient visibility
    const visibilityCheck = await checkPatientVisibility(doctorId, prescription.patientId.toString());
    if (!visibilityCheck.canView) {
      return res.status(403).json({ success: false, message: "Access denied. Patient is not visible." });
    }
    
    const adherence = prescription.adherenceLog && prescription.adherenceLog.length > 0
      ? Math.round((prescription.adherenceLog.filter(log => log.taken).length / prescription.adherenceLog.length) * 100)
      : 0;

    // Translate for patient's language preference
    const patientIdForLang = prescription.patientId?.toString?.() || prescription.patientId;
    const translatedRx = await translatePrescription(
      { ...prescription, adherencePercentage: adherence },
      patientIdForLang
    );

    res.json({
      success: true,
      prescription: translatedRx
    });
  } catch (error) {
    console.error("Error fetching prescription:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

/**
 * Update a prescription (creates new version)
 * PUT /api/doctor/prescriptions/:id
 */
const updatePrescription = async (req, res) => {
  try {
    const { id } = req.params;
    const { medicationName, dosage, frequency, instructions, startDate, endDate, reminders } = req.body;
    const doctorId = req.user?.doctorId || req.body.doctorId;
    
    if (!doctorId) {
      return res.status(400).json({ success: false, message: "doctorId is required" });
    }
    
    // Find existing prescription
    const existingPrescription = await PatientPrescription.findOne({
      _id: new mongoose.Types.ObjectId(id),
      isDeleted: false
    });
    
    if (!existingPrescription) {
      return res.status(404).json({ success: false, message: "Prescription not found" });
    }
    
    // Check permission
    if (existingPrescription.doctorId.toString() !== doctorId) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    
    // Check patient visibility
    const visibilityCheck = await checkPatientVisibility(doctorId, existingPrescription.patientId.toString());
    if (!visibilityCheck.canView) {
      return res.status(403).json({ success: false, message: "Access denied. Patient is not visible." });
    }
    
    // Store before state for audit log
    const beforeState = existingPrescription.toObject ? existingPrescription.toObject() : { ...existingPrescription };
    
    // Perform safety check if medication name changed
    let safetyCheck = null;
    if (medicationName && medicationName !== existingPrescription.medicationName) {
      safetyCheck = await performSafetyCheck(
        existingPrescription.patientId.toString(),
        medicationName,
        dosage || existingPrescription.dosage,
        startDate || existingPrescription.startDate
      );
    }
    
    // Create new version (versioning)
    const newPrescription = new PatientPrescription({
      patientId: existingPrescription.patientId,
      doctorId: existingPrescription.doctorId,
      appointmentId: existingPrescription.appointmentId,
      medicationName: medicationName || existingPrescription.medicationName,
      dosage: dosage || existingPrescription.dosage,
      frequency: frequency || existingPrescription.frequency,
      instructions: instructions !== undefined ? instructions : existingPrescription.instructions,
      startDate: startDate ? new Date(startDate) : existingPrescription.startDate,
      endDate: endDate ? new Date(endDate) : existingPrescription.endDate,
      reminders: reminders || existingPrescription.reminders,
      isActive: true,
      isDeleted: false,
      previousVersionId: existingPrescription._id
    });
    
    await newPrescription.save();

    // Invalidate translation cache for the old version (new one has a new _id, no cache yet)
    invalidateTranslation('Patient_Prescription', existingPrescription._id).catch(() => {});

    // Deactivate old version
    existingPrescription.isActive = false;
    await existingPrescription.save();

    // Log prescription update audit
    await logPrescriptionAudit({
      prescriptionId: newPrescription._id,
      eventType: 'UPDATE',
      changedBy: doctorId,
      before: beforeState,
      after: newPrescription,
      req,
      reason: 'Prescription updated'
    });
    
    // Log activity
    try {
      await PatientAppointmentActivity.create({
        doctorId: doctorId.toString(),
        patientId: existingPrescription.patientId.toString(),
        appointmentId: existingPrescription.appointmentId?.toString(),
        activityType: "prescription_edited",
        description: `Prescription updated: ${newPrescription.medicationName} (${newPrescription.dosage})`,
        metadata: {
          oldPrescriptionId: existingPrescription._id.toString(),
          newPrescriptionId: newPrescription._id.toString(),
          medicationName: newPrescription.medicationName
        }
      });
    } catch (activityError) {
      console.error("Error logging prescription edit activity:", activityError);
    }
    
    res.json({
      success: true,
      message: "Prescription updated successfully",
      prescription: newPrescription,
      previousVersion: existingPrescription._id,
      safetyCheck: safetyCheck
    });
  } catch (error) {
    console.error("Error updating prescription:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

/**
 * Soft delete a prescription
 * DELETE /api/doctor/prescriptions/:id
 */
const deletePrescription = async (req, res) => {
  try {
    const { id } = req.params;
    const doctorId = req.user?.doctorId || req.body.doctorId || req.query.doctorId;
    
    if (!doctorId) {
      return res.status(400).json({ success: false, message: "doctorId is required" });
    }
    
    const prescription = await PatientPrescription.findOne({
      _id: new mongoose.Types.ObjectId(id),
      isDeleted: false
    });
    
    if (!prescription) {
      return res.status(404).json({ success: false, message: "Prescription not found" });
    }
    
    // Check permission
    if (prescription.doctorId.toString() !== doctorId) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    
    // Store before state for audit log
    const beforeState = prescription.toObject ? prescription.toObject() : { ...prescription };
    
    // Soft delete
    prescription.isDeleted = true;
    prescription.deletedAt = new Date();
    prescription.isActive = false;
    await prescription.save();
    
    // Log prescription deletion audit
    await logPrescriptionAudit({
      prescriptionId: prescription._id,
      eventType: 'DELETE',
      changedBy: doctorId,
      before: beforeState,
      after: prescription.toObject ? prescription.toObject() : { ...prescription },
      req,
      reason: 'Prescription deleted'
    });
    
    // Get patient and doctor info for notifications
    const patient = await Patient.findById(prescription.patientId);
    const doctor = await Doctor.findById(doctorId);
    
    // Create patient notification
    try {
      const result = await PatientNotificationModel.createNotification({
        patientId: prescription.patientId.toString(),
        type: 'prescription_deleted',
        title: 'Prescription Cancelled',
        description: `Dr. ${doctor?.DoctorName || 'Your doctor'} has cancelled your prescription for ${prescription.medicationName} (${prescription.dosage}). Please contact your doctor if you have any questions.`,
        icon: 'clipboard-outline',
        appointmentId: prescription.appointmentId?.toString(),
        doctorName: doctor?.DoctorName || null,
        timestamp: new Date()
      });
      console.log(`✅ Patient notification created for deleted prescription ${id}:`, result.insertedId);
    } catch (notifError) {
      console.error("❌ Error creating patient notification for prescription deletion:", notifError);
      console.error("Error details:", {
        message: notifError.message,
        stack: notifError.stack,
        patientId: prescription.patientId.toString(),
        prescriptionId: id
      });
    }

    // Create doctor notification
    try {
      const result = await DoctorNotificationModel.createNotification({
        doctorId: doctorId.toString(),
        type: 'prescription_deleted',
        title: 'Prescription Deleted',
        description: `You have deleted the prescription for ${prescription.medicationName} (${prescription.dosage}) for ${patient?.firstName || ''} ${patient?.lastName || ''}.`,
        icon: 'clipboard-outline',
        appointmentId: prescription.appointmentId?.toString(),
        patientName: patient ? `${patient.firstName || ''} ${patient.lastName || ''}`.trim() : null,
        timestamp: new Date()
      });
      console.log(`✅ Doctor notification created for deleted prescription ${id}:`, result.insertedId);
    } catch (notifError) {
      console.error("❌ Error creating doctor notification for prescription deletion:", notifError);
      console.error("Error details:", {
        message: notifError.message,
        stack: notifError.stack,
        doctorId: doctorId.toString(),
        prescriptionId: id
      });
    }
    
    // Log activity
    try {
      await PatientAppointmentActivity.create({
        doctorId: doctorId.toString(),
        patientId: prescription.patientId.toString(),
        appointmentId: prescription.appointmentId?.toString(),
        activityType: "prescription_deleted",
        description: `Prescription deleted: ${prescription.medicationName}`,
        metadata: {
          prescriptionId: prescription._id.toString(),
          medicationName: prescription.medicationName
        }
      });
    } catch (activityError) {
      console.error("Error logging prescription delete activity:", activityError);
    }
    
    res.json({
      success: true,
      message: "Prescription deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting prescription:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

/**
 * Log medication adherence
 * POST /api/doctor/prescriptions/:id/adherence
 */
const logAdherence = async (req, res) => {
  try {
    const { id } = req.params;
    const { date, time, taken } = req.body;
    const doctorId = req.user?.doctorId || req.body.doctorId;
    
    if (!date || !time || taken === undefined) {
      return res.status(400).json({ success: false, message: "date, time, and taken are required" });
    }
    
    const prescription = await PatientPrescription.findOne({
      _id: new mongoose.Types.ObjectId(id),
      isDeleted: false
    });
    
    if (!prescription) {
      return res.status(404).json({ success: false, message: "Prescription not found" });
    }
    
    // Check permission (doctor or patient can log)
    const isDoctor = prescription.doctorId.toString() === doctorId;
    const isPatient = req.body.patientId && prescription.patientId.toString() === req.body.patientId;
    
    if (!isDoctor && !isPatient) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    
    // Add to adherence log
    if (!prescription.adherenceLog) {
      prescription.adherenceLog = [];
    }
    
    prescription.adherenceLog.push({
      date: new Date(date),
      time: time,
      taken: taken,
      timestamp: new Date()
    });
    
    await prescription.save();
    
    // Log activity if patient logged
    if (isPatient) {
      try {
        await PatientAppointmentActivity.create({
          doctorId: prescription.doctorId.toString(),
          patientId: prescription.patientId.toString(),
          appointmentId: prescription.appointmentId?.toString(),
          activityType: taken ? "medication_taken" : "medication_skipped",
          description: `${prescription.medicationName} ${taken ? 'taken' : 'skipped'} at ${time}`,
          metadata: {
            prescriptionId: prescription._id.toString(),
            medicationName: prescription.medicationName,
            time,
            date
          }
        });
      } catch (activityError) {
        console.error("Error logging adherence activity:", activityError);
      }
    }
    
    const adherence = prescription.adherenceLog.length > 0
      ? Math.round((prescription.adherenceLog.filter(log => log.taken).length / prescription.adherenceLog.length) * 100)
      : 0;
    
    res.json({
      success: true,
      message: "Adherence logged successfully",
      adherencePercentage: adherence,
      prescription: prescription
    });
  } catch (error) {
    console.error("Error logging adherence:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

/**
 * Get prescription history for a patient (for doctor's "Add Medication" screen)
 * GET /api/doctor/prescriptions/patient/:patientId/history
 */
const getPrescriptionHistory = async (req, res) => {
  try {
    const { patientId } = req.params;
    const doctorId = req.user?.doctorId || req.query.doctorId;
    
    if (!doctorId || !patientId) {
      return res.status(400).json({ success: false, message: "doctorId and patientId are required" });
    }
    
    // Check patient visibility
    const visibilityCheck = await checkPatientVisibility(doctorId, patientId);
    if (!visibilityCheck.canView) {
      return res.status(403).json({ success: false, message: "Access denied. Patient is not visible." });
    }
    
    // Get all prescriptions (including inactive)
    const prescriptions = await PatientPrescription.find({
      patientId: new mongoose.Types.ObjectId(patientId),
      doctorId: new mongoose.Types.ObjectId(doctorId),
      isDeleted: false
    })
    .sort({ createdAt: -1 })
    .lean();
    
    // Get active prescriptions
    const now = new Date();
    const activePrescriptions = prescriptions.filter(p => {
      return p.isActive && 
             new Date(p.startDate) <= now && 
             new Date(p.endDate) >= now;
    });
    
    // Calculate adherence for each
    const prescriptionsWithAdherence = prescriptions.map(p => {
      const adherence = p.adherenceLog && p.adherenceLog.length > 0
        ? Math.round((p.adherenceLog.filter(log => log.taken).length / p.adherenceLog.length) * 100)
        : 0;
      
      return {
        ...p,
        adherencePercentage: adherence
      };
    });
    
    res.json({
      success: true,
      activeCount: activePrescriptions.length,
      totalCount: prescriptionsWithAdherence.length,
      activePrescriptions: activePrescriptions.map(p => ({
        ...p,
        adherencePercentage: prescriptionsWithAdherence.find(pa => pa._id.toString() === p._id.toString())?.adherencePercentage || 0
      })),
      allPrescriptions: prescriptionsWithAdherence,
      latestPrescription: prescriptionsWithAdherence.length > 0 ? prescriptionsWithAdherence[0] : null
    });
  } catch (error) {
    console.error("Error fetching prescription history:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

/**
 * Request OTP for prescription signing
 * POST /api/doctor/prescriptions/:id/request-otp
 */
const requestPrescriptionOTP = async (req, res) => {
  try {
    const { id } = req.params;
    const doctorId = req.user?.doctorId || req.body.doctorId;
    
    if (!doctorId) {
      return res.status(400).json({ success: false, message: "doctorId is required" });
    }
    
    const prescription = await PatientPrescription.findOne({
      _id: new mongoose.Types.ObjectId(id),
      isDeleted: false
    });
    
    if (!prescription) {
      return res.status(404).json({ success: false, message: "Prescription not found" });
    }
    
    // Check permission
    if (prescription.doctorId.toString() !== doctorId) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    // Check if already signed
    if (prescription.signedByDoctor) {
      return res.status(400).json({ 
        success: false, 
        message: "Prescription is already signed" 
      });
    }

    // Get doctor email
    const doctor = await Doctor.findById(doctorId);
    if (!doctor || !doctor.email) {
      return res.status(404).json({ success: false, message: "Doctor email not found" });
    }

    // Check for existing unverified OTP
    const existingOTP = await PrescriptionOTP.findOne({
      prescriptionId: prescription._id,
      doctorId: new mongoose.Types.ObjectId(doctorId),
      verified: false,
      expiresAt: { $gt: new Date() }
    });

    let otpCode;
    let otpRecord;

    if (existingOTP && existingOTP.attempts < existingOTP.maxAttempts) {
      // Reuse existing OTP if not expired and within attempt limit
      otpCode = existingOTP.otpCode;
      otpRecord = existingOTP;
      console.log(`Reusing existing OTP for prescription ${id}`);
    } else {
      // Generate new OTP
      otpCode = otpService.generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Delete old OTPs for this prescription
      await PrescriptionOTP.deleteMany({
        prescriptionId: prescription._id,
        doctorId: new mongoose.Types.ObjectId(doctorId)
      });

      // Create new OTP record
      otpRecord = new PrescriptionOTP({
        prescriptionId: prescription._id,
        doctorId: new mongoose.Types.ObjectId(doctorId),
        otpCode: otpCode,
        email: doctor.email,
        expiresAt: expiresAt,
        verified: false,
        attempts: 0
      });

      await otpRecord.save();
    }

    // Send OTP email
    try {
      await otpService.sendEmailOTP(doctor.email, otpCode, 'doctor');
      console.log(`✅ OTP sent to doctor ${doctorId} for prescription ${id}`);
    } catch (emailError) {
      console.error("Error sending OTP email:", emailError);
      return res.status(500).json({ 
        success: false, 
        message: "Failed to send OTP email. Please try again." 
      });
    }
    
    res.json({
      success: true,
      message: "OTP sent to your registered email address",
      expiresIn: 10 // minutes
    });
  } catch (error) {
    console.error("Error requesting prescription OTP:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

/**
 * Verify OTP and sign prescription
 * POST /api/doctor/prescriptions/:id/verify-otp
 */
const verifyPrescriptionOTP = async (req, res) => {
  try {
    const { id } = req.params;
    const { otpCode } = req.body;
    const doctorId = req.user?.doctorId || req.body.doctorId;
    const clientIP = req.ip || req.connection.remoteAddress;
    
    if (!doctorId) {
      return res.status(400).json({ success: false, message: "doctorId is required" });
    }

    if (!otpCode) {
      return res.status(400).json({ success: false, message: "OTP code is required" });
    }
    
    const prescription = await PatientPrescription.findOne({
      _id: new mongoose.Types.ObjectId(id),
      isDeleted: false
    });
    
    if (!prescription) {
      return res.status(404).json({ success: false, message: "Prescription not found" });
    }
    
    // Check permission
    if (prescription.doctorId.toString() !== doctorId) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    // Check if already signed
    if (prescription.signedByDoctor) {
      return res.status(400).json({ 
        success: false, 
        message: "Prescription is already signed" 
      });
    }

    // Find OTP record
    const otpRecord = await PrescriptionOTP.findOne({
      prescriptionId: prescription._id,
      doctorId: new mongoose.Types.ObjectId(doctorId),
      verified: false
    });

    if (!otpRecord) {
      return res.status(400).json({ 
        success: false, 
        message: "No OTP found. Please request a new OTP." 
      });
    }

    // Check attempts
    if (otpRecord.attempts >= otpRecord.maxAttempts) {
      return res.status(400).json({ 
        success: false, 
        message: "Maximum OTP attempts exceeded. Please request a new OTP." 
      });
    }

    // Verify OTP
    const verification = otpService.verifyOTP(otpCode, otpRecord.otpCode, otpRecord.expiresAt);
    
    if (!verification.success) {
      // Increment attempts
      otpRecord.attempts += 1;
      await otpRecord.save();
      
      return res.status(400).json({ 
        success: false, 
        message: verification.message 
      });
    }

    // OTP verified - sign prescription
    const signatureTimestamp = new Date();
    const signatureHash = generateSignatureHash(
      { 
        patientId: prescription.patientId.toString(), 
        medicationName: prescription.medicationName, 
        dosage: prescription.dosage 
      },
      doctorId,
      signatureTimestamp.toISOString()
    );

    // Store before state for audit log
    const beforeState = prescription.toObject ? prescription.toObject() : { ...prescription };
    
    // Update prescription with signature
    prescription.signedByDoctor = true;
    prescription.signedAt = signatureTimestamp;
    prescription.signatureHash = signatureHash;
    prescription.signatureIP = clientIP;
    prescription.signatureDevice = req.headers['user-agent'] || 'Unknown';
    prescription.signatureVersion = 1;
    prescription.isActive = true; // Activate prescription after signing
    await prescription.save();

    // Mark OTP as verified
    otpRecord.verified = true;
    otpRecord.verifiedAt = signatureTimestamp;
    await otpRecord.save();
    
    // Log prescription signing audit
    await logPrescriptionAudit({
      prescriptionId: prescription._id,
      eventType: 'SIGN',
      changedBy: doctorId,
      before: beforeState,
      after: prescription.toObject ? prescription.toObject() : { ...prescription },
      req,
      reason: 'Prescription signed via OTP verification'
    });
    
    // Get patient and doctor info for notifications
    const patient = await Patient.findById(prescription.patientId);
    const doctor = await Doctor.findById(doctorId);

    // Create patient notification
    try {
      const result = await PatientNotificationModel.createNotification({
        patientId: prescription.patientId.toString(),
        type: 'prescription_signed',
        title: 'New Prescription Available',
        description: `Dr. ${doctor?.DoctorName || 'Your doctor'} has prescribed ${prescription.medicationName} (${prescription.dosage}). Please check your Prescription Manager for details.`,
        icon: 'clipboard-outline',
        appointmentId: prescription.appointmentId?.toString(),
        doctorName: doctor?.DoctorName || null,
        timestamp: signatureTimestamp
      });
      console.log(`✅ Patient notification created for signed prescription ${id}:`, result.insertedId);
    } catch (notifError) {
      console.error("❌ Error creating patient notification for prescription signing:", notifError);
      console.error("Error details:", {
        message: notifError.message,
        stack: notifError.stack,
        patientId: prescription.patientId.toString(),
        prescriptionId: id
      });
    }

    // Create doctor notification
    try {
      const result = await DoctorNotificationModel.createNotification({
        doctorId: doctorId.toString(),
        type: 'prescription_signed',
        title: 'Prescription Signed Successfully',
        description: `You have successfully signed the prescription for ${prescription.medicationName} (${prescription.dosage}) for ${patient?.firstName || ''} ${patient?.lastName || ''}.`,
        icon: 'clipboard-outline',
        appointmentId: prescription.appointmentId?.toString(),
        patientName: patient ? `${patient.firstName || ''} ${patient.lastName || ''}`.trim() : null,
        timestamp: signatureTimestamp
      });
      console.log(`✅ Doctor notification created for prescription ${id}:`, result.insertedId);
    } catch (notifError) {
      console.error("❌ Error creating doctor notification:", notifError);
      console.error("Error details:", {
        message: notifError.message,
        stack: notifError.stack,
        doctorId: doctorId.toString(),
        prescriptionId: id
      });
    }

    // Log signature activity
    try {
      await PatientAppointmentActivity.create({
        doctorId: doctorId.toString(),
        patientId: prescription.patientId.toString(),
        appointmentId: prescription.appointmentId?.toString(),
        activityType: "prescription_signed",
        description: `Prescription signed: ${prescription.medicationName} (${prescription.dosage})`,
        metadata: {
          prescriptionId: prescription._id.toString(),
          signedAt: signatureTimestamp.toISOString(),
          signatureHash: signatureHash,
          signatureIP: clientIP,
          signatureDevice: req.headers['user-agent'],
          otpVerified: true
        }
      });
    } catch (activityError) {
      console.error("Error logging prescription signature activity:", activityError);
    }
    
    res.json({
      success: true,
      message: "Prescription signed successfully",
      prescription: prescription
    });
  } catch (error) {
    console.error("Error verifying prescription OTP:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

/**
 * Sign an existing prescription (legacy - now requires OTP)
 * POST /api/doctor/prescriptions/:id/sign
 */
const signPrescription = async (req, res) => {
  try {
    const { id } = req.params;
    const doctorId = req.user?.doctorId || req.body.doctorId;
    const { signatureData, signatureIP, signatureDevice } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress || signatureIP;
    
    if (!doctorId) {
      return res.status(400).json({ success: false, message: "doctorId is required" });
    }

    if (!signatureData || !signatureData.confirmed) {
      return res.status(400).json({ 
        success: false, 
        message: "Signature confirmation is required" 
      });
    }
    
    const prescription = await PatientPrescription.findOne({
      _id: new mongoose.Types.ObjectId(id),
      isDeleted: false
    });
    
    if (!prescription) {
      return res.status(404).json({ success: false, message: "Prescription not found" });
    }
    
    // Check permission
    if (prescription.doctorId.toString() !== doctorId) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    // Store before state for audit log
    const beforeState = prescription.toObject ? prescription.toObject() : { ...prescription };

    // Generate signature hash
    const signatureTimestamp = new Date();
    const signatureHash = generateSignatureHash(
      { 
        patientId: prescription.patientId.toString(), 
        medicationName: prescription.medicationName, 
        dosage: prescription.dosage 
      },
      doctorId,
      signatureTimestamp.toISOString()
    );

    // Update prescription with signature
    prescription.signedByDoctor = true;
    prescription.signedAt = signatureTimestamp;
    prescription.signatureHash = signatureHash;
    prescription.signatureIP = clientIP;
    prescription.signatureDevice = signatureDevice || req.headers['user-agent'] || 'Unknown';
    prescription.signatureVersion = (prescription.signatureVersion || 0) + 1;
    
    await prescription.save();
    
    // Log prescription signing audit
    await logPrescriptionAudit({
      prescriptionId: prescription._id,
      eventType: 'SIGN',
      changedBy: doctorId,
      before: beforeState,
      after: prescription.toObject ? prescription.toObject() : { ...prescription },
      req,
      reason: 'Prescription signed (legacy method)'
    });
    
    // Log signature activity
    try {
      await PatientAppointmentActivity.create({
        doctorId: doctorId.toString(),
        patientId: prescription.patientId.toString(),
        appointmentId: prescription.appointmentId?.toString(),
        activityType: "prescription_signed",
        description: `Prescription signed: ${prescription.medicationName} (${prescription.dosage})`,
        metadata: {
          prescriptionId: prescription._id.toString(),
          signedAt: signatureTimestamp.toISOString(),
          signatureHash: signatureHash,
          signatureIP: clientIP,
          signatureDevice: signatureDevice || req.headers['user-agent']
        }
      });
    } catch (activityError) {
      console.error("Error logging prescription signature activity:", activityError);
    }
    
    res.json({
      success: true,
      message: "Prescription signed successfully",
      prescription: prescription
    });
  } catch (error) {
    console.error("Error signing prescription:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

module.exports = {
  createPrescription,
  getPatientPrescriptions,
  getPrescriptionById,
  updatePrescription,
  deletePrescription,
  logAdherence,
  getPrescriptionHistory,
  checkPrescriptionPermission,
  signPrescription,
  requestPrescriptionOTP,
  verifyPrescriptionOTP
};

