const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const authService = require('../services/auth');
const TransactionModel = require('../models/TransactionModel');
const RefundRequestModel = require('../models/RefundRequestModel');
const { generateInvoicePDF } = require('../services/invoiceService');
const { sendInvoiceEmail } = require('../services/emailService');
const UserModel = require('../models/UserModel');
const SupportRequest = require('../models/SupportRequestModel');
const SupportMessage = require('../models/SupportMessageModel');
const DocAppointment = require('../models/DoctorAppointmentModel');
const PatientNotificationModel = require('../models/PatientNotificationModel');
const PaymentPlan = require('../models/PaymentPlanModel');
const mongoose = require('mongoose');
const { ObjectId } = require('mongodb');

// Booking/payment fee constants (must match frontend for validation)
const DEFAULT_CONSULTATION_FEE = 150;
const SERVICE_FEE = 10;
const TAX = 16;
const PAYMENT_AMOUNT_TOLERANCE = 0.02; // allow 2 cents rounding

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ 
      success: false,
      message: 'Access token required' 
    });
  }

  try {
    const decoded = authService.verifyToken(token);
    req.user = decoded; // Attach user info to request
    next();
  } catch (error) {
    return res.status(403).json({ 
      success: false,
      message: 'Invalid or expired token' 
    });
  }
};

/**
 * GET /api/payment/doctor-plan/:doctorId
 * Returns the doctor's approved, active payment plan for patients (booking price).
 * No auth required so booking UI can show price before sign-in if needed.
 * - Ignores unapproved/inactive plans.
 * - Returns most recent approved plan if multiple.
 * - Missing or invalid doctorId returns { plan: null }, not an error.
 */
router.get('/doctor-plan/:doctorId', async (req, res) => {
  try {
    const { doctorId } = req.params;
    if (!doctorId) {
      return res.json({ success: true, plan: null });
    }
    let id;
    try {
      id = new mongoose.Types.ObjectId(doctorId);
    } catch (_) {
      return res.json({ success: true, plan: null });
    }
    const plan = await PaymentPlan.findOne(
      { doctorId: id, status: 'approved' }
    )
      .sort({ submittedAt: -1 })
      .limit(1)
      .lean();
    if (!plan) {
      return res.json({ success: true, plan: null });
    }
    return res.json({
      success: true,
      plan: {
        planId: plan._id.toString(),
        fee: plan.fee,
        consultationType: plan.consultationType,
        duration: plan.duration,
        description: plan.description || null,
        currency: 'PKR',
        submittedAt: plan.submittedAt,
      },
    });
  } catch (error) {
    console.error('Error fetching doctor plan:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch doctor plan',
      plan: null,
    });
  }
});

/**
 * POST /api/payment/create-payment-intent
 * Creates a Stripe PaymentIntent for an appointment payment
 * 
 * Body:
 * - amount: number (amount in cents, e.g., 17600 for $176.00)
 * - currency: string (default: 'usd')
 * - appointmentId: string (optional, for linking payment to appointment)
 * - metadata: object (optional, additional metadata)
 */
