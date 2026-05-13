// routes/emailOTPRoute.js
const express = require("express");
const crypto = require("crypto");
const EmailOTP = require("../models/DoctorEmailOTPModel");
const Doctor = require("../models/DoctorModel");
const { sendOTPEmail, transporter } = require("../services/emailService");

const router = express.Router();

// Helper function to generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Helper function to generate verification token
const generateToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

// POST: Send OTP to current email
router.post("/send", async (req, res) => {
  try {
    const { doctorId, email } = req.body;

    if (!doctorId || !email) {
      return res.status(400).json({
        success: false,
        message: "Doctor ID and email are required",
      });
    }

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: "Doctor not found",
      });
    }

    if (doctor.email.toLowerCase() !== email.toLowerCase()) {
      return res.status(400).json({
        success: false,
        message: "Email does not match account email",
      });
    }

    const recentOTP = await EmailOTP.findOne({
      doctorId,
      createdAt: { $gte: new Date(Date.now() - 60000) },
    });

    if (recentOTP) {
      return res.status(429).json({
        success: false,
        message: "Please wait before requesting another OTP",
      });
    }

    const otpCode = generateOTP();
    const verificationToken = generateToken();

    await EmailOTP.deleteMany({ doctorId, isVerified: false });

    const otpRecord = new EmailOTP({
      doctorId,
      email: doctor.email,
      newEmail: doctor.email,
      otpCode,
      verificationToken,
    });

    await otpRecord.save();

    await sendOTPEmail(doctor.email, otpCode, doctor.DoctorName);

    res.status(200).json({
      success: true,
      message: "OTP sent successfully",
      verificationToken,
    });
  } catch (error) {
    console.error("Send OTP Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send OTP",
      error: error.message,
    });
  }
});

// POST: Verify OTP and update email
router.post("/verify-and-update", async (req, res) => {
  try {
    const { doctorId, otpCode, otpToken, newEmail } = req.body;

    if (!doctorId || !otpCode || !otpToken || !newEmail) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    const otpRecord = await EmailOTP.findOne({
      doctorId,
      verificationToken: otpToken,
      isVerified: false,
    });

    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired verification session",
      });
    }

    if (otpRecord.expiresAt < new Date()) {
      await EmailOTP.deleteOne({ _id: otpRecord._id });
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new one.",
      });
    }

    if (otpRecord.attempts >= 5) {
      await EmailOTP.deleteOne({ _id: otpRecord._id });
      return res.status(400).json({
        success: false,
        message: "Maximum verification attempts exceeded. Please request a new OTP.",
      });
    }

    if (otpRecord.otpCode !== otpCode) {
      otpRecord.attempts += 1;
      await otpRecord.save();

      return res.status(400).json({
        success: false,
        message: `Invalid OTP. ${5 - otpRecord.attempts} attempts remaining.`,
      });
    }

    const existingDoctor = await Doctor.findOne({
      email: newEmail.toLowerCase(),
      _id: { $ne: doctorId },
    });

    if (existingDoctor) {
      return res.status(400).json({
        success: false,
        message: "This email is already registered to another account",
      });
    }

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: "Doctor not found",
      });
    }

    const oldEmail = doctor.email;
    doctor.email = newEmail.toLowerCase();
    await doctor.save();

    otpRecord.isVerified = true;
    otpRecord.newEmail = newEmail.toLowerCase();
    await otpRecord.save();

    try {
      const confirmationMailOptions = {
        from: {
          name: "Tabeeb App",
          address: process.env.EMAIL_USER,
        },
        to: newEmail,
        subject: "Email Successfully Updated",
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2>Email Update Confirmation</h2>
            <p>Hello ${doctor.DoctorName},</p>
            <p>Your email has been successfully updated from <strong>${oldEmail}</strong> to <strong>${newEmail}</strong>.</p>
            <p>If you did not make this change, please contact support immediately.</p>
            <br>
            <p>Best regards,<br>Tabeeb App Team</p>
          </div>
        `,
      };

      await transporter.sendMail(confirmationMailOptions);
    } catch (emailError) {
      console.error("Confirmation email error:", emailError);
    }

    res.status(200).json({
      success: true,
      message: "Email updated successfully",
      newEmail: doctor.email,
    });
  } catch (error) {
    console.error("Verify OTP Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify OTP",
      error: error.message,
    });
  }
});

// GET: Check OTP status
router.get("/status/:doctorId", async (req, res) => {
  try {
    const { doctorId } = req.params;

    const pendingOTP = await EmailOTP.findOne({
      doctorId,
      isVerified: false,
      expiresAt: { $gte: new Date() },
    });

    res.status(200).json({
      success: true,
      hasPendingOTP: !!pendingOTP,
      expiresAt: pendingOTP?.expiresAt,
    });
  } catch (error) {
    console.error("Check OTP Status Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check OTP status",
    });
  }
});

module.exports = router;

