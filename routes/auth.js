const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const authService = require('../services/auth');
const otpService = require('../services/otpService');
const OTPModel = require('../models/OTPModel');
const PasswordResetTokenModel = require('../models/PasswordResetTokenModel');

// Middleware to verify JWT token
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
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};

// ==================== AUTHENTICATION ROUTES ====================

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { emailAddress, password, firstName, lastName, phone, gender, Age } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !password) {
      return res.status(400).json({
        success: false,
        message: 'First name, last name, and password are required'
      });
    }

    // Validate gender and age are required
    if (!gender || !gender.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Gender is required for account creation'
      });
    }

    if (!Age || !Age.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Age is required for account creation'
      });
    }

    // Validate that either email or phone is provided, but not both
    const hasEmail = emailAddress && emailAddress.trim();
    const hasPhone = phone && phone.trim();

    if (!hasEmail && !hasPhone) {
      return res.status(400).json({
        success: false,
        message: 'Either email address or phone number must be provided'
      });
    }

    if (hasEmail && hasPhone) {
      return res.status(400).json({
        success: false,
        message: 'Please provide either email address or phone number, not both'
      });
    }

    // Basic email validation (only if email is provided)
    if (hasEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailAddress)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid email format'
        });
      }
    }

    // Password validation
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long'
      });
    }

    const result = await authService.register({
      emailAddress,
      password,
      firstName,
      lastName,
      phone,
      gender,
      Age
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: result
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { emailAddress, password } = req.body;

    // Validate required fields
    if (!emailAddress || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const result = await authService.login(emailAddress, password);

    res.json({
      success: true,
      message: 'Login successful',
      data: result
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(401).json({
      success: false,
      message: error.message
    });
  }
});

// Change password
router.put('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.userId;

    console.log('Change password route called:', { 
      userId, 
      currentPasswordLength: currentPassword?.length, 
      newPasswordLength: newPassword?.length,
      userFromToken: req.user 
    });

    // Validate required fields
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    // Password validation
    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long'
      });
    }

    const result = await authService.changePassword(userId, currentPassword, newPassword);

    console.log('Password change result:', result);

    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// Generate reset password page HTML