router.post('/create-payment-intent', authenticateToken, async (req, res) => {
  try {
    const { amount, currency = 'usd', appointmentId, doctorId: bodyDoctorId, metadata = {} } = req.body;
    const userId = req.user.userId || req.user._id;

    // Validate amount
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required (in cents)'
      });
    }

    // Normalize amount to dollars for validation (backend accepts dollars if < 1000, else cents)
    const amountDollars = amount < 1000 ? amount : amount / 100;

    // Validate amount against doctor's approved plan (or default) when doctorId is provided
    const doctorId = bodyDoctorId || metadata.doctorId;
    if (doctorId) {
      let expectedConsultationFee = DEFAULT_CONSULTATION_FEE;
      try {
        const id = new mongoose.Types.ObjectId(doctorId);
        const plan = await PaymentPlan.findOne(
          { doctorId: id, status: 'approved' }
        )
          .sort({ submittedAt: -1 })
          .limit(1)
          .lean();
        if (plan && typeof plan.fee === 'number' && plan.fee >= 0) {
          expectedConsultationFee = plan.fee;
        }
      } catch (err) {
        console.error('Error resolving doctor plan for validation:', err);
      }
      const expectedTotal = expectedConsultationFee + SERVICE_FEE + TAX;
      if (Math.abs(amountDollars - expectedTotal) > PAYMENT_AMOUNT_TOLERANCE) {
        return res.status(400).json({
          success: false,
          message: `Amount does not match the doctor's approved consultation fee. Expected total: ${expectedTotal.toFixed(2)}.`,
          expectedTotal,
        });
      }
    }

    // Check for duplicate payment - if appointmentId is provided, check for existing successful payment
    if (appointmentId) {
      try {
        const collection = await TransactionModel.getCollection();
        const existingTransaction = await collection.findOne({
          userId: userId.toString(),
          appointmentId: appointmentId,
          status: 'succeeded',
        });

        if (existingTransaction) {
          return res.status(400).json({
            success: false,
            message: 'A payment already exists for this appointment',
            existingPaymentIntentId: existingTransaction.paymentIntentId,
          });
        }
      } catch (err) {
        console.error('Error checking for duplicate payment:', err);
        // Continue with payment creation if check fails
      }
    }

    // Prepare metadata
    const paymentMetadata = {
      userId: userId.toString(),
      ...metadata
    };

    if (appointmentId) {
      paymentMetadata.appointmentId = appointmentId;
    }
    if (doctorId) {
      paymentMetadata.doctorId = doctorId;
    }

    // Create PaymentIntent
    // Amount should be in cents - if frontend sends dollars, convert; if already in cents, use as is
    const amountInCents = amount < 1000 ? Math.round(amount * 100) : Math.round(amount);
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: currency.toLowerCase(),
      metadata: paymentMetadata,
      automatic_payment_methods: {
        enabled: true,
      },
    });

    console.log('✅ PaymentIntent created:', {
      id: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      userId
    });

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount / 100, // Return in dollars
      currency: paymentIntent.currency,
    });
  } catch (error) {
    console.error('❌ Error creating PaymentIntent:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create payment intent',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * POST /api/payment/confirm-payment
 * Confirms a payment and updates appointment status
 * 
 * Body:
 * - paymentIntentId: string
 * - appointmentId: string (optional)
 */
router.post('/confirm-payment', authenticateToken, async (req, res) => {
  try {
    const { paymentIntentId, appointmentId } = req.body;
    const userId = req.user.userId || req.user._id;

    if (!paymentIntentId) {
      return res.status(400).json({
        success: false,
        message: 'PaymentIntent ID is required'
      });
    }

    // Retrieve PaymentIntent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    // Verify the payment belongs to this user
    if (paymentIntent.metadata.userId !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: Payment does not belong to this user'
      });
    }

    // Save or update transaction in database (for all statuses)
    const saveTransaction = async (status) => {
      try {
        // Check if transaction already exists
        const existingTransaction = await TransactionModel.getTransactionByPaymentIntentId(paymentIntent.id);
        
        const transactionData = {
          userId: userId.toString(),
          paymentIntentId: paymentIntent.id,
          amount: paymentIntent.amount / 100, // Convert from cents to dollars
          currency: paymentIntent.currency,
          status: status,
          doctorId: paymentIntent.metadata.doctorId || null,
          doctorName: null, // Will be populated from appointment if available
          appointmentId: paymentIntent.metadata.appointmentId || appointmentId || null,
          appointmentDate: paymentIntent.metadata.appointmentDate || null,
          appointmentTime: paymentIntent.metadata.appointmentTime || null,
          appointmentType: paymentIntent.metadata.appointmentType || null,
          paymentMethod: null, // Can be extracted from payment intent if needed
          metadata: paymentIntent.metadata,
        };

        // Try to get doctor name if doctorId is available
        if (transactionData.doctorId) {
          try {
            const DoctorModel = require('../models/DoctorModel');
            const mongoose = require('mongoose');
            const doctor = await DoctorModel.findById(new mongoose.Types.ObjectId(transactionData.doctorId));
            if (doctor) {
              transactionData.doctorName = doctor.DoctorName || 'Unknown Doctor';
            }
          } catch (err) {
            console.error('Error fetching doctor name:', err);
          }
        }

        if (existingTransaction) {
          // Update existing transaction
          await TransactionModel.updateTransactionStatus(paymentIntent.id, status);
        } else {
          // Create new transaction
          await TransactionModel.createTransaction(transactionData);
        }
      } catch (err) {
        console.error('Error saving transaction to database:', err);
        // Don't fail the request if transaction save fails
      }
    };

    // Check payment status
    if (paymentIntent.status === 'succeeded') {
      await saveTransaction('succeeded');

      // Update appointment status in database if appointmentId is provided
      let appointmentUpdated = false;
      const finalAppointmentId = appointmentId || paymentIntent.metadata.appointmentId;
      
      if (finalAppointmentId) {
        try {
          const appointment = await DocAppointment.findById(finalAppointmentId);
          if (appointment) {
            // Update appointment - add payment info if schema supports it
            try {
              // Try to update payment-related fields (if they exist in schema)
              if (appointment.schema.paths.paymentStatus) {
                appointment.paymentStatus = 'paid';
              }
              if (appointment.schema.paths.paymentIntentId) {
                appointment.paymentIntentId = paymentIntent.id;
              }
              // Always update the appointment to mark it as paid (we can use notes or metadata)
              appointment.notes = appointment.notes 
                ? `${appointment.notes}\n[Payment confirmed: ${paymentIntent.id}]`
                : `[Payment confirmed: ${paymentIntent.id}]`;
              await appointment.save();
              appointmentUpdated = true;
              console.log(`✅ Updated appointment ${finalAppointmentId} with payment confirmation`);
            } catch (updateError) {
              console.warn(`⚠️ Could not update appointment payment fields: ${updateError.message}`);
              // Still mark as updated since we tried
              appointmentUpdated = true;
            }
          } else {
            console.warn(`⚠️ Appointment ${finalAppointmentId} not found - payment succeeded but appointment doesn't exist`);
            // Auto-create support request for payment/appointment mismatch
            try {
              const supportRequest = new SupportRequest({
                patientId: new ObjectId(userId),
                subject: 'Payment Successful but Appointment Not Found',
                message: `Payment was processed successfully (PaymentIntent: ${paymentIntent.id}, Amount: $${paymentIntent.amount / 100}) but the associated appointment (ID: ${finalAppointmentId}) was not found in the database. Please investigate and create the appointment if needed.`,
                transactionId: paymentIntent.id,
                issueType: 'payment',
                status: 'open',
              });
              await supportRequest.save();
              console.log(`✅ Created support request for payment/appointment mismatch: ${supportRequest._id}`);
            } catch (supportError) {
              console.error('❌ Error creating support request for payment/appointment mismatch:', supportError);
            }
          }
        } catch (appointmentError) {
          console.error('❌ Error updating appointment status:', appointmentError);
          // Auto-create support request for payment/appointment update failure
          try {
            const supportRequest = new SupportRequest({
              patientId: new ObjectId(userId),
              subject: 'Payment Successful but Appointment Update Failed',
              message: `Payment was processed successfully (PaymentIntent: ${paymentIntent.id}, Amount: $${paymentIntent.amount / 100}) but updating the appointment (ID: ${finalAppointmentId}) failed. Error: ${appointmentError.message}. Please investigate and update the appointment manually.`,
              transactionId: paymentIntent.id,
              appointmentId: finalAppointmentId ? new ObjectId(finalAppointmentId) : null,
              issueType: 'payment',
              status: 'open',
            });
            await supportRequest.save();
            console.log(`✅ Created support request for payment/appointment update failure: ${supportRequest._id}`);
          } catch (supportError) {
            console.error('❌ Error creating support request for payment/appointment update failure:', supportError);
          }
        }
      }

      // Notify patient of successful payment
      try {
        await PatientNotificationModel.createNotification({
          patientId: userId.toString(),
          type: 'payment_succeeded',
          title: 'Payment successful',
          description: `Your payment of $${(paymentIntent.amount / 100).toFixed(2)} ${(paymentIntent.currency || 'usd').toUpperCase()} was completed successfully.`,
          icon: 'card-outline',
        });
        console.log('✅ Patient notification created for payment success');
      } catch (notifErr) {
        console.error('❌ Failed to create patient notification for payment:', notifErr);
      }

      res.json({
        success: true,
        status: 'succeeded',
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
        transactionId: paymentIntent.id,
        appointmentUpdated: appointmentUpdated,
      });
    } else if (paymentIntent.status === 'requires_payment_method') {
      await saveTransaction('failed');
      res.status(400).json({
        success: false,
        status: 'requires_payment_method',
        message: 'Payment method is required'
      });
    } else if (paymentIntent.status === 'requires_confirmation') {
      await saveTransaction('pending');
      res.status(400).json({
        success: false,
        status: 'requires_confirmation',
        message: 'Payment requires confirmation'
      });
    } else if (paymentIntent.status === 'canceled' || paymentIntent.status === 'payment_failed') {
      await saveTransaction('failed');
      res.status(400).json({
        success: false,
        status: paymentIntent.status,
        message: `Payment ${paymentIntent.status}`
      });
    } else {
      await saveTransaction('pending');
      res.status(400).json({
        success: false,
        status: paymentIntent.status,
        message: `Payment status: ${paymentIntent.status}`
      });
    }
  } catch (error) {
    console.error('❌ Error confirming payment:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to confirm payment',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /api/payment/payment-status/:paymentIntentId
 * Get the status of a payment
 */
router.get('/payment-status/:paymentIntentId', authenticateToken, async (req, res) => {
  try {
    const { paymentIntentId } = req.params;
    const userId = req.user.userId || req.user._id;

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    // Verify the payment belongs to this user
    if (paymentIntent.metadata.userId !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: Payment does not belong to this user'
      });
    }

    res.json({
      success: true,
      status: paymentIntent.status,
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error('❌ Error retrieving payment status:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve payment status',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /api/payment/transactions/:userId
 * Get user's transaction history
 * 
 * Query params:
 * - status: filter by status (succeeded, failed, refunded, pending)
 * - startDate: filter by start date (ISO string)
 * - endDate: filter by end date (ISO string)
 * - page: page number (default: 1)
 * - limit: items per page (default: 50)
 */
router.get('/transactions/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const requestingUserId = req.user.userId || req.user._id;

    // Verify user can only access their own transactions
    if (userId !== requestingUserId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: You can only access your own transactions'
      });
    }

    const { status, startDate, endDate, page = 1, limit = 50 } = req.query;

    const options = {
      status: status || null,
      startDate: startDate || null,
      endDate: endDate || null,
      limit: parseInt(limit),
      skip: (parseInt(page) - 1) * parseInt(limit),
    };

    const result = await TransactionModel.getUserTransactions(userId, options);

    // Format transactions for frontend
    const formattedTransactions = result.transactions.map(transaction => ({
      _id: transaction._id.toString(),
      paymentIntentId: transaction.paymentIntentId,
      amount: transaction.amount,
      status: transaction.status,
      doctorName: transaction.doctorName,
      doctorId: transaction.doctorId,
      appointmentDate: transaction.appointmentDate,
      appointmentTime: transaction.appointmentTime,
      createdAt: transaction.createdAt,
      refundStatus: transaction.refundData ? 'completed' : null,
    }));

    res.json({
      success: true,
      transactions: formattedTransactions,
      pagination: {
        page: result.page,
        pages: result.pages,
        total: result.total,
        limit: options.limit,
      },
    });
  } catch (error) {
    console.error('❌ Error getting transactions:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get transactions',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * DELETE /api/payment/transactions/cleanup-pending
 * Remove all pending transactions for the current user from the database
 */
router.delete('/transactions/cleanup-pending', authenticateToken, async (req, res) => {
  try {
    const userId = String(req.user.userId || req.user._id || req.user.id);
    const result = await TransactionModel.deletePendingTransactions(userId);
    console.log(`✅ Deleted ${result.deletedCount} pending transaction(s) for user ${userId}`);
    res.json({
      success: true,
      message: `Removed ${result.deletedCount} pending transaction(s) from the database`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error('❌ Error cleaning up pending transactions:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to remove pending transactions',
    });
  }
});

/**
 * GET /api/payment/invoice/:paymentIntentId
 * Get invoice details for a payment
 */
router.get('/invoice/:paymentIntentId', authenticateToken, async (req, res) => {
  try {
    const { paymentIntentId } = req.params;
    const userId = req.user.userId || req.user._id;

    // Get transaction from database
    const transaction = await TransactionModel.getTransactionByPaymentIntentId(paymentIntentId);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Verify the transaction belongs to this user
    if (transaction.userId !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: Transaction does not belong to this user'
      });
    }

    // Get payment intent from Stripe for additional details
    let paymentIntent = null;
    try {
      paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    } catch (err) {
      console.error('Error retrieving payment intent from Stripe:', err);
    }

    // Calculate billing breakdown
    const consultationFee = transaction.amount * 0.85;
    const serviceFee = transaction.amount * 0.06;
    const tax = transaction.amount * 0.09;

    // Get payment method details if available
    let paymentMethod = null;
    if (paymentIntent && paymentIntent.payment_method) {
      try {
        const pm = await stripe.paymentMethods.retrieve(paymentIntent.payment_method);
        if (pm.card) {
          paymentMethod = {
            type: pm.type,
            card: {
              brand: pm.card.brand,
              last4: pm.card.last4,
              expMonth: pm.card.exp_month,
              expYear: pm.card.exp_year,
            },
          };
        }
      } catch (err) {
        console.error('Error retrieving payment method:', err);
      }
    }

    res.json({
      success: true,
      invoice: {
        transactionId: transaction._id.toString(),
        paymentIntentId: transaction.paymentIntentId,
        amount: transaction.amount,
        currency: transaction.currency,
        status: transaction.status,
        doctorName: transaction.doctorName,
        doctorId: transaction.doctorId,
        appointmentDate: transaction.appointmentDate,
        appointmentTime: transaction.appointmentTime,
        appointmentType: transaction.appointmentType,
        billingBreakdown: {
          consultationFee: parseFloat(consultationFee.toFixed(2)),
          serviceFee: parseFloat(serviceFee.toFixed(2)),
          tax: parseFloat(tax.toFixed(2)),
          total: transaction.amount,
        },
        paymentMethod: paymentMethod,
        createdAt: transaction.createdAt,
        refundStatus: transaction.refundData ? 'completed' : null,
      },
    });
  } catch (error) {
    console.error('❌ Error getting invoice:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get invoice',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * POST /api/payment/request-refund
 * Submit a refund request
 *
 * Body:
 * - paymentIntentId: string
 * - reason: string
 * - additionalNotes: string (optional)
 * - amount: number (optional; used when transaction not in DB, e.g. test/dummy data)
 */
router.post('/request-refund', authenticateToken, async (req, res) => {
  try {
    const { paymentIntentId, reason, additionalNotes, amount: bodyAmount } = req.body;
    const userIdStr = String(req.user.userId || req.user._id || req.user.id);

    if (!paymentIntentId || !reason) {
      return res.status(400).json({
        success: false,
        message: 'PaymentIntent ID and reason are required'
      });
    }

    // Get transaction from database
    let transaction = await TransactionModel.getTransactionByPaymentIntentId(paymentIntentId);

    if (transaction) {
      // Verify the transaction belongs to this user (normalize ObjectId/string)
      if (String(transaction.userId) !== userIdStr) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized: Transaction does not belong to this user'
        });
      }
      // Check if transaction is eligible for refund
      if (transaction.status !== 'succeeded') {
        return res.status(400).json({
          success: false,
          message: 'Only succeeded transactions can be refunded'
        });
      }
    }

    // Check if refund already exists for this payment intent
    const existingRefund = await RefundRequestModel.getRefundRequestByPaymentIntentId(paymentIntentId);
    if (existingRefund) {
      return res.status(400).json({
        success: false,
        message: 'A refund request already exists for this transaction',
        refundRequestId: existingRefund._id.toString(),
      });
    }

    // Build refund data (from transaction if found, else from body for test/dummy)
    const amount = transaction ? transaction.amount : (typeof bodyAmount === 'number' ? bodyAmount : parseFloat(bodyAmount) || 0);
    const refundData = {
      userId: userIdStr,
      transactionId: transaction ? String(transaction._id) : null,
      paymentIntentId: paymentIntentId,
      amount: amount,
      currency: (transaction && transaction.currency) || 'usd',
      reason: reason,
      additionalNotes: additionalNotes || '',
      appointmentId: transaction ? transaction.appointmentId : null,
      doctorId: transaction ? transaction.doctorId : null,
      metadata: transaction
        ? { originalTransactionDate: transaction.createdAt }
        : { transactionNotFound: true, source: 'request-refund-no-transaction' },
    };

    const refundRequest = await RefundRequestModel.createRefundRequest(refundData);
    const refundRequestId = refundRequest.insertedId.toString();

    // Notify admin: create SupportRequest + first SupportMessage so admin gets conversation and can reply
    try {
      const refundMessageText = [
        `Refund request submitted.`,
        `PaymentIntent: ${paymentIntentId}`,
        `Amount: $${amount}`,
        `Reason: ${reason}`,
        `Refund request ID: ${refundRequestId}`,
        additionalNotes ? `Notes: ${additionalNotes}` : '',
        !transaction ? '[Transaction not found in DB - may be test/dummy payment]' : '',
      ].filter(Boolean).join('\n');

      const supportRequest = new SupportRequest({
        patientId: new ObjectId(userIdStr),
        subject: 'Refund request submitted',
        message: refundMessageText,
        issueType: 'refund',
        status: 'open',
      });
      await supportRequest.save();
      await SupportMessage.create({
        supportRequestId: supportRequest._id,
        senderType: 'patient',
        senderId: new ObjectId(userIdStr),
        text: refundMessageText,
      });
      console.log('✅ Admin notified via SupportRequest:', supportRequest._id);
    } catch (supportErr) {
      console.error('❌ Failed to create support request for refund (admin notify):', supportErr);
      // Do not fail the refund request; refund was already created
    }

    // Notify patient that refund request was submitted
    try {
      await PatientNotificationModel.createNotification({
        patientId: userIdStr,
        type: 'refund_request_submitted',
        title: 'Refund request submitted',
        description: `Your refund request for $${typeof amount === 'number' ? amount.toFixed(2) : amount} has been received. We will process it and notify you of the outcome.`,
        icon: 'cash-outline',
      });
      console.log('✅ Patient notification created for refund request');
    } catch (notifErr) {
      console.error('❌ Failed to create patient notification for refund request:', notifErr);
    }

    console.log('✅ Refund request created:', {
      refundRequestId,
      paymentIntentId,
      userId: userIdStr,
      amount,
      transactionFound: !!transaction,
    });

    res.json({
      success: true,
      refundRequestId,
      status: 'requested',
      message: 'Refund request submitted successfully',
    });
  } catch (error) {
    console.error('❌ Error creating refund request:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create refund request',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /api/payment/my-refund-requests
 * List current user's refund requests (for conversation history)
 */
router.get('/my-refund-requests', authenticateToken, async (req, res) => {
  try {
    const userIdStr = String(req.user.userId || req.user._id || req.user.id);
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const skip = (parseInt(req.query.skip, 10) || 0);
    const status = req.query.status; // optional filter

    const { refundRequests, total } = await RefundRequestModel.getUserRefundRequests(userIdStr, {
      status: status || undefined,
      limit,
      skip,
    });

    res.json({
      success: true,
      refundRequests: refundRequests.map((r) => ({
        _id: r._id.toString(),
        userId: r.userId,
        paymentIntentId: r.paymentIntentId,
        amount: r.amount,
        currency: r.currency,
        status: r.status,
        reason: r.reason,
        additionalNotes: r.additionalNotes,
        rejectionReason: r.rejectionReason,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      total,
    });
  } catch (error) {
    console.error('Error listing my refund requests:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to list refund requests',
    });
  }
});

/**
 * GET /api/payment/refund-status/:refundRequestId
 * Get refund request status
 */
router.get('/refund-status/:refundRequestId', authenticateToken, async (req, res) => {
  try {
    const { refundRequestId } = req.params;
    const userIdStr = String(req.user.userId || req.user._id || req.user.id);

    const refundRequest = await RefundRequestModel.getRefundRequestById(refundRequestId);

    if (!refundRequest) {
      return res.status(404).json({
        success: false,
        message: 'Refund request not found'
      });
    }

    // Verify the refund request belongs to this user (normalize ObjectId/string)
    if (String(refundRequest.userId) !== userIdStr) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: Refund request does not belong to this user'
      });
    }

    // Calculate estimated completion date (5-7 business days from request)
    const estimatedCompletion = new Date(refundRequest.createdAt);
    estimatedCompletion.setDate(estimatedCompletion.getDate() + 6); // 6 days = ~5 business days

    res.json({
      success: true,
      refundRequest: {
        _id: refundRequest._id.toString(),
        requestId: refundRequest._id.toString(),
        status: refundRequest.status,
        amount: refundRequest.amount,
        currency: refundRequest.currency,
        reason: refundRequest.reason,
        additionalNotes: refundRequest.additionalNotes,
        requestedAt: refundRequest.createdAt,
        processedAt: refundRequest.processedAt,
        completedAt: refundRequest.completedAt,
        estimatedCompletion: estimatedCompletion.toISOString(),
        rejectionReason: refundRequest.rejectionReason,
      },
    });
  } catch (error) {
    console.error('❌ Error getting refund status:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get refund status',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /api/payment/invoice/:paymentIntentId/pdf
 * Generate and download PDF invoice
 */
router.get('/invoice/:paymentIntentId/pdf', authenticateToken, async (req, res) => {
  try {
    const { paymentIntentId } = req.params;
    const userId = req.user.userId || req.user._id;

    // Get transaction from database
    const transaction = await TransactionModel.getTransactionByPaymentIntentId(paymentIntentId);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Verify the transaction belongs to this user
    if (transaction.userId !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: Transaction does not belong to this user'
      });
    }

    // Get payment intent from Stripe for additional details
    let paymentIntent = null;
    let paymentMethod = null;
    try {
      paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (paymentIntent.payment_method) {
        const pm = await stripe.paymentMethods.retrieve(paymentIntent.payment_method);
        if (pm.card) {
          paymentMethod = {
            type: pm.type,
            card: {
              brand: pm.card.brand,
              last4: pm.card.last4,
            },
          };
        }
      }
    } catch (err) {
      console.error('Error retrieving payment intent from Stripe:', err);
    }

    // Get patient information
    let patientName = 'Patient';
    let patientEmail = '';
    try {
      const patient = await UserModel.getUserById(userId);
      if (patient) {
        patientName = `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || patient.emailAddress || 'Patient';
        patientEmail = patient.emailAddress || '';
      }
    } catch (err) {
      console.error('Error fetching patient info:', err);
    }

    // Calculate billing breakdown
    const consultationFee = transaction.amount * 0.85;
    const serviceFee = transaction.amount * 0.06;
    const tax = transaction.amount * 0.09;

    // Prepare invoice data
    const invoiceData = {
      paymentIntentId: transaction.paymentIntentId,
      amount: transaction.amount,
      currency: transaction.currency,
      status: transaction.status,
      doctorName: transaction.doctorName,
      doctorSpecialization: null, // Can be fetched if needed
      appointmentDate: transaction.appointmentDate,
      appointmentTime: transaction.appointmentTime,
      appointmentType: transaction.appointmentType,
      billingBreakdown: {
        consultationFee: parseFloat(consultationFee.toFixed(2)),
        serviceFee: parseFloat(serviceFee.toFixed(2)),
        tax: parseFloat(tax.toFixed(2)),
      },
      paymentMethod: paymentMethod,
      patientName: patientName,
      patientEmail: patientEmail,
      createdAt: transaction.createdAt,
    };

    // Generate PDF
    const pdfBuffer = await generateInvoicePDF(invoiceData);

    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Invoice_${paymentIntentId}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    // Send PDF
    res.send(pdfBuffer);
  } catch (error) {
    console.error('❌ Error generating PDF invoice:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate invoice PDF',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * POST /api/payment/invoice/:paymentIntentId/send-email
 * Send invoice via email
 */
router.post('/invoice/:paymentIntentId/send-email', authenticateToken, async (req, res) => {
  try {
    const { paymentIntentId } = req.params;
    const userId = req.user.userId || req.user._id;
    const { email } = req.body; // Optional: specific email, otherwise uses user's email

    // Get transaction from database
    const transaction = await TransactionModel.getTransactionByPaymentIntentId(paymentIntentId);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Verify the transaction belongs to this user
    if (transaction.userId !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: Transaction does not belong to this user'
      });
    }

    // Get patient information
    let patientName = 'Patient';
    let patientEmail = email; // Use provided email or fetch from user
    try {
      const patient = await UserModel.getUserById(userId);
      if (patient) {
        patientName = `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || patient.emailAddress || 'Patient';
        if (!patientEmail) {
          patientEmail = patient.emailAddress || '';
        }
      }
    } catch (err) {
      console.error('Error fetching patient info:', err);
    }

    if (!patientEmail) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required. Please provide an email address.'
      });
    }

    // Get payment intent from Stripe for additional details
    let paymentIntent = null;
    let paymentMethod = null;
    try {
      paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (paymentIntent.payment_method) {
        const pm = await stripe.paymentMethods.retrieve(paymentIntent.payment_method);
        if (pm.card) {
          paymentMethod = {
            type: pm.type,
            card: {
              brand: pm.card.brand,
              last4: pm.card.last4,
            },
          };
        }
      }
    } catch (err) {
      console.error('Error retrieving payment intent from Stripe:', err);
    }

    // Calculate billing breakdown
    const consultationFee = transaction.amount * 0.85;
    const serviceFee = transaction.amount * 0.06;
    const tax = transaction.amount * 0.09;

    // Prepare invoice data
    const invoiceData = {
      paymentIntentId: transaction.paymentIntentId,
      amount: transaction.amount,
      currency: transaction.currency,
      status: transaction.status,
      doctorName: transaction.doctorName,
      appointmentDate: transaction.appointmentDate,
      appointmentTime: transaction.appointmentTime,
      appointmentType: transaction.appointmentType,
      billingBreakdown: {
        consultationFee: parseFloat(consultationFee.toFixed(2)),
        serviceFee: parseFloat(serviceFee.toFixed(2)),
        tax: parseFloat(tax.toFixed(2)),
      },
      paymentMethod: paymentMethod,
      createdAt: transaction.createdAt,
    };

    // Generate PDF
    const pdfBuffer = await generateInvoicePDF(invoiceData);

    // Send email with PDF attachment
    const emailResult = await sendInvoiceEmail(patientEmail, patientName, invoiceData, pdfBuffer);

    console.log('✅ Invoice email sent:', {
      email: patientEmail,
      paymentIntentId,
      messageId: emailResult.messageId,
    });

    res.json({
      success: true,
      message: 'Invoice sent successfully',
      email: patientEmail,
      messageId: emailResult.messageId,
    });
  } catch (error) {
    console.error('❌ Error sending invoice email:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to send invoice email',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /api/payment/refund-policy
 * Get refund policy information
 */
router.get('/refund-policy', async (req, res) => {
  try {
    // TODO: In production, this could be stored in database or config
    // For now, return a static policy
    const policy = {
      processingTime: '5-7 business days',
      eligibility: 'Refunds are available for appointments cancelled at least 24 hours in advance',
      terms: [
        'Refunds will be processed to the original payment method',
        'Processing time may vary depending on your bank',
        'Refunds are subject to our cancellation policy',
        'Service fees may be non-refundable',
        'Refunds requested within 24 hours of appointment may be subject to review',
      ],
      cancellationWindow: {
        hours: 24,
        message: 'Appointments must be cancelled at least 24 hours in advance to be eligible for a full refund',
      },
      nonRefundableItems: [
        'Service fees (if applicable)',
        'No-show appointments',
        'Appointments cancelled less than 24 hours before scheduled time',
      ],
    };

    res.json({
      success: true,
      policy: policy,
    });
  } catch (error) {
    console.error('❌ Error getting refund policy:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get refund policy',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

module.exports = router;

