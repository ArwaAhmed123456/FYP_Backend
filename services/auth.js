const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const UserModel = require('../models/UserModel');
const PatientMedicalRecordModel = require('../models/PatientMedicalRecordModel');
const otpService = require('./otpService');

// JWT Secret - In production, this should be in environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'Tabeeb_secret_key_2024';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

class AuthService {
  constructor() {
    this.userModel = UserModel;
  }

  // Register a new user
  async register(userData) {
    try {
      const { emailAddress, password, firstName, lastName, phone, gender, Age } = userData;

      console.log('Registration attempt for:', { emailAddress, phone });

      // Validate required fields
      if (!firstName || !lastName || !password) {
        throw new Error('First name, last name, and password are required');
      }

      // Validate gender and age are required
      if (!gender || !gender.trim()) {
        throw new Error('Gender is required for account creation');
      }

      if (!Age || !Age.trim()) {
        throw new Error('Age is required for account creation');
      }

      // Validate that either email or phone is provided, but not both
      const hasEmail = emailAddress && emailAddress.trim();
      const hasPhone = phone && phone.trim();

      if (!hasEmail && !hasPhone) {
        throw new Error('Either email address or phone number must be provided');
      }

      if (hasEmail && hasPhone) {
        throw new Error('Please provide either email address or phone number, not both');
      }

      // Check if email already exists (only if email is provided)
      if (hasEmail) {
        const normalizedEmail = emailAddress.toLowerCase();
        const emailExists = await this.userModel.emailExists(normalizedEmail);
        if (emailExists) {
          throw new Error('An account with this email address already exists');
        }
      }

      // Normalize phone number to international format before checking/storing
      let normalizedPhone = phone;
      if (hasPhone) {
        normalizedPhone = otpService.normalizePhoneNumber(phone);
        console.log('Phone normalization:', { original: phone, normalized: normalizedPhone });
        
        // Check if normalized phone number already exists
        const phoneExists = await this.userModel.phoneExists(normalizedPhone);
        if (phoneExists) {
          throw new Error('An account with this phone number already exists');
        }
      }

      console.log('Email and phone validation passed');

      // Hash password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Create user data with normalized phone and email
      const newUserData = {
        firstName,
        lastName,
        emailAddress: hasEmail ? emailAddress.toLowerCase() : '',
        phone: hasPhone ? normalizedPhone : '',
        password: hashedPassword,
        gender: gender,
        Age: Age,
        profileImage: '',
        address: {},
        nextAppointment: null
      };

      // Create user
      const result = await this.userModel.createUser(newUserData);
      
      if (result.insertedId) {
        // Get the created user (without password)
        const user = await this.userModel.getUserById(result.insertedId);
        const { password, ...userWithoutPassword } = user;
        
        // Automatically create medical record for the patient
        try {
          await PatientMedicalRecordModel.createMedicalRecord(result.insertedId);
          console.log('✅ Medical record created automatically for patient:', result.insertedId);
        } catch (medicalRecordError) {
          console.error('⚠️ Failed to create medical record for patient:', result.insertedId, medicalRecordError);
          // Don't fail the registration if medical record creation fails
          // The user is still created successfully
        }
        
        // Generate JWT token
        const token = this.generateToken(userWithoutPassword);
        
        console.log('User registered successfully:', { userId: user._id, emailAddress });
        
        return {
          success: true,
          user: userWithoutPassword,
          token
        };
      } else {
        throw new Error('Failed to create user');
      }
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  }

  // Login user
  async login(emailAddress, password) {
    try {
      // Find user by email (normalized to lowercase)
      const normalizedEmail = emailAddress.toLowerCase();
      const user = await this.userModel.getUserByEmail(normalizedEmail);
      if (!user) {
        throw new Error('Invalid email or password');
      }

      // Check if user is active
      if (user.isActive !== 'true') {
        throw new Error('Account is deactivated');
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        throw new Error('Invalid email or password');
      }

      // Update last visit
      await this.userModel.updateUser(user._id, { lastVisit: new Date() });

      // Remove password from user object
      const { password: _, ...userWithoutPassword } = user;

      // Generate JWT token
      const token = this.generateToken(userWithoutPassword);

      return {
        success: true,
        user: userWithoutPassword,
        token
      };
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  // Flexible login - supports both email and phone
  async loginFlexible(contact, password, isEmail = false) {
    try {
      let user;
      
      if (isEmail) {
        // Find user by email (normalized to lowercase)
        const normalizedEmail = contact.toLowerCase();
        user = await this.userModel.getUserByEmail(normalizedEmail);
      } else {
        // Normalize phone number before lookup
        const normalizedPhone = otpService.normalizePhoneNumber(contact);
        console.log('Login phone normalization:', { original: contact, normalized: normalizedPhone });
        
        // Find user by normalized phone
        user = await this.userModel.getUserByPhone(normalizedPhone);
      }
      
      if (!user) {
        throw new Error('Invalid credentials');
      }

      // Check if user is active
      if (user.isActive !== 'true') {
        throw new Error('Account is deactivated');
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        throw new Error('Invalid credentials');
      }

      // Update last visit
      await this.userModel.updateUser(user._id, { lastVisit: new Date() });

      // Remove password from user object
      const { password: _, ...userWithoutPassword } = user;

      // Generate JWT token
      const token = this.generateToken(userWithoutPassword);

      return {
        success: true,
        user: userWithoutPassword,
        token
      };
    } catch (error) {
      console.error('Flexible login error:', error);
      throw error;
    }
  }

  // Generate JWT token
  generateToken(user) {
    const payload = {
      userId: user._id,
      emailAddress: user.emailAddress,
      userRole: user.userRole,
      firstName: user.firstName,
      lastName: user.lastName
    };

    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  }

  // Verify JWT token
  verifyToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  // Change password
  async changePassword(userId, currentPassword, newPassword) {
    try {
      console.log('AuthService.changePassword called with:', { userId, currentPassword: '***', newPassword: '***' });
      
      // Get user
      const user = await this.userModel.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      console.log('User found:', { _id: user._id, emailAddress: user.emailAddress });

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isCurrentPasswordValid) {
        throw new Error('Current password is incorrect');
      }

      console.log('Current password verified successfully');

      // Hash new password
      const saltRounds = 12;
      const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);
      
      console.log('New password hashed:', { 
        originalLength: newPassword.length, 
        hashedLength: hashedNewPassword.length,
        hashedPrefix: hashedNewPassword.substring(0, 20) + '...'
      });

      // Update password
      const updateResult = await this.userModel.updatePassword(userId, hashedNewPassword);
      
      console.log('Password update result:', updateResult);

      return { success: true, message: 'Password changed successfully' };
    } catch (error) {
      console.error('Change password error:', error);
      throw error;
    }
  }

  // Reset password (for forgot password functionality)
  async resetPassword(emailAddress, newPassword) {
    try {
      const normalizedEmail = emailAddress.toLowerCase();
      const user = await this.userModel.getUserByEmail(normalizedEmail);
      if (!user) {
        throw new Error('User not found');
      }

      // Hash new password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      // Update password
      await this.userModel.updatePassword(user._id, hashedPassword);

      return { success: true, message: 'Password reset successfully' };
    } catch (error) {
      console.error('Reset password error:', error);
      throw error;
    }
  }

  // Reset password by user ID (for password reset flow)
  async resetPasswordByUserId(userId, newPassword) {
    try {
      console.log('Resetting password for user ID:', userId);

      // Hash the new password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      // Update user password
      const result = await this.userModel.updatePassword(userId, hashedPassword);

      if (!result) {
        throw new Error('User not found');
      }

      console.log('Password reset successfully for user ID:', userId);

      return {
        success: true,
        message: 'Password has been reset successfully'
      };
    } catch (error) {
      console.error('Reset password by user ID error:', error);
      throw error;
    }
  }

  // Update user profile with duplicate checking
  async updateUserProfile(userId, updateData) {
    try {
      console.log('Profile update attempt for user:', userId, 'with data:', updateData);

      // If email is being updated, check if it already exists
      if (updateData.emailAddress) {
        const normalizedEmail = updateData.emailAddress.toLowerCase();
        const emailExists = await this.userModel.emailExists(normalizedEmail);
        if (emailExists) {
          // Check if it's the same user trying to keep their own email
          const currentUser = await this.userModel.getUserById(userId);
          if (currentUser.emailAddress && currentUser.emailAddress.toLowerCase() !== normalizedEmail) {
            throw new Error('An account with this email address already exists');
          }
        }
        // Normalize email before updating
        updateData.emailAddress = normalizedEmail;
      }

      // If phone is being updated, check if it already exists
      if (updateData.phone) {
        const phoneExists = await this.userModel.phoneExists(updateData.phone);
        if (phoneExists) {
          // Check if it's the same user trying to keep their own phone
          const currentUser = await this.userModel.getUserById(userId);
          if (currentUser.phone !== updateData.phone) {
            throw new Error('An account with this phone number already exists');
          }
        }
      }

      // Update the user
      const result = await this.userModel.updateUser(userId, updateData);
      
      if (result.modifiedCount > 0) {
        console.log('Profile updated successfully for user:', userId);
        return { success: true, message: 'Profile updated successfully' };
      } else {
        throw new Error('Failed to update profile');
      }
    } catch (error) {
      console.error('Profile update error:', error);
      throw error;
    }
  }
}

module.exports = new AuthService();