function generateResetPage(token) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reset Password - Tabeeb</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #F9FAFB;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        
        .container {
          width: 100%;
          max-width: 400px;
        }
        
        .card {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 20px;
          padding: 32px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
          position: relative;
          overflow: hidden;
        }
        
        .card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          background: #474747;
        }
        
        .header {
          text-align: center;
          margin-bottom: 32px;
        }
        
        .icon-container {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 64px;
          height: 64px;
          margin: 0 auto 16px;
          background: #474747;
          border-radius: 50%;
          box-shadow: 0 8px 16px rgba(102, 126, 234, 0.3);
        }
        
        .lock-icon {
          width: 32px;
          height: 32px;
          fill: white;
        }
        
        .title {
          font-size: 28px;
          font-weight: 700;
          color: #1a1a1a;
          margin-bottom: 8px;
          letter-spacing: -0.5px;
        }
        
        .subtitle {
          font-size: 16px;
          color: #666;
          line-height: 1.5;
        }
        
        .form-group {
          margin-bottom: 24px;
        }
        
        .form-label {
          display: block;
          font-size: 14px;
          font-weight: 600;
          color: #1a1a1a;
          margin-bottom: 8px;
        }
        
        .input-container {
          position: relative;
          display: flex;
          align-items: center;
        }
        
        .input-icon {
          position: absolute;
          left: 16px;
          width: 20px;
          height: 20px;
          fill: #999;
          z-index: 2;
        }
        
        .form-input {
          width: 100%;
          padding: 16px 16px 16px 48px;
          border: 2px solid #e1e5e9;
          border-radius: 12px;
          font-size: 16px;
          background: rgba(255, 255, 255, 0.8);
          transition: all 0.3s ease;
          outline: none;
        }
        
        .form-input:focus {
          border-color: #474747;
          background: white;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }
        
        .form-input::placeholder {
          color: #999;
        }
        
        .eye-button {
          position: absolute;
          right: 12px;
          background: none;
          border: none;
          padding: 8px;
          cursor: pointer;
          border-radius: 6px;
          transition: background-color 0.2s ease;
          z-index: 2;
        }
        
        .eye-button:hover {
          background: rgba(0, 0, 0, 0.05);
        }
        
        .eye-icon {
          width: 20px;
          height: 20px;
          fill: #666;
        }
        
        .password-strength {
          margin-top: 12px;
          padding: 16px;
          background: rgba(0, 0, 0, 0.02);
          border-radius: 12px;
          border: 1px solid rgba(0, 0, 0, 0.05);
        }
        
        .strength-title {
          font-size: 14px;
          font-weight: 600;
          color: #1a1a1a;
          margin-bottom: 12px;
        }
        
        .strength-item {
          display: flex;
          align-items: center;
          margin-bottom: 8px;
          font-size: 14px;
        }
        
        .strength-item:last-child {
          margin-bottom: 0;
        }
        
        .strength-icon {
          width: 16px;
          height: 16px;
          margin-right: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .strength-item.valid {
          color: #10b981;
        }
        
        .strength-item.invalid {
          color: #ef4444;
        }
        
        .strength-summary {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid rgba(0, 0, 0, 0.1);
          font-size: 12px;
          font-weight: 500;
        }
        
        .strength-summary.strong {
          color: #10b981;
        }
        
        .strength-summary.weak {
          color: #ef4444;
        }
        
        .password-match {
          margin-top: 12px;
          display: flex;
          align-items: center;
          font-size: 14px;
          font-weight: 500;
        }
        
        .password-match.match {
          color: #10b981;
        }
        
        .password-match.no-match {
          color: #ef4444;
        }
        
        .match-icon {
          width: 16px;
          height: 16px;
          margin-right: 8px;
        }
        
        .submit-button {
          width: 100%;
          padding: 16px;
          background: #474747;
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          margin-top: 24px;
          position: relative;
          overflow: hidden;
        }
        
        .submit-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 16px rgba(102, 126, 234, 0.3);
        }
        
        .submit-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }
        
        .loading-spinner {
          width: 20px;
          height: 20px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top: 2px solid white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-right: 8px;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .alert {
          padding: 16px;
          border-radius: 12px;
          margin: 16px 0;
          display: flex;
          align-items: flex-start;
          font-size: 14px;
        }
        
        .alert-success {
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.2);
          color: #065f46;
        }
        
        .alert-error {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: #991b1b;
        }
        
        .alert-icon {
          width: 20px;
          height: 20px;
          margin-right: 12px;
          margin-top: 2px;
        }
        
        .back-link {
          text-align: center;
          margin-top: 24px;
        }
        
        .back-link a {
          color: #474747;
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          display: inline-flex;
          align-items: center;
          transition: color 0.2s ease;
        }
        
        .back-link a:hover {
          color: #474747;
        }
        
        .back-icon {
          width: 16px;
          height: 16px;
          margin-right: 8px;
        }
        
        .loading-overlay {
          display: none;
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(255, 255, 255, 0.9);
          border-radius: 20px;
          align-items: center;
          justify-content: center;
          flex-direction: column;
        }
        
        .loading-overlay.show {
          display: flex;
        }
        
        .loading-text {
          margin-top: 16px;
          color: #666;
          font-size: 14px;
        }
        
        @media (max-width: 480px) {
          .card {
            padding: 24px;
            margin: 16px;
          }
          
          .title {
            font-size: 24px;
          }
          
          .subtitle {
            font-size: 14px;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
          <div class="header">
            <div class="icon-container">
              <svg class="lock-icon" viewBox="0 0 24 24">
                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6z"/>
              </svg>
            </div>
            <h1 class="title">Reset Password</h1>
            <p class="subtitle">Enter your new password below</p>
          </div>
          
          <div class="alert alert-success">
            <svg class="alert-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
            </svg>
            <div>Your reset link is valid. Enter your new password below.</div>
          </div>
          
          <form id="resetForm">
            <div class="form-group">
              <label class="form-label">New Password</label>
              <div class="input-container">
                <svg class="input-icon" viewBox="0 0 24 24">
                  <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6z"/>
                </svg>
                <input type="password" id="newPassword" class="form-input" placeholder="Enter your new password" required>
                <button type="button" class="eye-button" onclick="togglePassword('newPassword')">
                  <svg class="eye-icon" id="eye-newPassword" viewBox="0 0 24 24">
                    <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                  </svg>
                </button>
              </div>
              
              <div class="password-strength" id="passwordStrength" style="display: none;">
                <div class="strength-title">Password Requirements:</div>
                <div class="strength-item" id="length-check">
                  <div class="strength-icon">❌</div>
                  <span>At least 8 characters</span>
                </div>
                <div class="strength-item" id="uppercase-check">
                  <div class="strength-icon">❌</div>
                  <span>Contains uppercase letter</span>
                </div>
                <div class="strength-item" id="lowercase-check">
                  <div class="strength-icon">❌</div>
                  <span>Contains lowercase letter</span>
                </div>
                <div class="strength-item" id="number-check">
                  <div class="strength-icon">❌</div>
                  <span>Contains number</span>
                </div>
                <div class="strength-item" id="special-check">
                  <div class="strength-icon">❌</div>
                  <span>Contains special character (@$!%*?&)</span>
                </div>
                <div class="strength-summary" id="strengthSummary">
                  Password strength: Enter password
                </div>
              </div>
            </div>
            
            <div class="form-group">
              <label class="form-label">Confirm Password</label>
              <div class="input-container">
                <svg class="input-icon" viewBox="0 0 24 24">
                  <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6z"/>
                </svg>
                <input type="password" id="confirmPassword" class="form-input" placeholder="Confirm your new password" required>
                <button type="button" class="eye-button" onclick="togglePassword('confirmPassword')">
                  <svg class="eye-icon" id="eye-confirmPassword" viewBox="0 0 24 24">
                    <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                  </svg>
                </button>
              </div>
              
              <div class="password-match" id="passwordMatch" style="display: none;">
                <svg class="match-icon" viewBox="0 0 24 24">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
                <span>Passwords match</span>
              </div>
            </div>
            
            <button type="submit" class="submit-button" id="resetBtn">
              Reset Password
            </button>
          </form>
          
          
          <div class="loading-overlay" id="loadingOverlay">
            <div class="loading-spinner"></div>
            <div class="loading-text">Resetting your password...</div>
          </div>
          
          <div id="result"></div>
          
          <div class="back-link">
            <p style="text-align: center; color: #666; margin-top: 20px;">
              Remember your password? Please open the Tabeeb app and sign in.
            </p>
          </div>
        </div>
      </div>
      
      <script>
        const token = '${token}';
        
        function togglePassword(inputId) {
          const input = document.getElementById(inputId);
          const eyeIcon = document.getElementById('eye-' + inputId);
          
          if (input.type === 'password') {
            input.type = 'text';
            eyeIcon.innerHTML = '<path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>';
          } else {
            input.type = 'password';
            eyeIcon.innerHTML = '<path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>';
          }
        }
        
        
        function validatePassword(password) {
          const checks = [
            { label: "At least 8 characters", test: password.length >= 8 },
            { label: "Contains uppercase letter", test: /[A-Z]/.test(password) },
            { label: "Contains lowercase letter", test: /[a-z]/.test(password) },
            { label: "Contains number", test: /\\d/.test(password) },
            { label: "Contains special character (@$!%*?&)", test: /[@$!%*?&]/.test(password) },
          ];
          
          return checks;
        }
        
        function updatePasswordStrength(password) {
          const strengthDiv = document.getElementById('passwordStrength');
          const summaryDiv = document.getElementById('strengthSummary');
          
          if (password.length === 0) {
            strengthDiv.style.display = 'none';
            return;
          }
          
          strengthDiv.style.display = 'block';
          
          const checks = validatePassword(password);
          const allPassed = checks.every(check => check.test);
          const strength = allPassed ? "strong" : "weak";
          
          // Update individual checks
          checks.forEach((check, index) => {
            const checkElement = document.getElementById(['length-check', 'uppercase-check', 'lowercase-check', 'number-check', 'special-check'][index]);
            const iconElement = checkElement.querySelector('.strength-icon');
            
            if (check.test) {
              checkElement.classList.add('valid');
              checkElement.classList.remove('invalid');
              iconElement.textContent = '✓';
            } else {
              checkElement.classList.add('invalid');
              checkElement.classList.remove('valid');
              iconElement.textContent = '✗';
            }
          });
          
          // Update summary
          summaryDiv.className = 'strength-summary ' + strength;
          summaryDiv.textContent = 'Password strength: ' + (strength === 'strong' ? 'Strong ✓' : 'Weak');
        }
        
        function updatePasswordMatch() {
          const password = document.getElementById('newPassword').value;
          const confirmPassword = document.getElementById('confirmPassword').value;
          const matchDiv = document.getElementById('passwordMatch');
          
          if (confirmPassword.length === 0) {
            matchDiv.style.display = 'none';
            return;
          }
          
          matchDiv.style.display = 'flex';
          
          if (password === confirmPassword) {
            matchDiv.classList.add('match');
            matchDiv.classList.remove('no-match');
            matchDiv.querySelector('.match-icon').innerHTML = '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>';
            matchDiv.querySelector('span').textContent = 'Passwords match';
          } else {
            matchDiv.classList.add('no-match');
            matchDiv.classList.remove('match');
            matchDiv.querySelector('.match-icon').innerHTML = '<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>';
            matchDiv.querySelector('span').textContent = 'Passwords do not match';
          }
        }
        
        function updateSubmitButton() {
          const password = document.getElementById('newPassword').value;
          const confirmPassword = document.getElementById('confirmPassword').value;
          const checks = validatePassword(password);
          const allPassed = checks.every(check => check.test);
          const passwordsMatch = password === confirmPassword;
          
          document.getElementById('resetBtn').disabled = !(allPassed && passwordsMatch && password.length > 0);
        }
        
        function showError(message) {
          const resultDiv = document.getElementById('result');
          resultDiv.innerHTML = \`
            <div class="alert alert-error">
              <svg class="alert-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
              <div>\${message}</div>
            </div>
          \`;
        }
        
        function showSuccess(message) {
          const resultDiv = document.getElementById('result');
          resultDiv.innerHTML = \`
            <div class="alert alert-success">
              <svg class="alert-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
              </svg>
              <div>\${message}</div>
            </div>
          \`;
        }
        
        // Event listeners
        document.getElementById('newPassword').addEventListener('input', function() {
          const password = this.value;
          updatePasswordStrength(password);
          updatePasswordMatch();
          updateSubmitButton();
        });
        
        document.getElementById('confirmPassword').addEventListener('input', function() {
          updatePasswordMatch();
          updateSubmitButton();
        });
        
        document.getElementById('resetForm').addEventListener('submit', async function(e) {
          e.preventDefault();
          
          const newPassword = document.getElementById('newPassword').value;
          const confirmPassword = document.getElementById('confirmPassword').value;
          
          if (newPassword !== confirmPassword) {
            showError('Passwords do not match!');
            return;
          }
          
          const checks = validatePassword(newPassword);
          const allPassed = checks.every(check => check.test);
          if (!allPassed) {
            showError('Password does not meet all requirements');
            return;
          }
          
          // Show loading
          document.getElementById('loadingOverlay').classList.add('show');
          
          try {
            const response = await fetch('/api/auth/reset-password', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                token: token,
                newPassword: newPassword,
                confirmPassword: confirmPassword
              })
            });
            
            const result = await response.json();
            
            if (result.success) {
              // Hide loading overlay if shown
              const overlay = document.getElementById('loadingOverlay');
              if (overlay) overlay.classList.remove('show');

              showSuccess('Password reset successfully! Redirecting to the app login...');

              // Show confirmation and manual action in case deep link fails
              const resultDiv = document.getElementById('result');
              if (resultDiv) {
                const actions = document.createElement('div');
                actions.style.marginTop = '16px';
                actions.innerHTML = \`
                  <a href=\"tabeeb://login\" style=\"display:inline-block;background:#474747;color:#fff;padding:12px 16px;border-radius:10px;text-decoration:none;font-weight:600;\">Open App Login</a>
                  <p style=\"margin-top:12px;color:#666;font-size:14px;\">If the app doesn't open, return to the Tabeeb app and sign in with your new password.</p>
                \`;
                resultDiv.appendChild(actions);
              }

              // Attempt to open the app's login via deep link; fallback is visible instructions above
              setTimeout(() => {
                try {
                  window.location.href = 'tabeeb://login';
                } catch (e) {
                  console.log('Deep link navigation failed; staying on success page');
                }
              }, 1500);

              console.log('Password reset successful');
            } else {
              showError(result.message || 'Failed to reset password. Please try again.');
              document.getElementById('loadingOverlay').classList.remove('show');
            }
          } catch (error) {
            showError('Network error. Please check your connection and try again.');
            document.getElementById('loadingOverlay').classList.remove('show');
          }
        });
      </script>
    </body>
    </html>
  `;
}

// Serve reset password page (for email links)
router.get('/reset-password', async (req, res) => {
  try {
    const { token } = req.query;
    
    console.log('=== RESET PASSWORD PAGE DEBUG ===');
    console.log('Full URL:', req.url);
    console.log('Query params:', req.query);
    console.log('Token from query:', token);
    console.log('Token type:', typeof token);
    console.log('Token length:', token ? token.length : 'No token');
    console.log('Decoded token:', token ? decodeURIComponent(token) : 'No token');
    console.log('Headers:', req.headers);
    console.log('================================');
    
    if (!token) {
      // Check if this is a redirect from a valid token request
      const referer = req.headers.referer;
      if (referer && referer.includes('/reset-password?token=')) {
        // Extract token from referer
        const tokenMatch = referer.match(/token=([^&]+)/);
        if (tokenMatch) {
          const extractedToken = tokenMatch[1];
          console.log('Extracted token from referer:', extractedToken.substring(0, 10) + '...');
          
          // Validate the extracted token
          const tokenValidation = await PasswordResetTokenModel.isTokenValid(extractedToken);
          if (tokenValidation.valid) {
            console.log('Token from referer is valid, serving reset page');
            // Serve the reset page with the extracted token
            return res.send(generateResetPage(extractedToken));
          }
        }
      }
      
      return res.status(400).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Reset Password - Tabeeb</title>
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background-color: #F9FAFB;
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 20px;
            }
            
            .card {
              background: white;
              border-radius: 14px;
              padding: 24px;
              box-shadow: 0 4px 8px rgba(0,0,0,0.1);
              width: 100%;
              max-width: 400px;
              text-align: center;
            }
            
            .title {
              font-size: 24px;
              font-weight: 700;
              color: #212121;
              margin-bottom: 8px;
            }
            
            .error {
              color: #F44336;
              background: #fdf2f2;
              padding: 15px;
              border-radius: 10px;
              margin: 15px 0;
              border-left: 4px solid #F44336;
              font-size: 14px;
            }
            
            .instructions {
              background: #E8F4FD;
              padding: 16px;
              border-radius: 10px;
              margin: 15px 0;
              text-align: left;
            }
            
            .instructions h3 {
              color: #212121;
              margin-bottom: 8px;
              font-size: 16px;
            }
            
            .instructions ol {
              color: #616161;
              font-size: 14px;
              line-height: 1.4;
            }
            
            .instructions li {
              margin-bottom: 4px;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <h1 class="title">Reset Password</h1>
            <div class="error">
              ❌ No reset code found. Please use the link from your email.
            </div>
            <div class="instructions">
              <h3>📧 What to do:</h3>
              <ol>
                <li>Check your email for the password reset message</li>
                <li>Click the reset link in the email</li>
                <li>Follow the instructions to reset your password</li>
              </ol>
            </div>
          </div>
        </body>
        </html>
      `);
    }

    // Check if token is valid
    console.log('Validating token...');
    const tokenValidation = await PasswordResetTokenModel.isTokenValid(token);
    console.log('Token validation result:', tokenValidation);
    
    if (!tokenValidation.valid) {
      return res.status(400).send(`
        <html>
          <head>
            <title>Reset Password - Tabeeb</title>
            <style>
              body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
              .error { color: #e74c3c; background: #fdf2f2; padding: 15px; border-radius: 5px; border-left: 4px solid #e74c3c; }
              .instructions { background: #e3f2fd; padding: 15px; border-radius: 5px; border-left: 4px solid #2196f3; }
            </style>
          </head>
          <body>
            <h1>Tabeeb - Reset Password</h1>
            <div class="error">
              <strong>Error:</strong> ${tokenValidation.reason === 'Token not found' ? 'Invalid reset token' : 
                 tokenValidation.reason === 'Token already used' ? 'Reset token has already been used' :
                 tokenValidation.reason === 'Token expired' ? 'Reset token has expired' :
                 'Invalid reset token'}
            </div>
            <div class="instructions">
              <strong>What to do:</strong>
              <ul>
                <li>If the token has expired, request a new password reset</li>
                <li>If the token was already used, request a new password reset</li>
                <li>Make sure you're using the correct link from your email</li>
              </ul>
            </div>
          </body>
        </html>
      `);
    }

    // Token is valid, show the reset page
    res.send(generateResetPage(token));

  } catch (error) {
    console.error('Reset password page error:', error);
    res.status(500).send(`
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Password - Tabeeb</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: #F9FAFB;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
          }
          
          .card {
            background: white;
            border-radius: 14px;
            padding: 24px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
            width: 100%;
            max-width: 400px;
          }
          
          .back-button {
            background: none;
            border: none;
            color: #474747;
            font-size: 24px;
            cursor: pointer;
            margin-bottom: 16px;
            padding: 8px;
          }
          
          
          .title {
            font-size: 24px;
            font-weight: 700;
            color: #212121;
            text-align: center;
            margin-bottom: 8px;
          }
          
          .subtitle {
            font-size: 14px;
            color: #616161;
            text-align: center;
            margin-bottom: 24px;
            line-height: 1.4;
          }
          
          .input-container {
            display: flex;
            align-items: center;
            border: 1px solid #E0E0E0;
            border-radius: 10px;
            padding: 0 16px;
            margin-bottom: 8px;
            background: #F9FAFB;
          }
          
          .input-container input {
            flex: 1;
            padding: 16px 8px;
            border: none;
            background: none;
            font-size: 16px;
            color: #212121;
            outline: none;
          }
          
          .input-container input::placeholder {
            color: #616161;
          }
          
          .eye-button {
            background: none;
            border: none;
            color: #616161;
            cursor: pointer;
            padding: 8px;
            font-size: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
          }
          
          .eye-button svg {
            width: 20px;
            height: 20px;
            fill: currentColor;
          }
          
          .info-container {
            background: #E8F4FD;
            padding: 16px;
            border-radius: 10px;
            margin-top: 16px;
            display: flex;
            align-items: flex-start;
          }
          
          .info-text {
            font-size: 14px;
            color: #616161;
            line-height: 1.4;
            margin-left: 8px;
          }
          
          .button {
            background: #474747;
            color: white;
            padding: 16px;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            margin-top: 16px;
            font-size: 16px;
            font-weight: 700;
            width: 100%;
            transition: opacity 0.2s ease;
          }
          
          .button:hover {
            opacity: 0.9;
          }
          
          .button:disabled {
            background: #616161;
            cursor: not-allowed;
            opacity: 0.6;
          }
          
          .error {
            color: #F44336;
            background: #fdf2f2;
            padding: 15px;
            border-radius: 10px;
            margin: 15px 0;
            border-left: 4px solid #F44336;
            font-size: 14px;
          }
          
          .success {
            color: #4CAF50;
            background: #f0f9f0;
            padding: 15px;
            border-radius: 10px;
            margin: 15px 0;
            border-left: 4px solid #4CAF50;
            font-size: 14px;
          }
          
          .loading {
            display: none;
            text-align: center;
            margin: 20px 0;
          }
          
          .spinner {
            border: 3px solid #f3f3f3;
            border-top: 3px solid #474747;
            border-radius: 50%;
            width: 30px;
            height: 30px;
            animation: spin 1s linear infinite;
            margin: 0 auto;
          }
          
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          
          .link-text {
            color: #0097A7;
            font-size: 14px;
            text-align: center;
            margin-top: 16px;
            cursor: pointer;
          }
          
          .link-text:hover {
            text-decoration: underline;
          }
          
          .password-validation {
            margin-top: 8px;
            font-size: 12px;
          }
          
          .validation-item {
            display: flex;
            align-items: center;
            margin-bottom: 4px;
            color: #616161;
          }
          
          .validation-item.valid {
            color: #4CAF50;
          }
          
          .validation-item.invalid {
            color: #F44336;
          }
          
          .validation-icon {
            width: 16px;
            height: 16px;
            margin-right: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          
          .password-match {
            margin-top: 8px;
            font-size: 12px;
            display: flex;
            align-items: center;
            color: #616161;
          }
          
          .password-match.match {
            color: #4CAF50;
          }
          
          .password-match.no-match {
            color: #F44336;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <button class="back-button" onclick="window.history.back()">←</button>
          
          <h1 class="title">Reset Password</h1>
          <p class="subtitle">Enter your new password below</p>
          
          <div class="success">
            ✅ Your reset link is valid. Enter your new password below.
          </div>
          
          <form id="resetForm">
            <div class="input-container">
              <input type="password" id="newPassword" placeholder="New Password" required>
              <button type="button" class="eye-button" onclick="togglePassword('newPassword')">
                <svg id="eye-newPassword" viewBox="0 0 24 24">
                  <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                </svg>
              </button>
            </div>
            
            <div class="password-validation" id="passwordValidation" style="display: none;">
              <div class="validation-item" id="length-check">
                <div class="validation-icon">❌</div>
                <span>At least 8 characters</span>
              </div>
              <div class="validation-item" id="uppercase-check">
                <div class="validation-icon">❌</div>
                <span>One uppercase letter</span>
              </div>
              <div class="validation-item" id="lowercase-check">
                <div class="validation-icon">❌</div>
                <span>One lowercase letter</span>
              </div>
              <div class="validation-item" id="number-check">
                <div class="validation-icon">❌</div>
                <span>One number</span>
              </div>
              <div class="validation-item" id="special-check">
                <div class="validation-icon">❌</div>
                <span>One special character</span>
              </div>
            </div>
            
            <div class="input-container">
              <input type="password" id="confirmPassword" placeholder="Confirm Password" required>
              <button type="button" class="eye-button" onclick="togglePassword('confirmPassword')">
                <svg id="eye-confirmPassword" viewBox="0 0 24 24">
                  <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                </svg>
              </button>
            </div>
            
            <div class="password-match" id="passwordMatch" style="display: none;">
              <div class="validation-icon">❌</div>
              <span>Passwords match</span>
            </div>
            
            <div class="info-container">
              <span>ℹ️</span>
              <span class="info-text">Password must be at least 8 characters with uppercase, lowercase, number, and special character.</span>
            </div>
            
            <button type="submit" class="button" id="resetBtn">
              Reset Password
            </button>
          </form>
          
          <div class="loading" id="loading">
            <div class="spinner"></div>
            <p>Resetting your password...</p>
          </div>
          
          <div id="result"></div>
          
          <div class="link-text" style="text-align: center; color: #666; margin-top: 20px;">
            Remember your password? Please open the Tabeeb app and sign in.
          </div>
        </div>
        
        <script>
          const token = '${token}';
          
          function togglePassword(inputId) {
            const input = document.getElementById(inputId);
            const eyeIcon = document.getElementById('eye-' + inputId);
            
            if (input.type === 'password') {
              input.type = 'text';
              eyeIcon.innerHTML = '<path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>';
            } else {
              input.type = 'password';
              eyeIcon.innerHTML = '<path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>';
            }
          }
          
          function validatePassword(password) {
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
            
            return errors;
          }
          
          function updatePasswordValidation(password) {
            const validationDiv = document.getElementById('passwordValidation');
            const lengthCheck = document.getElementById('length-check');
            const uppercaseCheck = document.getElementById('uppercase-check');
            const lowercaseCheck = document.getElementById('lowercase-check');
            const numberCheck = document.getElementById('number-check');
            const specialCheck = document.getElementById('special-check');
            
            if (password.length === 0) {
              validationDiv.style.display = 'none';
              return;
            }
            
            validationDiv.style.display = 'block';
            
            // Length check
            if (password.length >= 8) {
              lengthCheck.classList.add('valid');
              lengthCheck.classList.remove('invalid');
              lengthCheck.querySelector('.validation-icon').textContent = '✅';
            } else {
              lengthCheck.classList.add('invalid');
              lengthCheck.classList.remove('valid');
              lengthCheck.querySelector('.validation-icon').textContent = '❌';
            }
            
            // Uppercase check
            if (/[A-Z]/.test(password)) {
              uppercaseCheck.classList.add('valid');
              uppercaseCheck.classList.remove('invalid');
              uppercaseCheck.querySelector('.validation-icon').textContent = '✅';
            } else {
              uppercaseCheck.classList.add('invalid');
              uppercaseCheck.classList.remove('valid');
              uppercaseCheck.querySelector('.validation-icon').textContent = '❌';
            }
            
            // Lowercase check
            if (/[a-z]/.test(password)) {
              lowercaseCheck.classList.add('valid');
              lowercaseCheck.classList.remove('invalid');
              lowercaseCheck.querySelector('.validation-icon').textContent = '✅';
            } else {
              lowercaseCheck.classList.add('invalid');
              lowercaseCheck.classList.remove('valid');
              lowercaseCheck.querySelector('.validation-icon').textContent = '❌';
            }
            
            // Number check
            if (/[0-9]/.test(password)) {
              numberCheck.classList.add('valid');
              numberCheck.classList.remove('invalid');
              numberCheck.querySelector('.validation-icon').textContent = '✅';
            } else {
              numberCheck.classList.add('invalid');
              numberCheck.classList.remove('valid');
              numberCheck.querySelector('.validation-icon').textContent = '❌';
            }
            
            // Special character check
            if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
              specialCheck.classList.add('valid');
              specialCheck.classList.remove('invalid');
              specialCheck.querySelector('.validation-icon').textContent = '✅';
            } else {
              specialCheck.classList.add('invalid');
              specialCheck.classList.remove('valid');
              specialCheck.querySelector('.validation-icon').textContent = '❌';
            }
          }
          
          function updatePasswordMatch() {
            const password = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            const matchDiv = document.getElementById('passwordMatch');
            
            if (confirmPassword.length === 0) {
              matchDiv.style.display = 'none';
              return;
            }
            
            matchDiv.style.display = 'flex';
            
            if (password === confirmPassword) {
              matchDiv.classList.add('match');
              matchDiv.classList.remove('no-match');
              matchDiv.querySelector('.validation-icon').textContent = '✅';
              matchDiv.querySelector('span').textContent = 'Passwords match';
            } else {
              matchDiv.classList.add('no-match');
              matchDiv.classList.remove('match');
              matchDiv.querySelector('.validation-icon').textContent = '❌';
              matchDiv.querySelector('span').textContent = 'Passwords do not match';
            }
          }
          
          function updateSubmitButton() {
            const password = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            const passwordsMatch = password === confirmPassword;
            const passwordValid = validatePassword(password).length === 0;
            
            document.getElementById('resetBtn').disabled = !(passwordValid && passwordsMatch && password.length > 0);
          }
          
          function showError(message) {
            const resultDiv = document.getElementById('result');
            resultDiv.innerHTML = '<div class="error">❌ ' + message + '</div>';
          }
          
          function showSuccess(message) {
            const resultDiv = document.getElementById('result');
            resultDiv.innerHTML = '<div class="success">✅ ' + message + '</div>';
          }
          
          // Event listeners
          document.getElementById('newPassword').addEventListener('input', function() {
            const password = this.value;
            updatePasswordValidation(password);
            updatePasswordMatch();
            updateSubmitButton();
          });
          
          document.getElementById('confirmPassword').addEventListener('input', function() {
            updatePasswordMatch();
            updateSubmitButton();
          });
          
          document.getElementById('resetForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            console.log('Form submitted!');
            
            const newPassword = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            
            console.log('Passwords:', { newPasswordLength: newPassword.length, confirmPasswordLength: confirmPassword.length });
            
            if (newPassword !== confirmPassword) {
              showError('Passwords do not match!');
              return;
            }
            
            const passwordErrors = validatePassword(newPassword);
            if (passwordErrors.length > 0) {
              showError('Password does not meet requirements: ' + passwordErrors.join(', '));
              return;
            }
            
            console.log('All validations passed, proceeding with reset...');
            
            // Show loading
            document.getElementById('resetForm').style.display = 'none';
            document.getElementById('loading').style.display = 'block';
            
            try {
              console.log('Making API call...');
              
              const response = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  token: token,
                  newPassword: newPassword,
                  confirmPassword: confirmPassword
                })
              });
              
              console.log('Response received:', response.status);
              
              const result = await response.json();
              console.log('Result:', result);
              
              if (result.success) {
                // Hide loading state when done
                const loading = document.getElementById('loading');
                if (loading) loading.style.display = 'none';

                showSuccess('Password reset successfully! Redirecting to the app login...');

                // Show confirmation and manual action in case deep link fails
                const resultDiv = document.getElementById('result');
                if (resultDiv) {
                  const actions = document.createElement('div');
                  actions.style.marginTop = '12px';
                  actions.innerHTML = \`
                    <a href=\"tabeeb://login\" style=\"display:inline-block;background:#474747;color:#fff;padding:12px 16px;border-radius:10px;text-decoration:none;font-weight:700;\">Open App Login</a>
                    <p style=\"margin-top:10px;color:#616161;font-size:14px;\">If the app doesn't open, return to the Tabeeb app and sign in with your new password.</p>
                  \`;
                  resultDiv.appendChild(actions);
                }

                // Attempt to deep link back to the app login
                setTimeout(() => {
                  try {
                    window.location.href = 'tabeeb://login';
                  } catch (e) {
                    console.log('Deep link navigation failed; staying on success page');
                  }
                }, 1500);

                console.log('Password reset successful');
              } else {
                showError(result.message || 'Failed to reset password. Please try again.');
                document.getElementById('resetForm').style.display = 'block';
                document.getElementById('loading').style.display = 'none';
              }
            } catch (error) {
              console.error('Error:', error);
              showError('Network error. Please check your connection and try again.');
              document.getElementById('resetForm').style.display = 'block';
              document.getElementById('loading').style.display = 'none';
            }
          });
        </script>
      </body>
      </html>
    `);
  }
});

// Request password reset (forgot password)
router.post('/forgot-password', async (req, res) => {
  try {
    const { contact } = req.body;
    console.log('Forgot password request received:', { contact });

    // Validate required fields
    if (!contact) {
      return res.status(400).json({
        success: false,
        message: 'Email or phone number is required'
      });
    }

    // Determine if contact is email or phone
    let isEmail = false;
    let user = null;

    if (otpService.validateEmail(contact)) {
      isEmail = true;
      console.log('Contact is email, searching for user...');
      user = await authService.userModel.getUserByEmail(contact);
    } else if (otpService.validatePhoneNumber(contact)) {
      isEmail = false;
      console.log('Contact is phone, searching for user...');
      user = await authService.userModel.getUserByPhone(contact);
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid email or phone number format'
      });
    }

    console.log('User found:', user ? 'Yes' : 'No');

    if (!user) {
      // For security, don't reveal if user exists or not
      return res.json({
        success: true,
        message: 'If an account with this email/phone exists, a password reset link has been sent.'
      });
    }

    // Generate reset token
    const resetToken = otpService.generateVerificationToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    console.log('Creating reset token for user:', user._id);
    console.log('Generated reset token:', resetToken.substring(0, 10) + '...');

    // Store reset token
    await PasswordResetTokenModel.createResetToken(user._id, user.emailAddress, resetToken, expiresAt);

    // For now, only implement email reset
    if (isEmail && user.emailAddress) {
      // Create reset URL (this would be your frontend reset password page)
      const baseUrl = process.env.BACKEND_URL || 'http://192.168.10.16:3000';
      const resetUrl = `${baseUrl}/api/auth/reset-password?token=${encodeURIComponent(resetToken)}`;
      
      console.log('Base URL:', baseUrl);
      console.log('Reset token:', resetToken.substring(0, 10) + '...');
      console.log('Generated reset URL:', resetUrl);
      
      // Send reset email
      await otpService.sendPasswordResetEmail(user.emailAddress, resetToken, resetUrl);
      
      return res.json({
        success: true,
        message: 'Password reset link has been sent to your email address.'
      });
    } else {
      // Phone reset not implemented yet
      return res.status(400).json({
        success: false,
        message: 'Password reset via phone is not available yet. Please use email.'
      });
    }

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while processing your request'
    });
  }
});

