require('dotenv').config();
require('dns').setDefaultResultOrder('ipv4first');

// Global error handlers to prevent crash
process.on('uncaughtException', (err) => {
  console.error('🔥 UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');

// Patient backend routes
const locationsRouter = require('./routes/locations');
const profileRouter = require('./routes/profile');
const authRouter = require('./routes/auth');
const healthTipsRouter = require('./routes/healthTips');
const doctorsRouter = require('./routes/doctors');
const appointmentsRouter = require('./routes/appointments');

// Doctor backend routes
const docAuthRouter = require('./routes/docAuthRoute');
const doctorRoutes = require('./routes/doctorRoutes');
const docAppointmentRoutes = require('./routes/docAppointmentRoute');
const doctorAvailabilityRoutes = require('./routes/doctorAvailabilityRoute');
const patientRoutes = require('./routes/PatientRoute');
const patientDetailRoutes = require('./routes/PatientDetailRoute');
const adminNotificationRoutes = require('./routes/adminNotificationRoute');
const doctorNotificationRoutes = require('./routes/doctorNotificationRoute');
const patientNotificationRoutes = require('./routes/patientNotificationRoute');
const doctorSignupValidationRoutes = require('./routes/doctorSignupValidationRoute');
const emailOTPRoutes = require('./routes/emailOTPRoute');
const passwordResetRoutes = require('./routes/PasswordResetRoutes');
const chatbotRouter = require('./routes/chatbot');
const prescriptionRoutes = require('./routes/prescriptionRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const doctorFinanceRoutes = require('./routes/doctorFinanceRoutes');
const blogRoutes = require('./routes/blogRoutes');
const medicalRecordRoutes = require('./routes/medicalRecordRoutes');
const ocrProxyRoute = require('./routes/ocrProxyRoute');

// MongoDB services
const { connectToMongoDB, testConnection, healthCheck } = require('./services/mongodb');
const connectDB = require('./config/db');

// Socket.io setup
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});
app.set('io', io);

const PORT = process.env.PORT || 3000; // Unified backend port (3000)

// Load call routes after io is created
const callRoutes = require('./routes/callRoutes');
const callScheduler = require('./services/callScheduler');

// Stripe webhook MUST be registered before express.json() — Stripe requires the raw body for signature verification
// Handles both "Your account" events and "Connected accounts" events (account.updated for doctor Stripe Express)
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }), require('./routes/stripeWebhookRoute'));

// Middleware
app.use(cors());
app.use(express.json({ limit: '20mb' }));

// Global Debug Logger
app.use((req, res, next) => {
  if (req.originalUrl.includes('/api/va')) {
    console.log(`📡 [VA_DEBUG] ${req.method} ${req.originalUrl}`);
    // Only log small bodies to prevent terminal flooding with base64 audio
    if (req.method === 'POST' && req.body && !req.body.audio && !req.body.base64) {
      console.log('📦 Body:', JSON.stringify(req.body, null, 2));
    } else if (req.body?.audio || req.body?.base64) {
      console.log('📦 Body: [Audio Data Omitted]');
    }
  }
  next();
});

// Serve uploaded blog PDFs (doctor uploads)
app.use('/api/uploads/blogs', express.static(path.join(__dirname, 'uploads', 'blogs')));

// Serve uploaded files statically (must be after call routes to avoid conflicts)
// Note: Static file serving for /api/call/files/:callId/:filename is handled by the route
// This is kept for backward compatibility but may not be needed

// Patient Backend Routes
app.use('/api', locationsRouter);
app.use('/api/profile', profileRouter);
app.use('/api/auth', authRouter);
app.use('/api/health-tips', healthTipsRouter);
app.use('/api/doctors', doctorsRouter);
app.use('/api/appointments', appointmentsRouter);
app.use('/api/blogs', blogRoutes);
app.use('/api', medicalRecordRoutes);
app.use('/api/ocr', ocrProxyRoute); // OCR proxy → HF Space with retry + auth

