// routes/docAuthRoute.js
const express = require('express');
const { loginDoctor } = require('../controller/doctorAuthController');
const Doctor = require('../models/DoctorModel');

const router = express.Router();

// Login route
router.post('/login', loginDoctor);

// Get doctor by ID (for profile fetch)
router.get('/:id', async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });
    res.json(doctor);
  } catch (err) {
    console.error('Error fetching doctor:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update doctor profile
router.put('/:id', async (req, res) => {
  try {
    const doctor = await Doctor.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });
    res.json(doctor);
  } catch (err) {
    console.error('Error updating doctor:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