// Reset password with token
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword, confirmPassword } = req.body;

    // Validate required fields
    if (!token || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Token, new password, and confirm password are required'
      });
    }

    // Check if passwords match
    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match'
      });
    }

    // Validate password strength
    const passwordValidation = otpService.validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Password does not meet requirements',
        errors: passwordValidation.errors
      });
    }

    // Check if token is valid
    const tokenValidation = await PasswordResetTokenModel.isTokenValid(token);
    if (!tokenValidation.valid) {
      return res.status(400).json({
        success: false,
        message: tokenValidation.reason === 'Token not found' ? 'Invalid reset token' : 
                 tokenValidation.reason === 'Token already used' ? 'Reset token has already been used' :
                 tokenValidation.reason === 'Token expired' ? 'Reset token has expired' :
                 'Invalid reset token'
      });
    }

    const resetTokenData = tokenValidation.resetToken;

    // Update user password
    const result = await authService.resetPasswordByUserId(resetTokenData.userId, newPassword);

    // Mark token as used
    await PasswordResetTokenModel.markTokenAsUsed(token);

    // Clean up expired tokens
    await PasswordResetTokenModel.deleteExpiredTokens();

    res.json({
      success: true,
      message: 'Password has been reset successfully'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while resetting your password'
    });
  }
});

