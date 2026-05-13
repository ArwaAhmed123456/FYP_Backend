// scripts/migrate_patient_visibility.js
// Migration script to compute last_visible_date for existing doctor-patient relationships
// Run this once after deploying the visibility feature to initialize existing data

require('dotenv').config({ path: '../../.env' });
const mongoose = require('mongoose');
const DocAppointment = require('../models/DoctorAppointmentModel');
const DoctorPatientMapping = require('../models/DoctorPatientMappingModel');
const { computeLastVisibleDate, normalizeToUTCDay } = require('../services/patientVisibilityService');

async function migratePatientVisibility() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/tabeeb';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Get all unique doctor-patient pairs from appointments
    const appointments = await DocAppointment.find({
      status: { $ne: 'canceled' } // Only consider non-canceled appointments
    }).lean();

    console.log(`📋 Found ${appointments.length} non-canceled appointments`);

    // Group by doctor-patient pairs
    const doctorPatientPairs = new Map();
    appointments.forEach(apt => {
      const key = `${apt.doctorId}_${apt.patientId}`;
      if (!doctorPatientPairs.has(key)) {
        doctorPatientPairs.set(key, {
          doctorId: apt.doctorId,
          patientId: apt.patientId,
          appointments: []
        });
      }
      doctorPatientPairs.get(key).appointments.push(apt);
    });

    console.log(`👥 Found ${doctorPatientPairs.size} unique doctor-patient pairs`);

    let processed = 0;
    let created = 0;
    let updated = 0;
    let errors = 0;

    // Process each pair
    for (const [key, pair] of doctorPatientPairs) {
      try {
        processed++;
        
        // Compute last visible date
        const lastVisibleDate = await computeLastVisibleDate(
          pair.doctorId,
          pair.patientId,
          null // No canceled appointment to exclude
        );

        // Check if mapping already exists
        const existingMapping = await DoctorPatientMapping.findOne({
          doctorId: pair.doctorId,
          patientId: pair.patientId
        });

        if (lastVisibleDate === null) {
          // No remaining appointments - mark as removed
          if (existingMapping) {
            existingMapping.isRemoved = true;
            existingMapping.lastVisibleDate = null;
            existingMapping.lastUpdatedBy = 'migration';
            existingMapping.lastUpdatedReason = 'Migration: No remaining appointments found';
            await existingMapping.save();
            updated++;
          } else {
            await DoctorPatientMapping.create({
              doctorId: pair.doctorId,
              patientId: pair.patientId,
              isRemoved: true,
              lastVisibleDate: null,
              lastUpdatedBy: 'migration',
              lastUpdatedReason: 'Migration: No remaining appointments found'
            });
            created++;
          }
        } else {
          // Set last visible date
          if (existingMapping) {
            existingMapping.isRemoved = false;
            existingMapping.lastVisibleDate = lastVisibleDate;
            existingMapping.lastUpdatedBy = 'migration';
            existingMapping.lastUpdatedReason = 'Migration: Computed from existing appointments';
            await existingMapping.save();
            updated++;
          } else {
            await DoctorPatientMapping.create({
              doctorId: pair.doctorId,
              patientId: pair.patientId,
              isRemoved: false,
              lastVisibleDate: lastVisibleDate,
              lastUpdatedBy: 'migration',
              lastUpdatedReason: 'Migration: Computed from existing appointments'
            });
            created++;
          }
        }

        if (processed % 100 === 0) {
          console.log(`   Processed ${processed}/${doctorPatientPairs.size} pairs...`);
        }
      } catch (error) {
        errors++;
        console.error(`   ❌ Error processing pair ${key}:`, error.message);
      }
    }

    console.log('\n✅ Migration completed!');
    console.log(`   Processed: ${processed}`);
    console.log(`   Created: ${created}`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Errors: ${errors}`);

    // Close connection
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run migration
migratePatientVisibility();

