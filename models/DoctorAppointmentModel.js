// models/DoctorAppointmentModel.js
const mongoose = require("mongoose");
const { encrypt, decrypt } = require("../services/encryptionService");

const docAppointmentSchema = new mongoose.Schema(
  {
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
    },
    appointmentDate: { type: Date, required: true },
    type: {
      type: String,
      enum: ["In-Person", "Video Call", "Follow-up"],
      default: "In-Person",
    },
    status: {
      type: String,
      enum: ["upcoming", "completed", "canceled", "rescheduled", "pending_reschedule"],
      default: "upcoming",
    },
    reason: { type: String },
    notes: { type: String },
    location: { type: String },
    cancellation_reason: { type: String },
    // Track who canceled and when
    canceledBy: { 
      type: String, 
      enum: ['doctor', 'patient', 'system'],
      default: null 
    },
    canceledAt: { 
      type: Date, 
      default: null 
    },
    // Additional fields that may contain diagnosis (from other sources)
    diagnosis: { type: String },
    // Post-appointment review (in-person only)
    reviewRequested: { type: Boolean, default: false },
    reviewSubmitted: { type: Boolean, default: false },
    reviewNotifiedAt: { type: Date, default: null },
    // Scheduled end time (for review trigger; optional, derived from appointmentDate + slot duration if missing)
    endTime: { type: Date, default: null },
  },
  { timestamps: true }
);

// Encrypt sensitive fields before saving
docAppointmentSchema.pre('save', function(next) {
  // Encrypt notes
  if (this.notes && typeof this.notes === 'string' && !this.notes.startsWith('ENC:')) {
    this.notes = encrypt(this.notes);
  }
  
  // Encrypt diagnosis if present
  if (this.diagnosis && typeof this.diagnosis === 'string' && !this.diagnosis.startsWith('ENC:')) {
    this.diagnosis = encrypt(this.diagnosis);
  }
  
  next();
});

// Decrypt sensitive fields after finding
docAppointmentSchema.post(['find', 'findOne', 'findOneAndUpdate'], function(docs) {
  if (!docs) return;
  
  const documents = Array.isArray(docs) ? docs : [docs];
  
  documents.forEach(doc => {
    if (!doc) return;
    
    // Decrypt notes
    if (doc.notes && typeof doc.notes === 'string') {
      doc.notes = decrypt(doc.notes);
    }
    
    // Decrypt diagnosis
    if (doc.diagnosis && typeof doc.diagnosis === 'string') {
      doc.diagnosis = decrypt(doc.diagnosis);
    }
  });
});

module.exports = mongoose.model(
  "DocAppointment",
  docAppointmentSchema,
  "Doctor_appointment"
);