// Get current user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const token = req.headers['authorization'].split(' ')[1];
    const user = await authService.getUserProfile(token);

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// Verify token endpoint
router.get('/verify', authenticateToken, (req, res) => {
  res.json({
    success: true,
    message: 'Token is valid',
    user: req.user
  });
});

// Logout (client-side token removal)
router.post('/logout', authenticateToken, (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

// ==================== OTP VERIFICATION ROUTES ====================

// Send OTP for registration
router.post('/send-otp', async (req, res) => {
  try {
    const { contact, method, firstName, lastName, gender, Age } = req.body;

    // Validate required fields
    if (!contact || !method) {
      return res.status(400).json({
        success: false,
        message: 'Contact information and verification method are required'
      });
    }

    // Validate method
    if (!['phone', 'email'].includes(method)) {
      return res.status(400).json({
        success: false,
        message: 'Verification method must be either "phone" or "email"'
      });
    }

    // Validate contact format
    if (method === 'phone') {
      if (!otpService.validatePhoneNumber(contact)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid phone number format'
        });
      }
    } else if (method === 'email') {
      if (!otpService.validateEmail(contact)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid email format'
        });
      }
    }

    // Check if contact already exists
    if (method === 'phone') {
      const phoneExists = await authService.userModel.phoneExists(contact);
      if (phoneExists) {
        return res.status(400).json({
          success: false,
          message: 'An account with this phone number already exists'
        });
      }
    } else if (method === 'email') {
      const emailExists = await authService.userModel.emailExists(contact);
      if (emailExists) {
        return res.status(400).json({
          success: false,
          message: 'An account with this email address already exists'
        });
      }
    }

    // Clean up expired OTPs first
    await OTPModel.deleteExpiredOTPs();
    
    // Check if there's already an active OTP for this contact
    const existingOTP = await OTPModel.getOTPByContact(contact, method);
    if (existingOTP) {
      // In development, allow overriding existing OTPs
      if (process.env.NODE_ENV === 'development') {
        console.log('Development mode: Deleting existing OTP for', contact);
        await OTPModel.deleteOTPByContact(contact, method);
      } else {
        return res.status(400).json({
          success: false,
          message: 'An OTP has already been sent. Please wait before requesting another.'
        });
      }
    }

    // Send OTP
    const otpResult = await otpService.sendOTP(contact, method);

    // Store OTP record
    await OTPModel.createOTPRecord({
      contact,
      method,
      otpCode: otpResult.otpCode,
      verificationToken: otpResult.verificationToken,
      expiresAt: otpResult.expiresAt
    });

    res.json({
      success: true,
      message: `OTP sent successfully to ${method === 'phone' ? otpService.formatPhoneNumber(contact) : contact}`,
      data: {
        verificationToken: otpResult.verificationToken,
        method: otpResult.method,
        expiresIn: 10 // minutes
      }
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to send OTP'
    });
  }
});

