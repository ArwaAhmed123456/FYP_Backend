const express = require('express');
const router = express.Router();
const UserModel = require('../models/UserModel');
const PaymentMethodModel = require('../models/PaymentMethodModel');
const UserSettingsModel = require('../models/UserSettingsModel');
const AdminNotificationModel = require('../models/AdminNotificationModel');
const PatientNotificationModel = require('../models/PatientNotificationModel');
const OTPModel = require('../models/OTPModel');
const authService = require('../services/auth');
const otpService = require('../services/otpService');

// ==================== USER PROFILE ROUTES ====================

// Get user profile
router.get('/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await UserModel.getUserById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Remove sensitive data
    const { password, ...userProfile } = user;
    
    res.json({
      success: true,
      data: userProfile
    });
  } catch (error) {
    console.error('Error getting user profile:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Update user profile
router.put('/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const updateData = req.body;
    
    console.log('Profile update request for user:', userId, 'with data:', updateData);
    
    // Remove sensitive fields that shouldn't be updated via this endpoint
    delete updateData.password;
    delete updateData._id;
    delete updateData.createdAt;
    
    // Use auth service for profile update with duplicate checking
    const result = await authService.updateUserProfile(userId, updateData);
    
    res.json({
      success: true,
      message: result.message,
      data: result
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    
    // Handle specific error messages
    if (error.message.includes('email address already exists') || 
        error.message.includes('phone number already exists')) {
      return res.status(409).json({
        success: false,
        message: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// ==================== EMAIL VERIFICATION ROUTES ====================

// Send OTP for email verification during profile update
router.post('/profile/:userId/verify-email', async (req, res) => {
  try {
    const { userId } = req.params;
    const { newEmail } = req.body;
    
    if (!newEmail) {
      return res.status(400).json({
        success: false,
        message: 'New email address is required'
      });
    }
    
    // Validate email format
    if (!otpService.validateEmail(newEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }
    
    // Check if the new email already exists
    const emailExists = await UserModel.emailExists(newEmail);
    if (emailExists) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email address already exists'
      });
    }
    
    // Get current user to check if it's the same email
    const currentUser = await UserModel.getUserById(userId);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // If it's the same email, no need to verify
    if (currentUser.emailAddress === newEmail) {
      return res.status(400).json({
        success: false,
        message: 'This is already your current email address'
      });
    }
    
    // Clean up any existing OTP records for this email (including expired ones)
    const existingOTP = await OTPModel.getOTPByContact(newEmail, 'email');
    if (existingOTP) {
      console.log('Found existing OTP record for:', newEmail, 'Deleting to allow new OTP generation');
      await OTPModel.deleteOTPByContact(newEmail, 'email');
    }
    
    // Also clean up any expired OTPs globally
    await OTPModel.deleteExpiredOTPs();
    
    // Send OTP
    const otpResult = await otpService.sendOTP(newEmail, 'email', 'patient');
    
    console.log('OTP result:', otpResult);
    
    // Store OTP record with user data
    await OTPModel.createOTPRecord({
      contact: newEmail,
      method: 'email',
      userType: 'patient',
      otpCode: otpResult.otpCode,
      verificationToken: otpResult.verificationToken,
      expiresAt: otpResult.expiresAt,
      userData: {
        userId: userId,
        newEmail: newEmail,
        currentEmail: currentUser.emailAddress
      }
    });
    
    console.log('OTP record created successfully');
    
    res.json({
      success: true,
      message: `OTP sent successfully to ${newEmail}`,
      data: {
        verificationToken: otpResult.verificationToken,
        method: 'email',
        expiresIn: 10 // minutes
      }
    });
  } catch (error) {
    console.error('Send email verification OTP error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to send verification OTP'
    });
  }
});

// Verify OTP and update email
router.post('/profile/:userId/verify-email-otp', async (req, res) => {
  try {
    const { userId } = req.params;
    const { verificationToken, otpCode } = req.body;
    
    console.log('OTP verification request:', {
      userId,
      verificationToken,
      otpCode,
      body: req.body
    });
    
    if (!verificationToken || !otpCode) {
      console.log('Missing required fields:', { verificationToken: !!verificationToken, otpCode: !!otpCode });
      return res.status(400).json({
        success: false,
        message: 'Verification token and OTP code are required'
      });
    }
    
    // Get OTP record
    const otpRecord = await OTPModel.getOTPByToken(verificationToken);
    if (!otpRecord) {
      console.log('No OTP record found for token:', verificationToken);
      return res.status(400).json({
        success: false,
        message: 'Invalid verification token or token has expired'
      });
    }
    
    // Check if OTP has expired
    if (new Date() > new Date(otpRecord.expiresAt)) {
      console.log('OTP has expired for token:', verificationToken);
      // Delete the expired OTP record
      await OTPModel.deleteOTPRecord(verificationToken);
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new verification code.'
      });
    }
    
    // Check if max attempts reached
    const maxAttemptsReached = await OTPModel.isMaxAttemptsReached(verificationToken);
    if (maxAttemptsReached) {
      return res.status(400).json({
        success: false,
        message: 'Maximum verification attempts reached. Please request a new OTP.'
      });
    }
    
    // Verify OTP
    const verificationResult = otpService.verifyOTP(otpCode, otpRecord.otpCode, otpRecord.expiresAt);
    if (!verificationResult.success) {
      // Increment attempts
      await OTPModel.incrementAttempts(verificationToken);
      
      return res.status(400).json({
        success: false,
        message: verificationResult.message
      });
    }
    
    // Mark OTP as verified
    await OTPModel.updateOTPVerification(verificationToken, true);
    
    // Update user's email address
    const newEmail = otpRecord.userData.newEmail;
    const updateResult = await UserModel.updateUser(userId, { emailAddress: newEmail });
    
    if (updateResult.modifiedCount > 0) {
      res.json({
        success: true,
        message: 'Email address updated successfully',
        data: {
          newEmail: newEmail
        }
      });
    } else {
      throw new Error('Failed to update email address');
    }
  } catch (error) {
    console.error('Verify email OTP error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to verify OTP and update email'
    });
  }
});

// Change password
router.put('/profile/:userId/password', async (req, res) => {
  try {
    const { userId } = req.params;
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    // TODO: Add password validation and hashing logic here
    // For now, we'll just update the password field
    const result = await UserModel.updatePassword(userId, newPassword);
    
    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    console.error('Error updating password:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Delete user account
router.delete('/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await UserModel.deleteUser(userId);
    
    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Also delete user settings and payment methods
    await UserSettingsModel.deleteUserSettings(userId);
    // Note: Payment methods are soft deleted, so they remain for audit purposes

    res.json({
      success: true,
      message: 'Account deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting user account:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// ==================== PHONE VERIFICATION ROUTES ====================

// Send OTP for phone verification during profile update
router.post('/profile/:userId/verify-phone', async (req, res) => {
  try {
    const { userId } = req.params;
    const { newPhone } = req.body;
    
    if (!newPhone) {
      return res.status(400).json({
        success: false,
        message: 'New phone number is required'
      });
    }
    
    // Normalize phone number
    const normalizedPhone = otpService.normalizePhoneNumber(newPhone);
    
    // Validate phone format
    if (!otpService.validatePhoneNumber(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format'
      });
    }
    
    // Check if the new phone already exists
    const phoneExists = await UserModel.phoneExists(normalizedPhone);
    if (phoneExists) {
      return res.status(400).json({
        success: false,
        message: 'An account with this phone number already exists'
      });
    }
    
    // Get current user to check if it's the same phone
    const currentUser = await UserModel.getUserById(userId);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // If it's the same phone, no need to verify
    if (currentUser.phone === normalizedPhone) {
      return res.status(400).json({
        success: false,
        message: 'This is already your current phone number'
      });
    }
    
    // Send OTP to the new phone number
    const otpResult = await otpService.sendOTP(normalizedPhone, 'phone', 'patient');
    
    // Store OTP record for verification
    await OTPModel.createOTPRecord({
      contact: normalizedPhone,
      method: 'phone',
      userType: 'patient',
      otpCode: otpResult.otpCode,
      verificationToken: otpResult.verificationToken,
      expiresAt: otpResult.expiresAt,
      userData: {
        userId: userId,
        newPhone: normalizedPhone,
        currentPhone: currentUser.phone
      }
    });
    
    console.log('Phone verification OTP record created successfully');
    
    res.json({
      success: true,
      message: `OTP sent successfully to ${normalizedPhone}`,
      data: {
        verificationToken: otpResult.verificationToken,
        method: 'phone',
        expiresIn: 10 // minutes
      }
    });
  } catch (error) {
    console.error('Send phone verification OTP error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to send verification OTP'
    });
  }
});

// Verify OTP and update phone number
router.post('/profile/:userId/verify-phone-otp', async (req, res) => {
  try {
    const { userId } = req.params;
    const { verificationToken, otpCode } = req.body;
    
    if (!verificationToken || !otpCode) {
      return res.status(400).json({
        success: false,
        message: 'Verification token and OTP code are required'
      });
    }
    
    // Get OTP record
    const otpRecord = await OTPModel.getOTPByToken(verificationToken);
    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification token'
      });
    }
    
    // Verify OTP
    const verificationResult = otpService.verifyOTP(otpCode, otpRecord.otpCode, otpRecord.expiresAt);
    if (!verificationResult.success) {
      return res.status(400).json({
        success: false,
        message: verificationResult.message
      });
    }
    
    // Check if OTP is for phone verification
    if (otpRecord.method !== 'phone') {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification method'
      });
    }
    
    // Check if it's for the correct user
    if (otpRecord.userData.userId !== userId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification token for this user'
      });
    }
    
    // Update user's phone number
    const newPhone = otpRecord.userData.newPhone;
    const updateResult = await UserModel.updateUser(userId, { phone: newPhone });
    
    if (updateResult.modifiedCount > 0) {
      // Clean up OTP record
      await OTPModel.deleteOTPRecord(verificationToken);
      
      res.json({
        success: true,
        message: 'Phone number updated successfully',
        data: {
          newPhone: newPhone
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to update phone number'
      });
    }
  } catch (error) {
    console.error('Verify phone OTP error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to verify OTP'
    });
  }
});

