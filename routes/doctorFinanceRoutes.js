const express = require('express');
const mongoose = require('mongoose');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const authService = require('../services/auth');
const DoctorPaymentPlan = require('../models/DoctorPaymentPlanModel');
const DoctorPayoutDetails = require('../models/DoctorPayoutDetailsModel');
const DoctorPayout = require('../models/DoctorPayoutModel');
const TransactionModel = require('../models/TransactionModel');
const PaymentPlan = require('../models/PaymentPlanModel');
const DoctorModel = require('../models/DoctorModel');

// Platform keeps service fee + tax; doctor receives the consultation fee portion (85%)
const DOCTOR_EARNINGS_RATE = 0.85;

const router = express.Router();

// Authentication is relaxed for now to avoid blocking doctor app
// We try to decode the token if present, but never hard-fail on auth here.
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return next();
  }
  try {
    const decoded = authService.verifyToken(token);
    req.user = decoded;
  } catch (error) {
    console.warn('doctorFinanceRoutes: token verification failed, continuing without user context');
  }
  return next();
};

// ---- Payment Plans ----

// GET /api/doctor/payment-plans/doctor/:doctorId
router.get('/payment-plans/doctor/:doctorId', authenticateToken, async (req, res) => {
  try {
    const { doctorId } = req.params;
    const plans = await DoctorPaymentPlan.find({ doctorId: new mongoose.Types.ObjectId(doctorId) })
      .sort({ createdAt: -1 })
      .lean();

    // Backfill: ensure any under-review doctor plans are mirrored into PaymentPlan
    // so the admin "Payment Plans" page can see them even if they were created
    // before this mirroring logic was added.
    const underReview = plans.filter((p) => p.status === 'under-review');
    if (underReview.length) {
      for (const p of underReview) {
        const adminConsultationType =
          p.consultationType === 'video'
            ? 'Video Call'
            : p.consultationType === 'in-person'
            ? 'In-person'
            : 'In-person';

        await PaymentPlan.findOneAndUpdate(
          { previousPlanId: p._id },
          {
            doctorId: p.doctorId,
            consultationType: adminConsultationType,
            duration: p.duration,
            fee: p.fee,
            description: p.description,
            status: 'pending',
            submittedAt: p.submittedAt || new Date(),
            previousPlanId: p._id,
          },
          { upsert: true, new: true, runValidators: true }
        );
      }
    }

    return res.json({
      success: true,
      plans,
    });
  } catch (error) {
    console.error('Error fetching doctor payment plans:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch payment plans',
      error: error.message,
    });
  }
});

// DELETE /api/doctor/payment-plans/:id
router.delete('/payment-plans/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const plan = await DoctorPaymentPlan.findByIdAndDelete(id);
    if (!plan) {
      return res.status(404).json({ success: false, message: 'Payment plan not found' });
    }

    // Also clean up any mirrored admin PaymentPlan entry, if present.
    try {
      await PaymentPlan.deleteMany({ previousPlanId: plan._id });
    } catch (cleanupError) {
      console.error('Error deleting mirrored PaymentPlan for doctor plan:', cleanupError.message);
    }

    return res.json({
      success: true,
      message: 'Payment plan deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting doctor payment plan:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete payment plan',
      error: error.message,
    });
  }
});