// Verify OTP and complete registration
router.post('/verify-otp-register', async (req, res) => {
  try {
    const { verificationToken, otpCode, password, firstName, lastName, gender, Age } = req.body;

    // Validate required fields
    if (!verificationToken || !otpCode || !password || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        message: 'All required fields must be provided'
      });
    }

    // Password validation
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long'
      });
    }

    // Get OTP record
    const otpRecord = await OTPModel.getOTPByToken(verificationToken);
    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification token'
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

    // Check for duplicate credentials before creating account
    const contactToCheck = otpRecord.contact;
    
    if (otpRecord.method === 'email') {
      // Normalize email to lowercase for case-insensitive matching
      const normalizedEmail = contactToCheck.toLowerCase();
      const emailExists = await authService.userModel.emailExists(normalizedEmail);
      if (emailExists) {
        return res.status(400).json({
          success: false,
          message: 'User with similar credentials exists already'
        });
      }
    } else if (otpRecord.method === 'phone') {
      const phoneExists = await authService.userModel.phoneExists(contactToCheck);
      if (phoneExists) {
        return res.status(400).json({
          success: false,
          message: 'User with similar credentials exists already'
        });
      }
    }

    // Validate required fields for OTP registration
    if (!firstName || !lastName || !password) {
      return res.status(400).json({
        success: false,
        message: 'First name, last name, and password are required'
      });
    }

    // Validate gender and age are required
    if (!gender || !gender.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Gender is required for account creation'
      });
    }

    if (!Age || !Age.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Age is required for account creation'
      });
    }

    // Create user account (normalize email to lowercase)
    const userData = {
      emailAddress: otpRecord.method === 'email' ? otpRecord.contact.toLowerCase() : '',
      phone: otpRecord.method === 'phone' ? otpRecord.contact : '',
      password,
      firstName,
      lastName,
      gender: gender,
      Age: Age
    };

    const result = await authService.register(userData);

    // Clean up OTP record
    await OTPModel.deleteOTPRecord(verificationToken);

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: result
    });
  } catch (error) {
    console.error('Verify OTP register error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to verify OTP and create account'
    });
  }
});

