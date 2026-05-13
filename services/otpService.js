const crypto = require('crypto');
const nodemailer = require('nodemailer');

class OTPService {
  constructor() {
    this.otpExpiryMinutes = 10; // OTP expires in 10 minutes
    this.emailTransporter = this.createEmailTransporter();
  }

  // Create email transporter for sending OTP emails
  createEmailTransporter() {
    console.log('Creating email transporter with:', {
      user: process.env.EMAIL_USER || 'your-email@gmail.com',
      pass: process.env.EMAIL_PASS ? '***hidden***' : 'not-set'
    });
    
    return nodemailer.createTransport({
      service: 'gmail', // You can change this to your preferred email service
      auth: {
        user: process.env.EMAIL_USER || 'your-email@gmail.com',
        pass: process.env.EMAIL_PASS || 'your-app-password'
      }
    });
  }

  // Send OTP via SMS (console fallback only)
  async sendSMSOTP(phoneNumber, otpCode) {
    try {
      // Format phone number for Pakistani SMS
      let formattedPhone = phoneNumber;
      
      // Convert Pakistani local format to international format
      if (phoneNumber.startsWith('0')) {
        formattedPhone = '+92' + phoneNumber.substring(1);
      } else if (phoneNumber.startsWith('92')) {
        formattedPhone = '+' + phoneNumber;
      } else if (!phoneNumber.startsWith('+')) {
        formattedPhone = '+92' + phoneNumber;
      }
      
      console.log(`SMS OTP sent to ${formattedPhone}: ${otpCode} (SMS service not configured)`);
      
      return {
        success: true,
        message: 'OTP sent successfully via SMS (console fallback)',
        method: 'sms'
      };
    } catch (error) {
      console.error('Error sending SMS OTP:', error);
      
      return {
        success: true,
        message: 'OTP sent successfully via SMS (fallback mode)',
        method: 'sms',
        error: error.message
      };
    }
  }

  // Generate a 6-digit OTP code
  generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Generate a unique verification token
  generateVerificationToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  // Validate password strength
  validatePassword(password) {
    const errors = [];
    
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }
    
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Send password reset email
  async sendPasswordResetEmail(emailAddress, resetToken, resetUrl) {
    try {
      console.log('Attempting to send password reset email to:', emailAddress);
      console.log('Reset URL being sent:', resetUrl);
      console.log('Reset token being sent:', resetToken.substring(0, 10) + '...');
      
      const subject = 'Tabeeb - Password Reset Request';
      const mailOptions = {
        from: process.env.EMAIL_USER || 'your-email@gmail.com',
        to: emailAddress,
        subject: subject,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2c5aa0;">Tabeeb - Password Reset</h2>
            <p>Hello,</p>
            <p>We received a request to reset your password for your Tabeeb account.</p>
            <p>Click the button below to reset your password:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" 
                 style="background-color: #2c5aa0; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                Reset Password
              </a>
            </div>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; background-color: #f0f0f0; padding: 10px; border-radius: 5px;">
              ${resetUrl}
            </p>
            <p><strong>This link will expire in 1 hour for security reasons.</strong></p>
            <p>If you didn't request this password reset, please ignore this email. Your password will remain unchanged.</p>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
            <p style="color: #666; font-size: 12px;">This is an automated message from Tabeeb.</p>
          </div>
        `
      };

      console.log('Sending password reset email with options:', {
        from: mailOptions.from,
        to: mailOptions.to,
        subject: mailOptions.subject
      });

      await this.emailTransporter.sendMail(mailOptions);
      
      console.log(`✅ Password reset email sent successfully to ${emailAddress}`);
      
      return {
        success: true,
        message: 'Password reset email sent successfully',
        method: 'email'
      };
    } catch (error) {
      console.error('❌ Error sending password reset email:', error);
      throw new Error('Failed to send password reset email');
    }
  }

  // Send OTP via Email
  async sendEmailOTP(emailAddress, otpCode, userType = 'patient') {
    try {
      console.log('Attempting to send email OTP to:', emailAddress);
      console.log('Email transporter configured:', !!this.emailTransporter);
      
      const isDoctor = userType === 'doctor';
      const subject = isDoctor ? 'Tabeeb - Doctor Verification Code' : 'Tabeeb - Email Verification Code';
      const title = isDoctor ? 'Doctor Verification' : 'Email Verification';
      const greeting = isDoctor ? 'Dear Doctor,' : 'Hello,';
      const description = isDoctor 
        ? 'Your verification code for Tabeeb Doctor Portal is:'
        : 'Your verification code for Tabeeb is:';

      const mailOptions = {
        from: process.env.EMAIL_USER || 'your-email@gmail.com',
        to: emailAddress,
        subject: subject,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2c5aa0;">Tabeeb - ${title}</h2>
            <p>${greeting}</p>
            <p>${description}</p>
            <div style="background-color: #f0f0f0; padding: 20px; text-align: center; margin: 20px 0;">
              <h1 style="color: #2c5aa0; font-size: 32px; margin: 0; letter-spacing: 5px;">${otpCode}</h1>
            </div>
            <p>This code will expire in ${this.otpExpiryMinutes} minutes.</p>
            ${isDoctor ? '<p>Please use this code to complete your doctor account verification process.</p>' : ''}
            <p>If you didn't request this code, please ignore this email.</p>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
            <p style="color: #666; font-size: 12px;">This is an automated message from Tabeeb.</p>
          </div>
        `
      };

      console.log('Sending email with options:', {
        from: mailOptions.from,
        to: mailOptions.to,
        subject: mailOptions.subject
      });

      await this.emailTransporter.sendMail(mailOptions);
      
      console.log(`✅ Email OTP sent successfully to ${emailAddress}: ${otpCode} for ${userType}`);
      
      return {
        success: true,
        message: 'OTP sent successfully via email',
        method: 'email'
      };
    } catch (error) {
      console.error('❌ Error sending email OTP:', error);
      throw new Error('Failed to send email OTP');
    }
  }

