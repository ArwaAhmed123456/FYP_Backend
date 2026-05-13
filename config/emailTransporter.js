// config/emailTransporter.js
const nodemailer = require('nodemailer');
require('dotenv').config({ path: '../../.env' });

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    // Render/render.yaml uses EMAIL_PASS; support both to avoid deploy-time mismatch.
    pass: process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS, // Must be an App Password if using Gmail
  },
});

module.exports = transporter;