// Resend OTP
router.post('/resend-otp', async (req, res) => {
  try {
    const { verificationToken } = req.body;

    if (!verificationToken) {
      return res.status(400).json({
        success: false,
        message: 'Verification token is required'
      });
    }

    // Get OTP record
    const otpRecord = await OTPModel.getOTPByToken(verificationToken);
    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification token'
      });
    }

    // Check if OTP is already verified
    if (otpRecord.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'OTP has already been verified'
      });
    }

    // Check if OTP has expired
    if (new Date() > new Date(otpRecord.expiresAt)) {
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new one.'
      });
    }

    // Send new OTP
    const otpResult = await otpService.sendOTP(otpRecord.contact, otpRecord.method);

    // Update OTP record with new code
    const collection = await OTPModel.getCollection();
    await collection.updateOne(
      { verificationToken },
      {
        $set: {
          otpCode: otpResult.otpCode,
          expiresAt: otpResult.expiresAt,
          attempts: 0, // Reset attempts
          updatedAt: new Date()
        }
      }
    );

    res.json({
      success: true,
      message: `New OTP sent successfully to ${otpRecord.method === 'phone' ? otpService.formatPhoneNumber(otpRecord.contact) : otpRecord.contact}`,
      data: {
        verificationToken,
        method: otpRecord.method,
        expiresIn: 10 // minutes
      }
    });
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to resend OTP'
    });
  }
});

