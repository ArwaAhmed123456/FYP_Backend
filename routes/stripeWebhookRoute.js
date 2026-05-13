const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const TransactionModel = require('../models/TransactionModel');
const RefundRequestModel = require('../models/RefundRequestModel');
const PatientNotificationModel = require('../models/PatientNotificationModel');
const DoctorPayoutDetails = require('../models/DoctorPayoutDetailsModel');

// POST /api/stripe/webhook
// express.raw() body parser is applied in server.js before express.json() for this route
router.post('/', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!endpointSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`Stripe webhook: ${event.type}`);

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object);
        break;
      case 'payment_intent.canceled':
        await handlePaymentIntentCanceled(event.data.object);
        break;
      case 'charge.refunded':
        await handleChargeRefunded(event.data.object);
        break;
      case 'charge.dispute.created':
        console.log(`Dispute opened: charge=${event.data.object.charge}, amount=$${(event.data.object.amount / 100).toFixed(2)}, reason=${event.data.object.reason}`);
        break;
      case 'charge.dispute.closed':
        console.log(`Dispute closed: ${event.data.object.id}, status=${event.data.object.status}`);
        break;
      case 'charge.dispute.funds_withdrawn':
        console.log(`Dispute funds withdrawn: charge=${event.data.object.charge}`);
        break;
      case 'charge.dispute.funds_reinstated':
        console.log(`Dispute funds reinstated: charge=${event.data.object.charge}`);
        break;
      case 'refund.created':
        await handleRefundCreated(event.data.object);
        break;
      case 'refund.updated':
        await handleRefundUpdated(event.data.object);
        break;
      case 'refund.failed':
        await handleRefundFailed(event.data.object);
        break;
      case 'account.updated':
        await handleConnectAccountUpdated(event.data.object);
        break;
      default:
        console.log(`Unhandled webhook event: ${event.type}`);
    }
  } catch (err) {
    // Return 200 so Stripe doesn't retry — error is logged for investigation
    console.error(`Error handling webhook ${event.type}:`, err);
  }

  res.json({ received: true });
});

async function handlePaymentIntentSucceeded(paymentIntent) {
  const existing = await TransactionModel.getTransactionByPaymentIntentId(paymentIntent.id);
  if (existing?.status === 'succeeded') return; // Already confirmed client-side

  if (existing) {
    await TransactionModel.updateTransactionStatus(paymentIntent.id, 'succeeded');
  } else {
    await TransactionModel.createTransaction({
      userId: paymentIntent.metadata.userId || null,
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency,
      status: 'succeeded',
      doctorId: paymentIntent.metadata.doctorId || null,
      appointmentId: paymentIntent.metadata.appointmentId || null,
      metadata: paymentIntent.metadata,
    });
  }

  if (paymentIntent.metadata.userId) {
    await PatientNotificationModel.createNotification({
      patientId: paymentIntent.metadata.userId,
      type: 'payment_succeeded',
      title: 'Payment confirmed',
      description: `Your payment of $${(paymentIntent.amount / 100).toFixed(2)} ${paymentIntent.currency.toUpperCase()} was confirmed.`,
      icon: 'checkmark-circle-outline',
    }).catch(err => console.error('Notification failed:', err));
  }
}

async function handlePaymentIntentFailed(paymentIntent) {
  const existing = await TransactionModel.getTransactionByPaymentIntentId(paymentIntent.id);
  if (existing) {
    await TransactionModel.updateTransactionStatus(paymentIntent.id, 'failed');
  }

  if (paymentIntent.metadata.userId) {
    const errorMsg = paymentIntent.last_payment_error?.message || 'Payment could not be processed.';
    await PatientNotificationModel.createNotification({
      patientId: paymentIntent.metadata.userId,
      type: 'payment_failed',
      title: 'Payment failed',
      description: errorMsg,
      icon: 'close-circle-outline',
    }).catch(err => console.error('Notification failed:', err));
  }
}

async function handlePaymentIntentCanceled(paymentIntent) {
  const existing = await TransactionModel.getTransactionByPaymentIntentId(paymentIntent.id);
  if (existing && existing.status === 'pending') {
    await TransactionModel.updateTransactionStatus(paymentIntent.id, 'failed');
  }
}

async function handleChargeRefunded(charge) {
  const paymentIntentId = charge.payment_intent;
  if (!paymentIntentId) return;
  await TransactionModel.updateTransactionStatus(paymentIntentId, 'refunded');
}

async function handleRefundCreated(refund) {
  if (!refund.payment_intent) return;

  const refundRequest = await RefundRequestModel.getRefundRequestByPaymentIntentId(refund.payment_intent);
  if (refundRequest && ['approved', 'requested'].includes(refundRequest.status)) {
    await RefundRequestModel.updateRefundStatus(refundRequest._id, 'processing', {
      stripeRefundId: refund.id,
    });
  }
}

async function handleRefundUpdated(refund) {
  if (refund.status === 'succeeded') {
    const refundRequest = await RefundRequestModel.getRefundRequestByPaymentIntentId(refund.payment_intent);
    if (refundRequest) {
      await RefundRequestModel.completeRefund(refundRequest._id, refund.id);
      await TransactionModel.updateTransactionStatus(refund.payment_intent, 'refunded');

      if (refundRequest.userId) {
        await PatientNotificationModel.createNotification({
          patientId: refundRequest.userId,
          type: 'refund_completed',
          title: 'Refund processed',
          description: `Your refund of $${Number(refundRequest.amount).toFixed(2)} has been processed. It may take 5-10 business days to appear.`,
          icon: 'cash-outline',
        }).catch(err => console.error('Notification failed:', err));
      }
    }
  } else if (refund.status === 'failed') {
    await handleRefundFailed(refund);
  }
}

async function handleRefundFailed(refund) {
  if (!refund.payment_intent) return;

  const refundRequest = await RefundRequestModel.getRefundRequestByPaymentIntentId(refund.payment_intent);
  if (!refundRequest) return;

  // Reset to approved so admin can retry
  await RefundRequestModel.updateRefundStatus(refundRequest._id, 'approved', {
    stripeRefundId: null,
  });

  console.error(`Refund failed: stripeRefundId=${refund.id}, paymentIntent=${refund.payment_intent}, reason=${refund.failure_reason}`);

  if (refundRequest.userId) {
    await PatientNotificationModel.createNotification({
      patientId: refundRequest.userId,
      type: 'refund_failed',
      title: 'Refund processing issue',
      description: 'There was an issue processing your refund. Our team has been notified and will resolve it shortly.',
      icon: 'warning-outline',
    }).catch(err => console.error('Notification failed:', err));
  }
}

async function handleConnectAccountUpdated(account) {
  try {
    const payoutDetails = await DoctorPayoutDetails.findOne({ stripeAccountId: account.id });
    if (!payoutDetails) return;

    if (account.details_submitted && account.payouts_enabled) {
      payoutDetails.status = 'active';
    } else if (account.requirements?.disabled_reason) {
      payoutDetails.status = 'temporarily-unavailable';
    } else {
      payoutDetails.status = 'verification-pending';
    }
    await payoutDetails.save();
    console.log(`Connect account ${account.id} updated → status: ${payoutDetails.status}`);
  } catch (err) {
    console.error('Error in handleConnectAccountUpdated:', err);
  }
}

module.exports = router;