// Doctor Backend Routes (using /api/doctor prefix to avoid conflicts)
app.use('/api/doctorAuth', docAuthRouter);
app.use('/api/doctor/doctors', doctorRoutes); // Doctor management routes
app.use('/api/doctor/appointments', docAppointmentRoutes); // Doctor appointment management
app.use('/api/doctor/availability', doctorAvailabilityRoutes); // Doctor availability management
app.use('/api/doctor/patients', patientRoutes); // Doctor's patient management
app.use('/api/doctor/patients', patientDetailRoutes); // Doctor's patient details
app.use('/api/adminNotifications', adminNotificationRoutes);
app.use('/api/doctor/notifications', doctorNotificationRoutes);
app.use('/api/patient/notifications', patientNotificationRoutes);
app.use('/api/doctorSignup', doctorSignupValidationRoutes);
app.use('/api/email-otp', emailOTPRoutes);
app.use('/api/password-reset', passwordResetRoutes);
app.use('/api/call', callRoutes);
const summaryRoutes = require('./routes/summaryRoutes');
app.use('/api/summary', summaryRoutes);
app.use('/api/chatbot', chatbotRouter);
const chatRoutes = require('./routes/chatRoutes');
const medicalDictionaryRoutes = require('./routes/medicalDictionaryRoutes');
app.use('/api/chat', chatRoutes);
app.use('/api/medical-dictionary', medicalDictionaryRoutes);
app.use('/api/daily', require('./routes/dailyRoutes')); // Daily.co token generation
app.use('/api/payment', paymentRoutes); // Stripe payment routes
app.use('/api/payment/refund-requests', require('./routes/refundAdminRoute')); // Admin refund list/approve/reject (doc-patient-panel)
app.use('/api/support-request', require('./routes/supportRequestRoute')); // Support request routes (legacy)
app.use('/api/doctor/support-requests', require('./routes/supportRequestRoute')); // Doctor support request routes
app.use('/api/patient/support-requests', require('./routes/supportRequestRoute')); // Patient support request routes
app.use('/api/doctor', doctorFinanceRoutes); // Doctor payment plans, payout details, earnings, transactions, payouts
// Voice Assistant routes - Integrated locally
const vaRoutes = require('./va/backend/routes/vaRoutes');
app.use('/api/va', vaRoutes);
// VA-style STT/TTS (same as VA frontend expects: POST /api/transcribe, POST /api/tts → Python 127.0.0.1:5000)
const ttsRouter = require('./routes/tts');
const transcribeRouter = require('./routes/transcribe');
app.use('/api', ttsRouter);
app.use('/api/transcribe', transcribeRouter);
app.use('/api/ratings', require('./routes/ratingRoutes'));
const feedbackRoutes = require('./routes/feedbackRoutes');
app.use('/api/feedback', feedbackRoutes); // POST /api/feedback/submit
app.use('/api/patient', feedbackRoutes); // GET /api/patient/feedback-history
app.use('/api/doctor', feedbackRoutes); // GET /api/doctor/:id/feedback-*
const adminFeedbackAnalyticsRoutes = require('./routes/adminFeedbackAnalyticsRoute');
app.use('/api/admin', adminFeedbackAnalyticsRoutes); // GET /api/admin/feedback-analytics
// Sentiment analysis cron job (runs every Sunday at 02:00 AM)
require('./jobs/sentimentCronJob');
// Add logging middleware for prescription routes
app.use('/api/doctor/prescriptions', (req, res, next) => {
  console.log(`\n📥 [SERVER] Prescription route hit: ${req.method} ${req.originalUrl}`);
  console.log(`📥 [SERVER] Time: ${new Date().toISOString()}`);
  next();
}, prescriptionRoutes);

// Inject socket.io instance into call routes (after io is created and routes are loaded)
if (typeof callRoutes.setIO === 'function') {
  callRoutes.setIO(io);
}
// Chat socket: join/leave session rooms for real-time chat and dictionary updates
require('./sockets/chatSocket').registerChatSocket(io);

// Inject socket.io instance into call scheduler
if (typeof callScheduler.setIO === 'function') {
  callScheduler.setIO(io);
}

// Root route
app.get('/', (req, res) => {
  res.send('<h1>Tabeeb Unified Backend is Live!</h1><p>Use /api/health to check status.</p>');
});

