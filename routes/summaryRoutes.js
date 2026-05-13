const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const MeetingSummaryModel = require('../models/MeetingSummaryModel');
const DocPatientCallModel = require('../models/DocPatientCallModel');
const { getCollection } = require('../services/mongodb');
const { ObjectId } = require('mongodb');
const { fetchTranscript, generateSummary } = require('../services/meetingSummaryService');
const { authenticateToken } = require('../middleware/authChat');

/**
 * POST /api/summary/generate
 * Generate a consultation summary from the call transcript.
 * Body: { appointmentId, callId, language? }
 */
router.post('/generate', authenticateToken, async (req, res) => {
  try {
    const { appointmentId, callId, language } = req.body;

    if (!appointmentId || !callId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: appointmentId and callId',
      });
    }

    // Check if summary already exists
    const existing = await MeetingSummaryModel.findOne({ appointmentId }).lean();
    if (existing) {
      return res.json({ success: true, summary: existing });
    }

    // Look up call record for doctor/patient info
    const call = await DocPatientCallModel.findOne({
      $or: [
        { appointmentId },
        { callId },
        { meetingRoomId: callId },
      ],
    }).lean();

    let doctorName = 'Doctor';
    let patientName = 'Patient';
    let doctorId = call?.doctorId || 'unknown';
    let patientId = call?.patientId || 'unknown';

    if (call?.doctorId) {
      try {
        const doctorsCollection = await getCollection('Doctor');
        const doctorObjectId = ObjectId.isValid(call.doctorId)
          ? new ObjectId(call.doctorId)
          : null;
        const doctor = doctorObjectId
          ? await doctorsCollection.findOne({ _id: doctorObjectId })
          : null;
        doctorName = doctor?.DoctorName || 'Doctor';
      } catch (err) {
        console.error('[summaryRoutes] Error fetching doctor:', err.message);
      }
    }

    if (call?.patientId) {
      try {
        const usersCollection = await getCollection('users');
        const patientObjectId = ObjectId.isValid(call.patientId)
          ? new ObjectId(call.patientId)
          : null;
        const patient = patientObjectId
          ? await usersCollection.findOne({ _id: patientObjectId })
          : null;
        patientName = patient?.name || patient?.fullName || 'Patient';
      } catch (err) {
        console.error('[summaryRoutes] Error fetching patient:', err.message);
      }
    }

    // Fetch transcript from transcription gateway
    const transcript = await fetchTranscript(callId);

    if (!transcript || transcript.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No transcript available for this consultation',
      });
    }

    // Generate summary using OpenAI
    const lang = language === 'ur' ? 'ur' : 'en';
    const summaryData = await generateSummary(transcript, lang);

    if (!summaryData) {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate summary',
      });
    }

    // Store summary
    const summary = await MeetingSummaryModel.create({
      appointmentId,
      callId,
      doctorId,
      patientId,
      doctorName,
      patientName,
      transcript,
      summary: summaryData,
      language: lang,
    });

    res.json({ success: true, summary });
  } catch (err) {
    console.error('[summaryRoutes] POST /generate error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * GET /api/summary/:appointmentId
 * Retrieve an existing summary.
 */
router.get('/:appointmentId', authenticateToken, async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const summary = await MeetingSummaryModel.findOne({ appointmentId }).lean();

    if (!summary) {
      return res.status(404).json({
        success: false,
        message: 'Summary not found',
      });
    }

    res.json({ success: true, summary });
  } catch (err) {
    console.error('[summaryRoutes] GET /:appointmentId error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * GET /api/summary/:appointmentId/pdf
 * Generate and return a PDF of the consultation summary.
 */
router.get('/:appointmentId/pdf', authenticateToken, async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const record = await MeetingSummaryModel.findOne({ appointmentId }).lean();

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Summary not found',
      });
    }

    const { summary, doctorName, patientName, generatedAt } = record;
    const isUrdu = record.language === 'ur';

    // Create PDF
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="consultation_summary_${appointmentId}.pdf"`
    );
    doc.pipe(res);

    // Title
    doc
      .fontSize(22)
      .font('Helvetica-Bold')
      .text(isUrdu ? 'مشاورت کا خلاصہ' : 'Consultation Summary', {
        align: 'center',
      });
    doc.moveDown(0.5);

    // Metadata
    doc
      .fontSize(11)
      .font('Helvetica')
      .text(
        `${isUrdu ? 'ڈاکٹر' : 'Doctor'}: ${doctorName}    |    ${isUrdu ? 'مریض' : 'Patient'}: ${patientName}`,
        { align: 'center' }
      );
    doc.text(
      `${isUrdu ? 'تاریخ' : 'Date'}: ${new Date(generatedAt).toLocaleDateString()}`,
      { align: 'center' }
    );
    doc.moveDown(1);

    // Divider
    doc
      .moveTo(50, doc.y)
      .lineTo(545, doc.y)
      .stroke('#cccccc');
    doc.moveDown(0.5);

    // Sections
    const sections = [
      { title: isUrdu ? 'خلاصہ' : 'Overview', content: summary.overview },
      { title: isUrdu ? 'زیر بحث علامات' : 'Symptoms Discussed', content: summary.symptomsDiscussed },
      { title: isUrdu ? 'تشخیص' : 'Diagnosis', content: summary.diagnosis },
      { title: isUrdu ? 'نسخے' : 'Prescriptions', content: summary.prescriptions },
      { title: isUrdu ? 'فالو اپ پلان' : 'Follow-up Plan', content: summary.followUpPlan },
      { title: isUrdu ? 'اضافی نوٹس' : 'Additional Notes', content: summary.additionalNotes },
    ];

    for (const section of sections) {
      if (section.content) {
        doc
          .fontSize(14)
          .font('Helvetica-Bold')
          .text(section.title);
        doc.moveDown(0.3);
        doc
          .fontSize(11)
          .font('Helvetica')
          .text(section.content, { lineGap: 3 });
        doc.moveDown(0.8);
      }
    }

    // Footer
    doc.moveDown(1);
    doc
      .moveTo(50, doc.y)
      .lineTo(545, doc.y)
      .stroke('#cccccc');
    doc.moveDown(0.5);
    doc
      .fontSize(9)
      .font('Helvetica-Oblique')
      .fillColor('#888888')
      .text(
        isUrdu
          ? 'یہ خلاصہ AI کی مدد سے تیار کیا گیا ہے۔ براہ کرم طبی فیصلوں کے لیے اپنے ڈاکٹر سے مشورہ کریں۔'
          : 'This summary was generated with AI assistance. Please consult your doctor for medical decisions.',
        { align: 'center' }
      );

    doc.end();
  } catch (err) {
    console.error('[summaryRoutes] GET /:appointmentId/pdf error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
