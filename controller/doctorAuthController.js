// controller/doctorAuthController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Doctor = require('../models/DoctorModel');
const PendingDoctor = require('../models/PendingDoctorModel');

const loginDoctor = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: 'Email and password required' });

    // Normalize email to lowercase for case-insensitive matching
    const normalizedEmail = email.toLowerCase();

    // Check in approved doctors
    const doctor = await Doctor.findOne({ email: normalizedEmail });
    if (doctor) {
      const isMatch = await bcrypt.compare(password, doctor.password);
      if (!isMatch)
        return res.status(401).json({ message: 'Invalid credentials' });

      const token = jwt.sign(
        { doctorId: doctor._id, role: 'doctor' },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.status(200).json({
        status: 'approved',
        token,
        doctorData: {
          _id: doctor._id,
          DoctorName: doctor.DoctorName,
          email: doctor.email,
          phone: doctor.phone,
          profileImage: doctor.profileImage,
        },
      });
    }

    // Check in pending doctors
    const pendingDoctor = await PendingDoctor.findOne({ email: normalizedEmail });
    if (pendingDoctor) {
      return res.status(200).json({ status: 'pending' });
    }

    return res.status(404).json({ message: 'Doctor not found. Please register first.' });
  } catch (err) {
    console.error('Doctor login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { loginDoctor };