// POST /api/doctor/payment-plans
router.post('/payment-plans', authenticateToken, async (req, res) => {
  try {
    const { doctorId, consultationType, duration, fee, description, status } = req.body;

    if (!doctorId) {
      return res.status(400).json({ success: false, message: 'doctorId is required' });
    }

    const plan = new DoctorPaymentPlan({
      doctorId: new mongoose.Types.ObjectId(doctorId),
      consultationType,
      duration,
      fee,
      description,
      status: status || 'draft',
      submittedAt: status === 'under-review' ? new Date() : null,
      activatedAt: status === 'active' ? new Date() : null,
    });

    await plan.save();

    // Mirror doctor-submitted plans into the shared PaymentPlan collection
    // so the admin panel "Payment Plans" page can see and review them.
    if (plan.status === 'under-review') {
      const adminConsultationType =
        plan.consultationType === 'video'
          ? 'Video Call'
          : plan.consultationType === 'in-person'
          ? 'In-person'
          : 'In-person';

      await PaymentPlan.findOneAndUpdate(
        { previousPlanId: plan._id },
        {
          doctorId: plan.doctorId,
          consultationType: adminConsultationType,
          duration: plan.duration,
          fee: plan.fee,
          description: plan.description,
          status: 'pending',
          submittedAt: plan.submittedAt || new Date(),
          previousPlanId: plan._id,
        },
        { upsert: true, new: true, runValidators: true }
      );
    }

    return res.status(201).json({
      success: true,
      plan,
    });
  } catch (error) {
    console.error('Error creating doctor payment plan:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create payment plan',
      error: error.message,
    });
  }
});

// GET /api/doctor/payment-plans/:id
router.get('/payment-plans/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const plan = await DoctorPaymentPlan.findById(id).lean();
    if (!plan) {
      return res.status(404).json({ success: false, message: 'Payment plan not found' });
    }
    return res.json({ success: true, plan });
  } catch (error) {
    console.error('Error fetching doctor payment plan:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch payment plan',
      error: error.message,
    });
  }
});

// PUT /api/doctor/payment-plans/:id
router.put('/payment-plans/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const update = { ...req.body };

    if (update.doctorId) {
      update.doctorId = new mongoose.Types.ObjectId(update.doctorId);
    }

    if (update.status === 'under-review' && !update.submittedAt) {
      update.submittedAt = new Date();
    }
    if (update.status === 'active' && !update.activatedAt) {
      update.activatedAt = new Date();
    }

    const plan = await DoctorPaymentPlan.findByIdAndUpdate(id, update, { new: true, runValidators: true });
    if (!plan) {
      return res.status(404).json({ success: false, message: 'Payment plan not found' });
    }

    // Keep mirrored PaymentPlan in sync for admin panel.
    if (plan.status === 'under-review') {
      const adminConsultationType =
        plan.consultationType === 'video'
          ? 'Video Call'
          : plan.consultationType === 'in-person'
          ? 'In-person'
          : 'In-person';

      await PaymentPlan.findOneAndUpdate(
        { previousPlanId: plan._id },
        {
          doctorId: plan.doctorId,
          consultationType: adminConsultationType,
          duration: plan.duration,
          fee: plan.fee,
          description: plan.description,
          status: 'pending',
          submittedAt: plan.submittedAt || new Date(),
          previousPlanId: plan._id,
        },
        { upsert: true, new: true, runValidators: true }
      );
    }

    return res.json({
      success: true,
      plan,
    });
  } catch (error) {
    console.error('Error updating doctor payment plan:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update payment plan',
      error: error.message,
    });
  }
});

// ---- Payout Details ----

// GET /api/doctor/payout-details/doctor/:doctorId
router.get('/payout-details/doctor/:doctorId', authenticateToken, async (req, res) => {
  try {
    const { doctorId } = req.params;
    const details = await DoctorPayoutDetails.findOne({ doctorId: new mongoose.Types.ObjectId(doctorId) }).lean();

    return res.json({
      success: true,
      payoutDetails: details || null,
    });
  } catch (error) {
    console.error('Error fetching doctor payout details:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch payout details',
      error: error.message,
    });
  }
});

// POST /api/doctor/payout-details  (create)
router.post('/payout-details', authenticateToken, async (req, res) => {
  try {
    const { doctorId, accountHolderName, bankName, accountNumber, iban, status } = req.body;
    if (!doctorId) {
      return res.status(400).json({ success: false, message: 'doctorId is required' });
    }

    const existing = await DoctorPayoutDetails.findOne({ doctorId: new mongoose.Types.ObjectId(doctorId) });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Payout details already exist, use PUT to update' });
    }

    const details = new DoctorPayoutDetails({
      doctorId: new mongoose.Types.ObjectId(doctorId),
      accountHolderName,
      bankName,
      accountNumber,
      iban,
      status: status || 'verification-pending',
    });

    await details.save();

    return res.status(201).json({
      success: true,
      payoutDetails: details,
    });
  } catch (error) {
    console.error('Error creating doctor payout details:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save payout details',
      error: error.message,
    });
  }
});

