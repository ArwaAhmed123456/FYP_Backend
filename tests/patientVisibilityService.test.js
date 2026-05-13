// tests/patientVisibilityService.test.js
const mongoose = require('mongoose');
const DocAppointment = require('../models/DoctorAppointmentModel');
const DoctorPatientMapping = require('../models/DoctorPatientMappingModel');
const {
  computeLastVisibleDate,
  updateVisibilityAfterCancellation,
  checkPatientVisibility,
  normalizeToUTCDay
} = require('../services/patientVisibilityService');

// Mock data helpers
const createMockAppointment = (doctorId, patientId, appointmentDate, status = 'upcoming') => ({
  doctorId: new mongoose.Types.ObjectId(doctorId),
  patientId: new mongoose.Types.ObjectId(patientId),
  appointmentDate: new Date(appointmentDate),
  status
});

describe('Patient Visibility Service', () => {
  let testDoctorId;
  let testPatientId;
  let session;

  beforeAll(async () => {
    // Connect to test database
    const mongoUri = process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/tabeeb_test';
    await mongoose.connect(mongoUri);
    
    testDoctorId = new mongoose.Types.ObjectId();
    testPatientId = new mongoose.Types.ObjectId();
  });

  afterAll(async () => {
    // Cleanup
    await DocAppointment.deleteMany({ doctorId: testDoctorId, patientId: testPatientId });
    await DoctorPatientMapping.deleteMany({ doctorId: testDoctorId, patientId: testPatientId });
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    // Start session for each test
    session = await mongoose.startSession();
    session.startTransaction();
    
    // Clean up before each test
    await DocAppointment.deleteMany({ doctorId: testDoctorId, patientId: testPatientId });
    await DoctorPatientMapping.deleteMany({ doctorId: testDoctorId, patientId: testPatientId });
  });

  afterEach(async () => {
    // Abort transaction and end session
    await session.abortTransaction();
    session.endSession();
  });

  describe('computeLastVisibleDate', () => {
    test('Case A: Single appointment → cancel → should return null', async () => {
      // Create a single appointment
      const appointment = await DocAppointment.create([{
        doctorId: testDoctorId,
        patientId: testPatientId,
        appointmentDate: new Date('2024-12-20'),
        status: 'upcoming'
      }], { session });

      // Compute last visible date excluding this appointment (simulating cancellation)
      const lastVisibleDate = await computeLastVisibleDate(
        testDoctorId,
        testPatientId,
        appointment[0]._id
      );

      expect(lastVisibleDate).toBeNull();
    });

    test('Case B: Past appointments exist, no future → cancel upcoming → should return most recent past appointment date', async () => {
      const pastDate1 = new Date('2024-01-15');
      const pastDate2 = new Date('2024-02-20');
      const futureDate = new Date('2024-12-25');

      // Create past completed appointments
      await DocAppointment.create([{
        doctorId: testDoctorId,
        patientId: testPatientId,
        appointmentDate: pastDate1,
        status: 'completed'
      }, {
        doctorId: testDoctorId,
        patientId: testPatientId,
        appointmentDate: pastDate2,
        status: 'completed'
      }], { session });

      // Create future appointment to cancel
      const futureAppt = await DocAppointment.create([{
        doctorId: testDoctorId,
        patientId: testPatientId,
        appointmentDate: futureDate,
        status: 'upcoming'
      }], { session });

      // Compute last visible date excluding the future appointment
      const lastVisibleDate = await computeLastVisibleDate(
        testDoctorId,
        testPatientId,
        futureAppt[0]._id
      );

      expect(lastVisibleDate).not.toBeNull();
      const expectedDate = normalizeToUTCDay(pastDate2);
      expect(normalizeToUTCDay(lastVisibleDate).getTime()).toBe(expectedDate.getTime());
    });

    test('Case C: Multiple future appointments exist → cancel one → should return date of next future appointment', async () => {
      const futureDate1 = new Date('2024-12-20');
      const futureDate2 = new Date('2025-01-15');
      const futureDate3 = new Date('2025-02-10');

      // Create multiple future appointments
      const appt1 = await DocAppointment.create([{
        doctorId: testDoctorId,
        patientId: testPatientId,
        appointmentDate: futureDate1,
        status: 'upcoming'
      }], { session });

      await DocAppointment.create([{
        doctorId: testDoctorId,
        patientId: testPatientId,
        appointmentDate: futureDate2,
        status: 'upcoming'
      }, {
        doctorId: testDoctorId,
        patientId: testPatientId,
        appointmentDate: futureDate3,
        status: 'upcoming'
      }], { session });

      // Compute last visible date excluding the first appointment
      const lastVisibleDate = await computeLastVisibleDate(
        testDoctorId,
        testPatientId,
        appt1[0]._id
      );

      expect(lastVisibleDate).not.toBeNull();
      const expectedDate = normalizeToUTCDay(futureDate2); // Next future appointment
      expect(normalizeToUTCDay(lastVisibleDate).getTime()).toBe(expectedDate.getTime());
    });
  });

  describe('updateVisibilityAfterCancellation', () => {
    test('Should mark patient as removed when no appointments remain', async () => {
      // Create a single appointment
      const appointment = await DocAppointment.create([{
        doctorId: testDoctorId,
        patientId: testPatientId,
        appointmentDate: new Date('2024-12-20'),
        status: 'upcoming'
      }], { session });

      // Update visibility after cancellation
      const result = await updateVisibilityAfterCancellation(
        testDoctorId,
        testPatientId,
        appointment[0]._id,
        session
      );

      expect(result.isRemoved).toBe(true);
      expect(result.lastVisibleDate).toBeNull();

      // Verify mapping was created
      const mapping = await DoctorPatientMapping.findOne({
        doctorId: testDoctorId,
        patientId: testPatientId
      }).session(session);

      expect(mapping).not.toBeNull();
      expect(mapping.isRemoved).toBe(true);
    });

    test('Should set lastVisibleDate when appointments remain', async () => {
      const pastDate = new Date('2024-01-15');
      const futureDate = new Date('2024-12-25');

      // Create past and future appointments
      await DocAppointment.create([{
        doctorId: testDoctorId,
        patientId: testPatientId,
        appointmentDate: pastDate,
        status: 'completed'
      }], { session });

      const futureAppt = await DocAppointment.create([{
        doctorId: testDoctorId,
        patientId: testPatientId,
        appointmentDate: futureDate,
        status: 'upcoming'
      }], { session });

      // Cancel a different appointment (simulate)
      const cancelAppt = await DocAppointment.create([{
        doctorId: testDoctorId,
        patientId: testPatientId,
        appointmentDate: new Date('2024-06-10'),
        status: 'upcoming'
      }], { session });

      // Update visibility after cancellation
      const result = await updateVisibilityAfterCancellation(
        testDoctorId,
        testPatientId,
        cancelAppt[0]._id,
        session
      );

      expect(result.isRemoved).toBe(false);
      expect(result.lastVisibleDate).not.toBeNull();

      // Verify mapping
      const mapping = await DoctorPatientMapping.findOne({
        doctorId: testDoctorId,
        patientId: testPatientId
      }).session(session);

      expect(mapping).not.toBeNull();
      expect(mapping.isRemoved).toBe(false);
      expect(mapping.lastVisibleDate).not.toBeNull();
    });
  });

  describe('checkPatientVisibility', () => {
    test('Should return canView: true when no mapping exists (backward compatibility)', async () => {
      const result = await checkPatientVisibility(testDoctorId, testPatientId);
      expect(result.canView).toBe(true);
    });

    test('Should return canView: false when patient is removed', async () => {
      await DoctorPatientMapping.create({
        doctorId: testDoctorId,
        patientId: testPatientId,
        isRemoved: true
      });

      const result = await checkPatientVisibility(testDoctorId, testPatientId);
      expect(result.canView).toBe(false);
      expect(result.reason).toBeDefined();
    });

    test('Should return canView: false when lastVisibleDate has passed', async () => {
      const pastDate = new Date('2024-01-01');
      await DoctorPatientMapping.create({
        doctorId: testDoctorId,
        patientId: testPatientId,
        isRemoved: false,
        lastVisibleDate: pastDate
      });

      const result = await checkPatientVisibility(testDoctorId, testPatientId);
      expect(result.canView).toBe(false);
      expect(result.reason).toContain('Access denied');
    });

    test('Should return canView: true when lastVisibleDate is in the future', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30); // 30 days from now

      await DoctorPatientMapping.create({
        doctorId: testDoctorId,
        patientId: testPatientId,
        isRemoved: false,
        lastVisibleDate: futureDate
      });

      const result = await checkPatientVisibility(testDoctorId, testPatientId);
      expect(result.canView).toBe(true);
      expect(result.lastVisibleDate).toBeDefined();
    });
  });
});