// Test route to verify server is working
app.get('/test', (req, res) => {
  res.json({ message: 'Server is running!', timestamp: new Date().toISOString() });
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const mongoHealth = await healthCheck();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      mongodb: mongoHealth
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Connect to MongoDB (for doctor backend models using Mongoose)
// This connection is optional - if it fails, the native MongoDB connection will still work
connectDB().catch(err => {
  console.error('⚠️ Mongoose connection failed (non-critical):', err.message);
  console.log('   ℹ️ Server will continue using native MongoDB driver connection');
});

// Schedule daily cleanup of expired availability entries
const cron = require('node-cron');
const cleanupExpiredAvailability = require('./scripts/cleanupExpiredAvailability');
const cleanupOldNotifications = require('./scripts/cleanupOldNotifications');
const notifyMissedAppointments = require('./scripts/notifyMissedAppointments');

// Run cleanup daily at 2 AM
cron.schedule('0 2 * * *', async () => {
  console.log('🕐 Running daily cleanup of expired availability entries...');
  try {
    const result = await cleanupExpiredAvailability();
    console.log('✅ Daily cleanup completed:', result);
  } catch (error) {
    console.error('❌ Daily cleanup failed:', error);
  }
}, {
  scheduled: true,
  timezone: "America/New_York"
});

// Run cleanup for old notifications and activity records daily at 3 AM
cron.schedule('0 3 * * *', async () => {
  console.log('🕐 Running daily cleanup of old notifications and appointment activity...');
  try {
    const result = await cleanupOldNotifications();
    console.log('✅ Notifications cleanup completed:', result);
  } catch (error) {
    console.error('❌ Notifications cleanup failed:', error);
  }
}, {
  scheduled: true,
  timezone: "America/New_York"
});

// Run missed appointments notification check daily at 1 AM
cron.schedule('0 1 * * *', async () => {
  console.log('🕐 Running daily missed appointments notification check...');
  try {
    const result = await notifyMissedAppointments();
    console.log('✅ Missed appointments notification check completed:', result);
  } catch (error) {
    console.error('❌ Missed appointments notification check failed:', error);
  }
}, {
  scheduled: true,
  timezone: "America/New_York"
});

// Post-appointment review request (in-person only): every 5 minutes
const reviewRequestService = require('./services/reviewRequestService');
cron.schedule('*/5 * * * *', async () => {
  try {
    const result = await reviewRequestService.runReviewRequestJob();
    if (result.processed > 0) {
      console.log(`✅ Review request job: sent ${result.processed} notification(s)`);
    }
    if (result.errors?.length) {
      console.warn('⚠️ Review request job had errors:', result.errors.length);
    }
  } catch (error) {
    console.error('❌ Review request job failed:', error);
  }
}, {
  scheduled: true,
  timezone: "America/New_York"
});

console.log('📅 Scheduled jobs:');
console.log('   - Missed appointments notification (runs at 1 AM daily)');
console.log('   - Expired availability cleanup (runs at 2 AM daily)');
console.log('   - Old notifications & activity cleanup (runs at 3 AM daily)');
console.log('   - Post-appointment review request (in-person, every 5 minutes)');

// Schedule call reminder and meeting room creation (runs every 30 seconds)
let schedulerInterval = null;
function startCallScheduler() {
  // Run immediately on startup
  callScheduler.runScheduler().catch(err => {
    console.error('❌ Initial scheduler run failed:', err);
  });

  // Then run every 30 seconds
  schedulerInterval = setInterval(async () => {
    try {
      await callScheduler.runScheduler();
    } catch (error) {
      console.error('❌ Scheduler error:', error);
    }
  }, 30000); // 30 seconds

  console.log('⏰ Call scheduler started (runs every 30 seconds)');
}

// Start scheduler after MongoDB connection is established
setTimeout(() => {
  startCallScheduler();
}, 5000); // Wait 5 seconds for server to fully initialize

// Start prescription expiry job
const { schedulePrescriptionExpiry } = require('./services/prescriptionExpiryService');
setTimeout(() => {
  schedulePrescriptionExpiry();
}, 10000); // Wait 10 seconds for MongoDB to be fully connected

// Start prescription reminder service
const { scheduleReminderChecks } = require('./services/prescriptionReminderService');
setTimeout(() => {
  scheduleReminderChecks();
}, 15000); // Wait 15 seconds for MongoDB to be fully connected

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);

  // Handle authentication (optional - you can add JWT verification here)
  socket.on('authenticate', (data) => {
    const { userId, userRole } = data;
    socket.data.userId = userId;
    socket.data.userRole = userRole;
    console.log(`✅ User authenticated: ${userId} (${userRole})`);
  });

  // Handle call started event
  socket.on('call:started', (data) => {
    const { callId, appointmentId, doctorId } = data;
    console.log(`📞 Call started: ${callId} by doctor ${doctorId}`);

    // Emit to all connected clients (or filter by patient)
    io.emit('CALL_STARTED', {
      callId,
      appointmentId,
      doctorId
    });
  });

  // Handle patient waiting event
  socket.on('patient:waiting', (data) => {
    const { callId, appointmentId, patientId, patientName } = data;
    console.log(`⏳ Patient waiting: ${patientName} (${patientId}) for call ${callId}`);

    // Emit to doctor
    io.emit('PATIENT_WAITING', {
      callId,
      appointmentId,
      patientId,
      patientName
    });
  });

  // Handle patient admitted event
  socket.on('patient:admitted', (data) => {
    const { callId, patientId, appointmentId } = data;
    console.log(`✅ Patient admitted: ${patientId} to call ${callId}`);

    // Emit to specific patient
    io.emit('PATIENT_ADMITTED', {
      callId,
      patientId,
      appointmentId
    });
  });

  // Handle call ended event
  socket.on('call:ended', (data) => {
    const { callId } = data;
    console.log(`📴 Call ended: ${callId}`);

    io.emit('CALL_ENDED', {
      callId
    });
  });

  // Handle doctor acknowledgment of reminder
  socket.on('doctor:acknowledge_reminder', (data) => {
    const { appointmentId, doctorId } = data;
    console.log(`✅ Doctor ${doctorId} acknowledged reminder for appointment ${appointmentId}`);

    // Update call record
    const DocPatientCallModel = require('./models/DocPatientCallModel');
    DocPatientCallModel.findOne({ appointmentId }).then(call => {
      if (call) {
        call.reminders.doctorAcknowledged = true;
        call.reminders.acknowledgedAt = new Date();
        call.save();
      }
    }).catch(err => console.error('Error updating acknowledgment:', err));
  });

  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
  });
});