// Login with phone or email
router.post('/login-flexible', async (req, res) => {
  try {
    const { contact, password } = req.body;

    // Validate required fields
    if (!contact || !password) {
      return res.status(400).json({
        success: false,
        message: 'Contact information and password are required'
      });
    }

    // Determine if contact is email or phone
    let isEmail = false;
    
    if (otpService.validateEmail(contact)) {
      isEmail = true;
    } else if (otpService.validatePhoneNumber(contact)) {
      isEmail = false;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid email or phone number format'
      });
    }

    const result = await authService.loginFlexible(contact, password, isEmail);

    res.json({
      success: true,
      message: 'Login successful',
      data: result
    });
  } catch (error) {
    console.error('Flexible login error:', error);
    res.status(401).json({
      success: false,
      message: error.message || 'Login failed'
    });
  }
});

module.exports = router;

// ==================== DEVELOPMENT UTILITIES ====================

// Clear all OTP records (development only)
router.post('/clear-otps', async (req, res) => {
  try {
    // Allow clearing OTPs in development or when NODE_ENV is not set
    if (process.env.NODE_ENV && process.env.NODE_ENV !== 'development') {
      return res.status(403).json({
        success: false,
        message: 'This endpoint is only available in development mode'
      });
    }

    const collection = await OTPModel.getCollection();
    const result = await collection.deleteMany({});
    
    console.log(`🧹 Manual OTP clear: Deleted ${result.deletedCount} OTP records`);
    
    res.json({
      success: true,
      message: `Cleared ${result.deletedCount} OTP records`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Clear OTPs error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to clear OTP records'
    });
  }
});

