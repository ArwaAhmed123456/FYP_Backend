// routes/PasswordResetRoutes.js
const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const transporter = require("../config/emailTransporter");
const Doctor = require("../models/DoctorModel");
const Doctor_PasswordResetToken = require("../models/DoctorPasswordResetModel");

const router = express.Router();

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const doctor = await Doctor.findOne({ email: email.toLowerCase() });
    if (!doctor) return res.status(404).json({ message: "Email not found" });

    await Doctor_PasswordResetToken.deleteMany({ doctorId: doctor._id });

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");

    await Doctor_PasswordResetToken.create({
      doctorId: doctor._id,
      email: doctor.email,
      resetToken: resetTokenHash,
      expiresAt: Date.now() + 3600000, // 1 hour
    });

    const webFallbackUrl = `${process.env.WEB_URL || "https://myapp.com"}/reset-password?token=${resetToken}`;
    const expDeepLink = `exp://${process.env.LOCAL_IP || "192.168.100.12"}:8081/--/reset-password?token=${resetToken}`;

    console.log("✅ Reset URLs:");
    console.log("Deep link:", expDeepLink);
    console.log("Web fallback:", webFallbackUrl);

    await transporter.sendMail({
      from: `"Tabeeb App" <${process.env.EMAIL_USER}>`,
      to: doctor.email,
      subject: "Password Reset Request",
      html: `
        <div style="font-family: Arial, sans-serif; max-width:600px; margin:0 auto; padding:20px;">
          <h2>Password Reset Request</h2>
          <p>Hello ${doctor.DoctorName},</p>
          <p>Click the button below to reset your password:</p>
          <div style="text-align:center; margin:20px 0;">
            <a href="${webFallbackUrl}" 
               style="display:inline-block; background:#4A90E2; color:#fff; padding:14px 30px;
                      border-radius:5px; text-decoration:none; font-weight:bold; font-size:16px;">
              Reset Password
            </a>
          </div>
          <p>If the button does not work, copy this link into your browser:</p>
          <p style="word-break: break-all;">${webFallbackUrl}</p>
          <p>This link expires in 1 hour.</p>
        </div>
      `,
    });

    res.status(200).json({ message: "Password reset link sent successfully" });
  } catch (err) {
    console.error("❌ Forgot Password Error:", err);
    res.status(500).json({ message: "Failed to send password reset email" });
  }
});

// RESET PASSWORD
router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) return res.status(400).json({ message: "Token and new password are required" });
    if (newPassword.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });

    const resetTokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const tokenDoc = await Doctor_PasswordResetToken.findOne({
      resetToken: resetTokenHash,
      expiresAt: { $gt: Date.now() },
      isUsed: false,
    });

    if (!tokenDoc) return res.status(400).json({ message: "Invalid or expired reset token" });

    const doctor = await Doctor.findById(tokenDoc.doctorId);
    if (!doctor) return res.status(404).json({ message: "Doctor not found" });

    doctor.password = await bcrypt.hash(newPassword, 10);
    await doctor.save();

    tokenDoc.isUsed = true;
    await tokenDoc.save();

    res.status(200).json({ message: "Password reset successful" });
  } catch (err) {
    console.error("❌ Reset Password Error:", err);
    res.status(500).json({ message: "Failed to reset password" });
  }
});

module.exports = router;