// Start server
server.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Unified Backend Server running on port ${PORT}`);
  console.log(`📋 Patient Backend: http://localhost:${PORT}/api`);
  console.log(`👨‍⚕️ Doctor Backend: http://localhost:${PORT}/api/doctorAuth`);
  console.log(`📞 Call API: http://localhost:${PORT}/api/call`);
  console.log(`🔌 Socket.io Server: ws://localhost:${PORT}`);

  // Get the actual accessible IP addresses
  const os = require('os');
  const networkInterfaces = os.networkInterfaces();
  const accessibleIPs = [];

  Object.keys(networkInterfaces).forEach(interfaceName => {
    const interfaces = networkInterfaces[interfaceName];
    interfaces.forEach(interface => {
      if (interface.family === 'IPv4' && !interface.internal) {
        accessibleIPs.push(`http://${interface.address}:${PORT}`);
      }
    });
  });

  console.log(`🌐 Server accessible at:`);
  console.log(`   - http://localhost:${PORT} (local development)`);
  accessibleIPs.forEach(ip => {
    console.log(`   - ${ip} (network access)`);
  });

  // Test MongoDB connection on startup
  console.log('🔍 Testing MongoDB connection...');
  const mongoConnected = await testConnection();

  if (mongoConnected) {
    console.log('✅ Backend fully operational with MongoDB!');

    // Clear all OTPs on startup for development
    try {
      const OTPModel = require('./models/OTPModel');
      const collection = await OTPModel.getCollection();
      const result = await collection.deleteMany({});
      console.log(`🧹 Cleared ${result.deletedCount} OTP records on startup`);
    } catch (error) {
      console.log('⚠️ Failed to clear OTP records on startup:', error.message);
    }
  } else {
    console.log('⚠️ Backend running but MongoDB connection failed');
  }
});

// Export io for use in other modules
module.exports = { io, app, server };