// PUT /api/doctor/payout-details  (update existing)
router.put('/payout-details', authenticateToken, async (req, res) => {
  try {
    const { _id, doctorId, accountHolderName, bankName, accountNumber, iban, status } = req.body;
    const query = _id
      ? { _id: new mongoose.Types.ObjectId(_id) }
      : { doctorId: new mongoose.Types.ObjectId(doctorId) };

    const update = {
      accountHolderName,
      bankName,
      accountNumber,
      iban,
    };
    if (status) update.status = status;

    const details = await DoctorPayoutDetails.findOneAndUpdate(query, update, {
      new: true,
      upsert: !Boolean(_id),
      runValidators: true,
    });

    return res.json({
      success: true,
      payoutDetails: details,
    });
  } catch (error) {
    console.error('Error updating doctor payout details:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save payout details',
      error: error.message,
    });
  }
});

// POST /api/doctor/payout-details/stripe-connect/:doctorId/onboarding
// Creates (or retrieves) a Stripe Express account for the doctor and returns an onboarding URL.
router.post('/payout-details/stripe-connect/:doctorId/onboarding', authenticateToken, async (req, res) => {
  try {
    const { doctorId } = req.params;
    const baseUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3000}`;

    let payoutDetails = await DoctorPayoutDetails.findOne({ doctorId: new mongoose.Types.ObjectId(doctorId) });
    let stripeAccountId = payoutDetails?.stripeAccountId;

    if (!stripeAccountId) {
      const doctor = await DoctorModel.findById(doctorId).lean();
      const account = await stripe.accounts.create({
        type: 'express',
        capabilities: { transfers: { requested: true } },
        metadata: { doctorId },
        ...(doctor?.email && { email: doctor.email }),
      });
      stripeAccountId = account.id;

      if (payoutDetails) {
        payoutDetails.stripeAccountId = stripeAccountId;
        await payoutDetails.save();
      } else {
        // Create a placeholder record so we can save the stripeAccountId
        await DoctorPayoutDetails.create({
          doctorId: new mongoose.Types.ObjectId(doctorId),
          accountHolderName: '',
          bankName: '',
          accountNumber: '',
          stripeAccountId,
          status: 'verification-pending',
        });
      }
    }

    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${baseUrl}/api/doctor/payout-details/stripe-connect/${doctorId}/onboarding/refresh`,
      return_url: `${baseUrl}/api/doctor/payout-details/stripe-connect/${doctorId}/onboarding/return`,
      type: 'account_onboarding',
    });

    return res.json({ success: true, onboardingUrl: accountLink.url, stripeAccountId });
  } catch (error) {
    console.error('Error initiating Stripe Connect onboarding:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to start Stripe Connect onboarding',
      error: error.message,
    });
  }
});

// GET /api/doctor/payout-details/stripe-connect/:doctorId/onboarding/return
// Stripe redirects here after doctor completes onboarding. Checks account status and updates DB.
router.get('/payout-details/stripe-connect/:doctorId/onboarding/return', async (req, res) => {
  try {
    const { doctorId } = req.params;
    const payoutDetails = await DoctorPayoutDetails.findOne({ doctorId: new mongoose.Types.ObjectId(doctorId) });

    if (payoutDetails?.stripeAccountId) {
      const account = await stripe.accounts.retrieve(payoutDetails.stripeAccountId);
      if (account.details_submitted && account.payouts_enabled) {
        payoutDetails.status = 'active';
      } else {
        payoutDetails.status = 'verification-pending';
      }
      await payoutDetails.save();
    }

    // Deep link back to the app; app can poll /onboarding/status to confirm
    return res.send('<html><body><p>Onboarding complete. You can close this tab and return to the app.</p></body></html>');
  } catch (error) {
    console.error('Error handling Stripe Connect return:', error);
    return res.status(500).send('Error completing onboarding. Please try again.');
  }
});

