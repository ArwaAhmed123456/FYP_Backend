// models/PatientMedicalRecordModel.js
const mongoose = require("mongoose");
const { encrypt, decrypt, encryptArray, decryptArray, encryptObject, decryptObject } = require("../services/encryptionService");

const patientMedicalRecordSchema = mongoose.Schema(
  {
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor" },
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor_appointment" },
    diagnosis: { type: String, default: "" },
    symptoms: [{ type: String }],
    medications: [{ type: String }],
    vaccinations: [{ type: String }],
    vitals: { type: mongoose.Schema.Types.Mixed },
    allergies: [{ type: String }],
    chronicConditions: [{ type: String }],
    notes: { type: String, default: "" },
    followUpRequired: { type: Boolean, default: false },
    followUpDate: { type: Date, default: null },
    prescriptions: [{ type: String }],
  },
  { timestamps: true }
);

// Encrypt sensitive fields before saving
patientMedicalRecordSchema.pre('save', function(next) {
  // Encrypt string fields
  if (this.diagnosis && typeof this.diagnosis === 'string' && !this.diagnosis.startsWith('ENC:')) {
    this.diagnosis = encrypt(this.diagnosis);
  }
  if (this.notes && typeof this.notes === 'string' && !this.notes.startsWith('ENC:')) {
    this.notes = encrypt(this.notes);
  }
  
  // Encrypt array fields
  if (Array.isArray(this.symptoms) && this.symptoms.length > 0) {
    this.symptoms = encryptArray(this.symptoms);
  }
  if (Array.isArray(this.allergies) && this.allergies.length > 0) {
    this.allergies = encryptArray(this.allergies);
  }
  if (Array.isArray(this.chronicConditions) && this.chronicConditions.length > 0) {
    this.chronicConditions = encryptArray(this.chronicConditions);
  }
  
  // Encrypt vitals object
  if (this.vitals && typeof this.vitals === 'object') {
    // Check if already encrypted (stored as string)
    if (typeof this.vitals === 'string' && this.vitals.startsWith('ENC:')) {
      // Already encrypted, skip
    } else {
      // Only encrypt if vitals is actually an object (not already encrypted)
      this.vitals = encryptObject(this.vitals);
    }
  }
  
  next();
});

// Decrypt sensitive fields after finding
patientMedicalRecordSchema.post(['find', 'findOne', 'findOneAndUpdate'], function(docs) {
  if (!docs) return;
  
  const documents = Array.isArray(docs) ? docs : [docs];
  
  documents.forEach(doc => {
    if (!doc) return;
    
    // Decrypt string fields
    if (doc.diagnosis && typeof doc.diagnosis === 'string') {
      doc.diagnosis = decrypt(doc.diagnosis);
    }
    if (doc.notes && typeof doc.notes === 'string') {
      doc.notes = decrypt(doc.notes);
    }
    
    // Decrypt array fields
    if (Array.isArray(doc.symptoms)) {
      doc.symptoms = decryptArray(doc.symptoms);
    }
    if (Array.isArray(doc.allergies)) {
      doc.allergies = decryptArray(doc.allergies);
    }
    if (Array.isArray(doc.chronicConditions)) {
      doc.chronicConditions = decryptArray(doc.chronicConditions);
    }
    
    // Decrypt vitals
    if (doc.vitals) {
      if (typeof doc.vitals === 'string' && doc.vitals.startsWith('ENC:')) {
        doc.vitals = decryptObject(doc.vitals);
      }
    }
  });
});

module.exports = mongoose.model(
  "Patient Medical Record",
  patientMedicalRecordSchema,
  "Patient Medical Record"
);
