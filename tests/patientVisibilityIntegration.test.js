// tests/patientVisibilityIntegration.test.js
// Integration tests for patient visibility API endpoints

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server').app;
const DocAppointment = require('../models/DoctorAppointmentModel');
const DoctorPatientMapping = require('../models/DoctorPatientMappingModel');
const Patient = require('../models/PatientModel');
const Doctor = require('../models/DoctorModel');

describe('Patient Visibility API Integration Tests', () => {
  let testDoctorId;
  let testPatientId;
  let testAppointmentId;

  beforeAll(async () => {
    // Connect to test database
    const mongoUri = process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/tabeeb_test';
    await mongoose.connect(mongoUri);

    // Create test doctor and patient
    const doctor = await Doctor.create({
      DoctorName: 'Test Doctor',
      email: 'testdoctor@test.com',
      password: 'hashedpassword'
    });
    testDoctorId = doctor._id;

    const patient = await Patient.create({
      firstName: 'Test',
      lastName: 'Patient',
      emailAddress: 'testpatient@test.com',
      phone: '1234567890'
    });
    testPatientId = patient._id;
  });

  afterAll(async () => {
    // Cleanup
    await DocAppointment.deleteMany({ doctorId: testDoctorId, patientId: testPatientId });
    await DoctorPatientMapping.deleteMany({ doctorId: testDoctorId, patientId: testPatientId });
    await Patient.deleteMany({ _id: testPatientId });
    await Doctor.deleteMany({ _id: testDoctorId });
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    // Clean up before each test
    await DocAppointment.deleteMany({ doctorId: testDoctorId, patientId: testPatientId });
    await DoctorPatientMapping.deleteMany({ doctorId: testDoctorId, patientId: testPatientId });
  });

  describe('GET /api/doctor/patients?doctorId=...', () => {
    test('Should return only visible patients', async () => {
      // Create appointments
      const pastDate = new Date('2024-01-15');
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      await DocAppointment.create({
        doctorId: testDoctorId,
        patientId: testPatientId,
        appointmentDate: pastDate,
        status: 'completed'
      });

      // Create mapping with expired visibility
      const expiredDate = new Date('2024-01-01');
      await DoctorPatientMapping.create({
        doctorId: testDoctorId,
        patientId: testPatientId,
        isRemoved: false,
        lastVisibleDate: expiredDate
      });

      const response = await request(app)
        .get(`/api/doctor/patients?doctorId=${testDoctorId}`)
        .expect(200);

      // Patient should not be in the list (expired)
      expect(response.body).toBeInstanceOf(Array);
      const patientInList = response.body.find(p => p._id === testPatientId.toString());
      expect(patientInList).toBeUndefined();
    });

    test('Should return patients with valid visibility', async () => {
      // Create appointment
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      await DocAppointment.create({
        doctorId: testDoctorId,
        patientId: testPatientId,
        appointmentDate: futureDate,
        status: 'upcoming'
      });

      // Create mapping with future visibility
      const futureVisibleDate = new Date();
      futureVisibleDate.setDate(futureVisibleDate.getDate() + 60);
      await DoctorPatientMapping.create({
        doctorId: testDoctorId,
        patientId: testPatientId,
        isRemoved: false,
        lastVisibleDate: futureVisibleDate
      });

      const response = await request(app)
        .get(`/api/doctor/patients?doctorId=${testDoctorId}`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      const patientInList = response.body.find(p => p._id === testPatientId.toString());
      expect(patientInList).toBeDefined();
      expect(patientInList.lastVisibleDate).toBeDefined();
    });
  });

  describe('GET /api/doctor/patients/:id/medical-record?doctorId=...', () => {
    test('Should return 403 when visibility expired', async () => {
      // Create appointment
      await DocAppointment.create({
        doctorId: testDoctorId,
        patientId: testPatientId,
        appointmentDate: new Date('2024-01-15'),
        status: 'completed'
      });

      // Create mapping with expired visibility
      const expiredDate = new Date('2024-01-01');
      await DoctorPatientMapping.create({
        doctorId: testDoctorId,
        patientId: testPatientId,
        isRemoved: false,
        lastVisibleDate: expiredDate
      });

      const response = await request(app)
        .get(`/api/doctor/patients/${testPatientId}/medical-record?doctorId=${testDoctorId}`)
        .expect(403);

      expect(response.body.message).toContain('Access denied');
    });

    test('Should return patient details when visibility valid', async () => {
      // Create appointment
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      await DocAppointment.create({
        doctorId: testDoctorId,
        patientId: testPatientId,
        appointmentDate: futureDate,
        status: 'upcoming'
      });

      // No mapping (fully visible)
      const response = await request(app)
        .get(`/api/doctor/patients/${testPatientId}/medical-record?doctorId=${testDoctorId}`)
        .expect(200);

      expect(response.body.patient).toBeDefined();
    });
  });

  describe('PUT /api/doctor/appointments/:id (cancel)', () => {
    test('Should update visibility when appointment is canceled', async () => {
      // Create a single appointment
      const appointment = await DocAppointment.create({
        doctorId: testDoctorId,
        patientId: testPatientId,
        appointmentDate: new Date('2024-12-25'),
        status: 'upcoming'
      });

      // Cancel the appointment
      const response = await request(app)
        .put(`/api/doctor/appointments/${appointment._id}`)
        .send({
          status: 'canceled',
          cancellation_reason: 'Test cancellation'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.visibilityUpdate).toBeDefined();

      // Verify mapping was created
      const mapping = await DoctorPatientMapping.findOne({
        doctorId: testDoctorId,
        patientId: testPatientId
      });

      expect(mapping).not.toBeNull();
      expect(mapping.isRemoved).toBe(true); // No remaining appointments
    });
  });
});

