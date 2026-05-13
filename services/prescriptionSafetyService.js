// services/prescriptionSafetyService.js
// Drug-drug interaction and allergy checking service

const PatientPrescription = require("../models/PatientPrescriptionModel");
const PatientMedicalRecord = require("../models/PatientMedicalRecordModel");
const mongoose = require("mongoose");

/**
 * Mock drug-drug interaction database
 * In production, this would connect to a real drug interaction API
 */
const DRUG_INTERACTIONS = {
  "Aspirin": ["Warfarin", "Ibuprofen", "Naproxen"],
  "Warfarin": ["Aspirin", "Ibuprofen", "Naproxen", "Acetaminophen"],
  "Ibuprofen": ["Aspirin", "Warfarin", "Naproxen"],
  "Metformin": ["Insulin", "Sulfonylureas"],
  "Insulin": ["Metformin", "Sulfonylureas"],
  "Amoxicillin": ["Warfarin"],
  "Penicillin": ["Warfarin"],
  "Ciprofloxacin": ["Warfarin", "Theophylline"],
  "Digoxin": ["Furosemide", "Amiodarone"],
  "Lithium": ["Furosemide", "Thiazide diuretics"]
};

/**
 * Check for drug-drug interactions
 * @param {string} patientId - Patient ID
 * @param {string} newMedicationName - New medication to check
 * @returns {Promise<{hasInteractions: boolean, interactions: Array, warnings: Array}>}
 */
const checkDrugInteractions = async (patientId, newMedicationName) => {
  try {
    const now = new Date();
    
    // Get all active prescriptions for this patient
    const activePrescriptions = await PatientPrescription.find({
      patientId: new mongoose.Types.ObjectId(patientId),
      isActive: true,
      isDeleted: false,
      startDate: { $lte: now },
      endDate: { $gte: now }
    }).lean();
    
    const interactions = [];
    const warnings = [];
    
    // Normalize medication name for comparison
    const normalizedNewMed = normalizeMedicationName(newMedicationName);
    
    // Check each active prescription
    for (const prescription of activePrescriptions) {
      const normalizedExisting = normalizeMedicationName(prescription.medicationName);
      
      // Check if new medication interacts with existing
      if (DRUG_INTERACTIONS[normalizedNewMed]) {
        const interactingDrugs = DRUG_INTERACTIONS[normalizedNewMed];
        if (interactingDrugs.some(drug => 
          normalizeMedicationName(drug) === normalizedExisting ||
          normalizedExisting.includes(normalizeMedicationName(drug)) ||
          normalizeMedicationName(drug).includes(normalizedExisting)
        )) {
          interactions.push({
            medication1: newMedicationName,
            medication2: prescription.medicationName,
            severity: "moderate", // moderate, severe, mild
            description: `Potential interaction between ${newMedicationName} and ${prescription.medicationName}. Please consult with pharmacist.`
          });
        }
      }
      
      // Check reverse (existing medication's interactions)
      if (DRUG_INTERACTIONS[normalizedExisting]) {
        const interactingDrugs = DRUG_INTERACTIONS[normalizedExisting];
        if (interactingDrugs.some(drug => 
          normalizeMedicationName(drug) === normalizedNewMed ||
          normalizedNewMed.includes(normalizeMedicationName(drug)) ||
          normalizeMedicationName(drug).includes(normalizedNewMed)
        )) {
          interactions.push({
            medication1: prescription.medicationName,
            medication2: newMedicationName,
            severity: "moderate",
            description: `Potential interaction between ${prescription.medicationName} and ${newMedicationName}. Please consult with pharmacist.`
          });
        }
      }
    }
    
    // Check for duplicate prescriptions (same medication, dosage, and start date within 30 seconds)
    const recentDuplicate = await PatientPrescription.findOne({
      patientId: new mongoose.Types.ObjectId(patientId),
      medicationName: { $regex: new RegExp(normalizedNewMed, 'i') },
      isDeleted: false,
      createdAt: { $gte: new Date(Date.now() - 30000) } // Within last 30 seconds
    }).lean();
    
    if (recentDuplicate) {
      warnings.push({
        type: "duplicate",
        message: "A similar prescription was created very recently. Please verify this is not a duplicate."
      });
    }
    
    return {
      hasInteractions: interactions.length > 0,
      interactions: interactions,
      warnings: warnings,
      activeMedications: activePrescriptions.map(p => p.medicationName)
    };
  } catch (error) {
    console.error("Error checking drug interactions:", error);
    throw error;
  }
};

/**
 * Check for allergies
 * @param {string} patientId - Patient ID
 * @param {string} medicationName - Medication to check
 * @returns {Promise<{hasAllergy: boolean, allergy: string|null, requiresOverride: boolean}>}
 */
const checkAllergies = async (patientId, medicationName) => {
  try {
    // Get patient's medical record to check allergies
    const medicalRecord = await PatientMedicalRecord.findOne({
      patientId: new mongoose.Types.ObjectId(patientId)
    }).sort({ createdAt: -1 }).lean();
    
    if (!medicalRecord || !medicalRecord.allergies || medicalRecord.allergies.length === 0) {
      return {
        hasAllergy: false,
        allergy: null,
        requiresOverride: false
      };
    }
    
    const normalizedMed = normalizeMedicationName(medicationName);
    const allergies = medicalRecord.allergies || [];
    
    // Check if medication matches any allergy
    for (const allergy of allergies) {
      const normalizedAllergy = normalizeMedicationName(allergy);
      
      // Exact match or partial match
      if (normalizedMed === normalizedAllergy ||
          normalizedMed.includes(normalizedAllergy) ||
          normalizedAllergy.includes(normalizedMed)) {
        return {
          hasAllergy: true,
          allergy: allergy,
          requiresOverride: true,
          message: `WARNING: Patient is allergic to ${allergy}. This medication may cause an allergic reaction.`
        };
      }
    }
    
    return {
      hasAllergy: false,
      allergy: null,
      requiresOverride: false
    };
  } catch (error) {
    console.error("Error checking allergies:", error);
    throw error;
  }
};

/**
 * Normalize medication name for comparison
 * @param {string} name - Medication name
 * @returns {string} - Normalized name
 */
const normalizeMedicationName = (name) => {
  if (!name) return "";
  return name.trim().toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' '); // Normalize whitespace
};

/**
 * Comprehensive safety check before creating prescription
 * @param {string} patientId - Patient ID
 * @param {string} medicationName - Medication name
 * @param {string} dosage - Dosage
 * @param {Date} startDate - Start date
 * @returns {Promise<{safe: boolean, interactions: Array, allergies: Array, warnings: Array}>}
 */
const performSafetyCheck = async (patientId, medicationName, dosage, startDate) => {
  try {
    const [interactionCheck, allergyCheck] = await Promise.all([
      checkDrugInteractions(patientId, medicationName),
      checkAllergies(patientId, medicationName)
    ]);
    
    const result = {
      safe: !interactionCheck.hasInteractions && !allergyCheck.hasAllergy,
      interactions: interactionCheck.interactions,
      allergies: allergyCheck.hasAllergy ? [{
        medication: medicationName,
        allergy: allergyCheck.allergy,
        message: allergyCheck.message
      }] : [],
      warnings: interactionCheck.warnings,
      activeMedications: interactionCheck.activeMedications,
      requiresOverride: allergyCheck.requiresOverride || interactionCheck.hasInteractions
    };
    
    return result;
  } catch (error) {
    console.error("Error performing safety check:", error);
    throw error;
  }
};

module.exports = {
  checkDrugInteractions,
  checkAllergies,
  performSafetyCheck,
  normalizeMedicationName
};