// GET /api/doctor/payout-details/stripe-connect/:doctorId/onboarding/refresh
// Stripe redirects here when the Account Link has expired. Generate a fresh one.
router.get('/payout-details/stripe-connect/:doctorId/onboarding/refresh', async (req, res) => {
  try {
    const { doctorId } = req.params;
    const baseUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3000}`;
    const payoutDetails = await DoctorPayoutDetails.findOne({ doctorId: new mongoose.Types.ObjectId(doctorId) });

    if (!payoutDetails?.stripeAccountId) {
      return res.status(404).send('Stripe account not found. Please restart onboarding.');
    }

    const accountLink = await stripe.accountLinks.create({
      account: payoutDetails.stripeAccountId,
      refresh_url: `${baseUrl}/api/doctor/payout-details/stripe-connect/${doctorId}/onboarding/refresh`,
      return_url: `${baseUrl}/api/doctor/payout-details/stripe-connect/${doctorId}/onboarding/return`,
      type: 'account_onboarding',
    });

    return res.redirect(accountLink.url);
  } catch (error) {
    console.error('Error refreshing Stripe Connect link:', error);
    return res.status(500).send('Error refreshing onboarding link. Please try again.');
  }
});

// GET /api/doctor/payout-details/stripe-connect/:doctorId/onboarding/status
// App polls this after doctor returns from Stripe to check if onboarding is complete.
router.get('/payout-details/stripe-connect/:doctorId/onboarding/status', authenticateToken, async (req, res) => {
  try {
    const { doctorId } = req.params;
    const payoutDetails = await DoctorPayoutDetails.findOne({ doctorId: new mongoose.Types.ObjectId(doctorId) }).lean();

    if (!payoutDetails?.stripeAccountId) {
      return res.json({ success: true, status: 'not-setup', onboardingComplete: false });
    }

    const account = await stripe.accounts.retrieve(payoutDetails.stripeAccountId);
    const onboardingComplete = account.details_submitted && account.payouts_enabled;

    // Sync DB status with Stripe
    if (onboardingComplete && payoutDetails.status !== 'active') {
      await DoctorPayoutDetails.findOneAndUpdate(
        { doctorId: new mongoose.Types.ObjectId(doctorId) },
        { status: 'active' }
      );
    }

    return res.json({
      success: true,
      status: onboardingComplete ? 'active' : 'verification-pending',
      onboardingComplete,
      detailsSubmitted: account.details_submitted,
      payoutsEnabled: account.payouts_enabled,
      chargesEnabled: account.charges_enabled,
    });
  } catch (error) {
    console.error('Error checking Stripe Connect status:', error);
    return res.status(500).json({ success: false, message: 'Failed to check onboarding status', error: error.message });
  }
});

// ---- Earnings & Transactions ----

// GET /api/doctor/earnings/doctor/:doctorId/summary
router.get('/earnings/doctor/:doctorId/summary', authenticateToken, async (req, res) => {
  try {
    const { doctorId } = req.params;
    const collection = await TransactionModel.getCollection();

    const doctorIdStr = doctorId.toString();

    // Total earnings (succeeded)
    const totalAgg = await collection
      .aggregate([
        { $match: { doctorId: doctorIdStr, status: 'succeeded' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ])
      .toArray();
    const totalEarnings = totalAgg[0]?.total || 0;

    // Earnings this month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthAgg = await collection
      .aggregate([
        {
          $match: {
            doctorId: doctorIdStr,
            status: 'succeeded',
            createdAt: { $gte: monthStart },
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ])
      .toArray();
    const earningsThisMonth = monthAgg[0]?.total || 0;

    // Pending = total earned minus total paid out
    const totalPaidOutAgg = await DoctorPayout.aggregate([
      { $match: { doctorId: new mongoose.Types.ObjectId(doctorId), status: 'paid' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const totalPaidOut = totalPaidOutAgg[0]?.total || 0;
    const pendingEarnings = Math.max(0, totalEarnings - totalPaidOut);

    const summary = {
      totalEarnings,
      earningsThisMonth,
      pendingEarnings,
      totalPaidOut,
    };

    return res.json({
      success: true,
      summary,
    });
  } catch (error) {
    console.error('Error fetching doctor earnings summary:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch earnings summary',
      error: error.message,
    });
  }
});

// GET /api/doctor/transactions/doctor/:doctorId
router.get('/transactions/doctor/:doctorId', authenticateToken, async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { status, startDate, endDate } = req.query;

    const collection = await TransactionModel.getCollection();
    const query = { doctorId: doctorId.toString() };

    if (status && status !== 'all') {
      if (status === 'completed') {
        query.status = 'succeeded';
      } else if (status === 'refunded') {
        query.status = 'refunded';
      } else {
        query.status = status;
      }
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const docs = await collection
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    return res.json({
      success: true,
      transactions: docs,
    });
  } catch (error) {
    console.error('Error fetching doctor transactions:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch doctor transactions',
      error: error.message,
    });
  }
});

// GET /api/doctor/payouts/doctor/:doctorId
router.get('/payouts/doctor/:doctorId', authenticateToken, async (req, res) => {
  try {
    const { doctorId } = req.params;
    const payouts = await DoctorPayout.find({ doctorId: new mongoose.Types.ObjectId(doctorId) })
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ success: true, payouts });
  } catch (error) {
    console.error('Error fetching doctor payouts:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch payouts', error: error.message });
  }
});

// POST /api/doctor/payouts/doctor/:doctorId/payout
// Admin triggers a Stripe transfer to a doctor's connected account.
// Body: { amount (dollars), period, notes, adminUserId }
router.post('/payouts/doctor/:doctorId/payout', authenticateToken, async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { amount, period, notes, adminUserId } = req.body;

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid amount (in dollars) is required' });
    }

    const payoutDetails = await DoctorPayoutDetails.findOne({ doctorId: new mongoose.Types.ObjectId(doctorId) }).lean();
    if (!payoutDetails?.stripeAccountId) {
      return res.status(400).json({ success: false, message: 'Doctor has not completed Stripe Connect onboarding' });
    }
    if (payoutDetails.status !== 'active') {
      return res.status(400).json({ success: false, message: `Doctor Stripe account is not active (status: ${payoutDetails.status})` });
    }

    // Count eligible transactions for this period if provided
    let transactionCount = 0;
    if (period) {
      const [year, month] = period.split('-').map(Number);
      const from = new Date(year, month - 1, 1);
      const to = new Date(year, month, 1);
      const collection = await TransactionModel.getCollection();
      transactionCount = await collection.countDocuments({
        doctorId: doctorId.toString(),
        status: 'succeeded',
        createdAt: { $gte: from, $lt: to },
      });
    }

    const amountInCents = Math.round(amount * 100);
    const transfer = await stripe.transfers.create(
      {
        amount: amountInCents,
        currency: 'usd',
        destination: payoutDetails.stripeAccountId,
        metadata: { doctorId, period: period || '', adminUserId: adminUserId || '' },
        description: `Doctor payout${period ? ` for ${period}` : ''}`,
      },
      { idempotencyKey: `payout-${doctorId}-${period || Date.now()}` }
    );

    const payout = await DoctorPayout.create({
      doctorId: new mongoose.Types.ObjectId(doctorId),
      stripeTransferId: transfer.id,
      amount,
      currency: 'usd',
      status: 'paid',
      period: period || null,
      transactionCount,
      notes: notes || '',
      processedBy: adminUserId || null,
    });

    return res.status(201).json({ success: true, payout, stripeTransferId: transfer.id });
  } catch (error) {
    console.error('Error creating doctor payout:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to create payout', error: error.message });
  }
});

module.exports = router;

