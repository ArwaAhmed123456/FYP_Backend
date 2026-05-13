// services/emailService.js
const nodemailer = require('nodemailer');
require('dotenv').config({ path: '../../.env' });

// Create transporter for Gmail using App Password
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// Send OTP Email function
const sendOTPEmail = async (email, otpCode, doctorName) => {
  const mailOptions = {
    from: `"Tabeeb App" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Email Verification Code",
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #4A90E2;">Email Verification</h2>
        <p>Hello ${doctorName || "Doctor"},</p>
        <p>Please use the following OTP code to verify your email:</p>
        <div style="background: #f1f1f1; padding: 15px; font-size: 24px; font-weight: bold; letter-spacing: 4px; text-align: center;">
          ${otpCode}
        </div>
        <p>This code will expire in 10 minutes.</p>
        <p>If you didn't request this, please ignore this email.</p>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Email sent successfully:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Email sending failed:", error);
    throw new Error("Failed to send email");
  }
};

// Send Invoice Email function
const sendInvoiceEmail = async (email, patientName, invoiceData, pdfBuffer) => {
  const mailOptions = {
    from: `"Tabeeb App" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `Invoice for Appointment - ${invoiceData.paymentIntentId}`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
        <div style="background: #D4EAFF; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h2 style="color: #474747; margin: 0;">TABEEB</h2>
          <p style="color: #616161; margin: 5px 0 0 0;">Medical Appointment Invoice</p>
        </div>
        
        <p>Hello ${patientName || 'Patient'},</p>
        
        <p>Thank you for your appointment with <strong>${invoiceData.doctorName || 'Doctor'}</strong>.</p>
        
        <div style="background: #F9FAFB; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #212121; margin-top: 0;">Invoice Details</h3>
          <p style="margin: 5px 0;"><strong>Invoice #:</strong> ${invoiceData.paymentIntentId}</p>
          <p style="margin: 5px 0;"><strong>Date:</strong> ${new Date(invoiceData.createdAt).toLocaleDateString()}</p>
          <p style="margin: 5px 0;"><strong>Amount:</strong> $${invoiceData.amount.toFixed(2)}</p>
          <p style="margin: 5px 0;"><strong>Status:</strong> ${invoiceData.status.toUpperCase()}</p>
        </div>
        
        <p>Please find your invoice attached to this email.</p>
        
        <p>If you have any questions about this invoice, please contact our support team.</p>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #E0E0E0;">
          <p style="color: #616161; font-size: 12px; margin: 0;">
            This is an automated email. Please do not reply to this message.<br>
            For support, please contact us through the Tabeeb app.
          </p>
        </div>
      </div>
    `,
    attachments: [
      {
        filename: `Invoice_${invoiceData.paymentIntentId}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Invoice email sent successfully:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Invoice email sending failed:", error);
    throw new Error("Failed to send invoice email");
  }
};

module.exports = { transporter, sendOTPEmail, sendInvoiceEmail };