// ==================== SIMPLE OTP ENDPOINTS FOR FRONTEND ====================

// Simple OTP send endpoint (for frontend compatibility)
router.post('/send-otp-simple', async (req, res) => {
  try {
    const { phone } = req.body;
    
    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }

    // Validate phone number
    if (!otpService.validatePhoneNumber(phone)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format'
      });
    }

    // Clean up expired OTPs first
    await OTPModel.deleteExpiredOTPs();
    
    // Check if there's already an active OTP for this phone
    const existingOTP = await OTPModel.getOTPByContact(phone, 'phone');
    if (existingOTP) {
      // Always allow overriding existing OTPs in development or when NODE_ENV is not set
      // This ensures OTPs can be resent after restarting the server
      if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
        console.log('Development mode: Deleting existing OTP for', phone);
        await OTPModel.deleteOTPByContact(phone, 'phone');
      } else {
        return res.status(400).json({
          success: false,
          message: 'An OTP has already been sent. Please wait before requesting another.'
        });
      }
    }

    // Normalize phone number before sending OTP
    const normalizedPhone = otpService.normalizePhoneNumber(phone);
    console.log('Send OTP phone normalization:', { original: phone, normalized: normalizedPhone });

    // Send OTP
    const otpResult = await otpService.sendOTP(normalizedPhone, 'phone');

    // Store OTP record with normalized phone
    await OTPModel.createOTPRecord({
      contact: normalizedPhone,
      method: 'phone',
      otpCode: otpResult.otpCode,
      verificationToken: otpResult.verificationToken,
      expiresAt: otpResult.expiresAt
    });

    res.json({
      success: true,
      message: `OTP sent successfully to ${otpService.formatPhoneNumber(phone)}`,
      data: {
        sessionId: otpResult.verificationToken,
        expiresIn: 10 // minutes
      }
    });
  } catch (error) {
    console.error('Send OTP simple error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to send OTP'
    });
  }
});

// Simple OTP verify endpoint (for frontend compatibility)
router.post('/verify-otp-simple', async (req, res) => {
  try {
    const { phone, otp, sessionId } = req.body;

    // Debug logging
    console.log('=== VERIFY OTP SIMPLE DEBUG ===');
    console.log('Request body:', req.body);
    console.log('Phone:', phone, 'Type:', typeof phone);
    console.log('OTP:', otp, 'Type:', typeof otp);
    console.log('SessionId:', sessionId, 'Type:', typeof sessionId);
    console.log('Phone truthy:', !!phone);
    console.log('OTP truthy:', !!otp);
    console.log('SessionId truthy:', !!sessionId);
    console.log('===============================');

    if (!phone || !otp || !sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Phone number, OTP, and session ID are required'
      });
    }

    // Get OTP record by sessionId (verificationToken)
    const otpRecord = await OTPModel.getOTPByToken(sessionId);
    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: 'Invalid session ID'
      });
    }

    // Normalize phone number before checking match
    const normalizedPhone = otpService.normalizePhoneNumber(phone);
    console.log('Verify OTP phone normalization:', { original: phone, normalized: normalizedPhone });

    // Check if normalized phone matches the OTP record
    if (otpRecord.contact !== normalizedPhone) {
      return res.status(400).json({
        success: false,
        message: 'Phone number does not match session'
      });
    }

    // Check if max attempts reached
    const maxAttemptsReached = await OTPModel.isMaxAttemptsReached(sessionId);
    if (maxAttemptsReached) {
      return res.status(400).json({
        success: false,
        message: 'Maximum verification attempts reached. Please request a new OTP.'
      });
    }

    // Verify OTP
    const verificationResult = otpService.verifyOTP(otp, otpRecord.otpCode, otpRecord.expiresAt);
    if (!verificationResult.success) {
      // Increment attempts
      await OTPModel.incrementAttempts(sessionId);
      
      return res.status(400).json({
        success: false,
        message: verificationResult.message
      });
    }

    // Mark OTP as verified
    await OTPModel.updateOTPVerification(sessionId, true);

    // Use the already normalized phone number from above
    console.log('OTP verify phone normalization:', { original: phone, normalized: normalizedPhone });

    // Check if user exists, if not create a temporary one
    let user = await authService.userModel.getUserByPhone(normalizedPhone);
    if (!user) {
      // Create a temporary user for phone verification
      const randomPassword = await bcrypt.hash(normalizedPhone + Date.now(), 12);
      const createResult = await authService.userModel.createUser({
        firstName: 'Phone',
        lastName: 'User',
        emailAddress: `${normalizedPhone.replace('+', '')}@phone.temp`,
        phone: normalizedPhone,
        password: randomPassword,
        profileImage: '',
        gender: '',
        Age: '',
        address: {},
        nextAppointment: null
      });

      if (createResult.insertedId) {
        user = await authService.userModel.getUserById(createResult.insertedId);
      }
    }

    if (!user) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create or retrieve user'
      });
    }

    // Generate JWT token
    const { password: _pw, ...safeUser } = user;
    const token = authService.generateToken(safeUser);

    // Clean up OTP record
    await OTPModel.deleteOTPRecord(sessionId);

    res.json({
      success: true,
      message: 'OTP verified successfully',
      data: {
        user: safeUser,
        token
      }
    });
  } catch (error) {
    console.error('Verify OTP simple error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to verify OTP'
    });
  }
});

// ==================== FIREBASE PHONE AUTH VERIFICATION ====================

// ==================== END OF AUTH ROUTES ====================

module.exports = router;