  // Send OTP based on method (phone or email) and user type
  async sendOTP(contact, method, userType = 'patient') {
    try {
      const otpCode = this.generateOTP();
      const verificationToken = this.generateVerificationToken();
      
      let result;
      
      if (method === 'phone') {
        result = await this.sendSMSOTP(contact, otpCode);
      } else if (method === 'email') {
        result = await this.sendEmailOTP(contact, otpCode, userType);
      } else {
        throw new Error('Invalid verification method');
      }

      return {
        ...result,
        otpCode,
        verificationToken,
        expiresAt: new Date(Date.now() + this.otpExpiryMinutes * 60 * 1000),
        userType
      };
    } catch (error) {
      console.error('Error in sendOTP:', error);
      throw error;
    }
  }

  // Verify OTP code
  verifyOTP(providedOTP, storedOTP, expiresAt) {
    try {
      // Check if OTP has expired
      if (new Date() > new Date(expiresAt)) {
        return {
          success: false,
          message: 'OTP has expired'
        };
      }

      // Check if OTP matches
      if (providedOTP !== storedOTP) {
        return {
          success: false,
          message: 'Invalid OTP code'
        };
      }

      return {
        success: true,
        message: 'OTP verified successfully'
      };
    } catch (error) {
      console.error('Error verifying OTP:', error);
      return {
        success: false,
        message: 'OTP verification failed'
      };
    }
  }

  // Validate phone number format
  validatePhoneNumber(phoneNumber) {
    if (!phoneNumber) return false;
    
    // Pakistani phone number validation: 0xxxxxxxxxx, 0xxxxxxxxx, 3xxxxxxxxx, 92xxxxxxxxxx, +92xxxxxxxxxx
    const digits = phoneNumber.replace(/\D/g, '');
    return (digits.startsWith('0') && digits.length === 11) || 
           (digits.startsWith('0') && digits.length === 10) ||
           (digits.startsWith('3') && digits.length === 10) ||
           (digits.startsWith('92') && digits.length === 12) ||
           (phoneNumber.startsWith('+') && digits.startsWith('92') && digits.length === 12);
  }