// ==================== PAYMENT METHODS ROUTES ====================

// Get user payment methods
router.get('/payment-methods/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const paymentMethods = await PaymentMethodModel.getUserPaymentMethods(userId);
    
    res.json({
      success: true,
      data: paymentMethods
    });
  } catch (error) {
    console.error('Error getting payment methods:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Add new payment method
router.post('/payment-methods/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const paymentData = req.body;
    
    // Validate required fields
    if (!paymentData.cardHolderName || !paymentData.cardNumber || !paymentData.expiryDate || !paymentData.cvv) {
      return res.status(400).json({
        success: false,
        message: 'All card fields are required'
      });
    }

    // Mask card number for security (store only last 4 digits)
    const last4 = paymentData.cardNumber.slice(-4);
    const maskedCardNumber = `**** **** **** ${last4}`;
    
    const paymentMethodData = {
      cardHolderName: paymentData.cardHolderName,
      cardNumber: maskedCardNumber,
      last4: last4,
      expiryDate: paymentData.expiryDate,
      brand: paymentData.brand || 'Unknown',
      type: 'Credit Card'
    };

    const result = await PaymentMethodModel.addPaymentMethod(userId, paymentMethodData);

    // Notify patient that a card was added
    try {
      await PatientNotificationModel.createNotification({
        patientId: userId,
        type: 'card_added',
        title: 'Card added',
        description: `A payment method ending in ${last4} was added to your account.`,
        icon: 'card-outline',
      });
      console.log('✅ Patient notification created for card added');
    } catch (notifErr) {
      console.error('❌ Failed to create patient notification for card added:', notifErr);
    }

    res.json({
      success: true,
      message: 'Payment method added successfully',
      data: result
    });
  } catch (error) {
    console.error('Error adding payment method:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Update payment method
router.put('/payment-methods/:paymentMethodId', async (req, res) => {
  try {
    const { paymentMethodId } = req.params;
    const updateData = req.body;
    
    const result = await PaymentMethodModel.updatePaymentMethod(paymentMethodId, updateData);
    
    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payment method not found'
      });
    }

    res.json({
      success: true,
      message: 'Payment method updated successfully',
      data: result
    });
  } catch (error) {
    console.error('Error updating payment method:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Set default payment method
router.put('/payment-methods/:userId/default/:paymentMethodId', async (req, res) => {
  try {
    const { userId, paymentMethodId } = req.params;
    
    const result = await PaymentMethodModel.setDefaultPaymentMethod(userId, paymentMethodId);
    
    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payment method not found'
      });
    }

    res.json({
      success: true,
      message: 'Default payment method updated successfully',
      data: result
    });
  } catch (error) {
    console.error('Error setting default payment method:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Delete payment method (with userId so we verify ownership and avoid id mismatch)
router.delete('/payment-methods/:userId/:paymentMethodId', async (req, res) => {
  try {
    const { userId, paymentMethodId } = req.params;

    if (!paymentMethodId || !userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID and payment method ID are required'
      });
    }

    const doc = await PaymentMethodModel.getPaymentMethodById(paymentMethodId);
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'Payment method not found'
      });
    }

    const docUserId = doc.userId && doc.userId.toString ? doc.userId.toString() : String(doc.userId);
    const reqUserId = String(userId);
    if (docUserId !== reqUserId) {
      return res.status(403).json({
        success: false,
        message: 'Payment method does not belong to this user'
      });
    }

    const result = await PaymentMethodModel.deletePaymentMethod(paymentMethodId);

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payment method not found'
      });
    }

    // Notify patient that a card was removed
    const last4Display = doc.last4 ? ` ending in ${doc.last4}` : '';
    try {
      await PatientNotificationModel.createNotification({
        patientId: userId,
        type: 'card_removed',
        title: 'Card removed',
        description: `A payment method${last4Display} was removed from your account.`,
        icon: 'card-outline',
      });
      console.log('✅ Patient notification created for card removed');
    } catch (notifErr) {
      console.error('❌ Failed to create patient notification for card removed:', notifErr);
    }

    res.json({
      success: true,
      message: 'Payment method deleted successfully',
      data: result
    });
  } catch (error) {
    console.error('Error deleting payment method:', error);
    if (error.name === 'BSONError' || (error.message && error.message.includes('ObjectId'))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment method ID'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// ==================== USER SETTINGS ROUTES ====================

// Get user settings
router.get('/settings/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const settings = await UserSettingsModel.getUserSettings(userId);
    
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Error getting user settings:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Update user settings
router.put('/settings/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const settingsData = req.body;
    
    const result = await UserSettingsModel.upsertUserSettings(userId, settingsData);
    
    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: result
    });
  } catch (error) {
    console.error('Error updating user settings:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Update notification settings
router.put('/settings/:userId/notifications', async (req, res) => {
  try {
    const { userId } = req.params;
    const notificationSettings = req.body;
    
    const result = await UserSettingsModel.updateNotificationSettings(userId, notificationSettings);
    
    res.json({
      success: true,
      message: 'Notification settings updated successfully',
      data: result
    });
  } catch (error) {
    console.error('Error updating notification settings:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Update language preference
router.put('/settings/:userId/language', async (req, res) => {
  try {
    const { userId } = req.params;
    const { language } = req.body;
    
    if (!language) {
      return res.status(400).json({
        success: false,
        message: 'Language is required'
      });
    }
    
    const result = await UserSettingsModel.updateLanguagePreference(userId, language);
    
    res.json({
      success: true,
      message: 'Language preference updated successfully',
      data: result
    });
  } catch (error) {
    console.error('Error updating language preference:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// ==================== UTILITY ROUTES ====================

// Search users (for admin purposes)
router.get('/search', async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;
    
    if (!q) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }
    
    const users = await UserModel.searchUsers(q);
    
    res.json({
      success: true,
      data: users.slice(0, parseInt(limit))
    });
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Get users count
router.get('/count', async (req, res) => {
  try {
    const count = await UserModel.getUsersCount();
    
    res.json({
      success: true,
      data: { count }
    });
  } catch (error) {
    console.error('Error getting users count:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// ==================== ACCOUNT MANAGEMENT ROUTES ====================

// Request account deletion
router.post('/:userId/delete-request', async (req, res) => {
  try {
    const { userId } = req.params;
    const { deletionType = 'complete' } = req.body; // 'anonymize' or 'complete'
    
    // Get user details
    const user = await UserModel.getUserById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Create admin notification for deletion request
    await AdminNotificationModel.createDeletionRequest(
      userId,
      user.emailAddress,
      `${user.firstName} ${user.lastName}`,
      deletionType
    );

    const message = deletionType === 'anonymize' 
      ? 'Your account will be anonymized within 7 days. Your data will help improve our AI model. Admin has been notified.'
      : 'Your account will be deleted within 7 days. All data will be permanently removed. Admin has been notified.';

    res.json({
      success: true,
      message: message
    });
  } catch (error) {
    console.error('Error submitting deletion request:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

module.exports = router;