  // Validate email format
  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Normalize phone number to international format (+92xxxxxxxxxx)
  normalizePhoneNumber(phoneNumber) {
    if (!phoneNumber) return phoneNumber;
    
    console.log('=== PHONE NORMALIZATION DEBUG ===');
    console.log('Input phone number:', phoneNumber);
    console.log('Type:', typeof phoneNumber);
    
    // Remove all non-digit characters
    const digits = phoneNumber.replace(/\D/g, '');
    console.log('Digits only:', digits);
    console.log('Digits length:', digits.length);
    console.log('Starts with 0:', digits.startsWith('0'));
    
    // Pakistani phone number normalization
    if (digits.startsWith('0') && digits.length === 11) {
      // 0xxxxxxxxxx -> +92xxxxxxxxxx
      const result = `+92${digits.slice(1)}`;
      console.log('Normalized to:', result);
      console.log('================================');
      return result;
    } else if (digits.startsWith('0') && digits.length === 10) {
      // 0xxxxxxxxx -> +92xxxxxxxxx (for numbers like 0000000000)
      const result = `+92${digits}`;
      console.log('Normalized to:', result);
      console.log('================================');
      return result;
    } else if (digits.startsWith('92') && digits.length === 12) {
      // 92xxxxxxxxxx -> +92xxxxxxxxxx
      const result = `+${digits}`;
      console.log('Normalized to:', result);
      console.log('================================');
      return result;
    } else if (digits.startsWith('3') && digits.length === 10) {
      // 3xxxxxxxxx -> +92xxxxxxxxxx
      const result = `+92${digits}`;
      console.log('Normalized to:', result);
      console.log('================================');
      return result;
    } else if (phoneNumber.startsWith('+')) {
      // Already in international format
      console.log('Already international format:', phoneNumber);
      console.log('================================');
      return phoneNumber;
    }
    
    // Return original if can't normalize
    console.log('Could not normalize, returning original:', phoneNumber);
    console.log('================================');
    return phoneNumber;
  }

  // Format phone number for display
  formatPhoneNumber(phoneNumber) {
    // Remove all non-digit characters
    const digits = phoneNumber.replace(/\D/g, '');
    
    // Format based on length (basic formatting)
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length === 11 && digits[0] === '1') {
      return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    
    return phoneNumber; // Return original if can't format
  }

  // Convenience method for doctor email verification
  async sendDoctorEmailOTP(emailAddress, doctorData = {}) {
    try {
      const result = await this.sendOTP(emailAddress, 'email', 'doctor');
      
      // Log doctor verification attempt
      console.log(`Doctor verification OTP sent to ${emailAddress} for doctor: ${doctorData.DoctorName || 'Unknown'}`);
      
      return result;
    } catch (error) {
      console.error('Error sending doctor verification OTP:', error);
      throw error;
    }
  }

  // Convenience method for patient verification (phone or email)
  async sendPatientOTP(contact, method, patientData = {}) {
    try {
      const result = await this.sendOTP(contact, method, 'patient');
      
      // Log patient verification attempt
      console.log(`Patient verification OTP sent to ${contact} for patient: ${patientData.firstName || 'Unknown'} ${patientData.lastName || ''}`);
      
      return result;
    } catch (error) {
      console.error('Error sending patient verification OTP:', error);
      throw error;
    }
  }

  // Generic verification method that determines user type
  async sendVerificationOTP(contact, method, userType = 'patient', userData = {}) {
    try {
      if (userType === 'doctor') {
        // Doctors only use email verification
        if (method !== 'email') {
          throw new Error('Doctors can only be verified via email');
        }
        return await this.sendDoctorEmailOTP(contact, userData);
      } else {
        return await this.sendPatientOTP(contact, method, userData);
      }
    } catch (error) {
      console.error('Error sending verification OTP:', error);
      throw error;
    }
  }
}

module.exports = new OTPService();
