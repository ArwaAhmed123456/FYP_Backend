// middleware/authenticateDoctor.js
const jwt = require('jsonwebtoken');

/**
 * Verifies the doctor JWT from the Authorization header.
 * Attaches req.doctor = { doctorId } on success.
 * Returns 401 if the token is missing or invalid.
 * Returns 403 if the token is valid but the role is not 'doctor'.
 */
const authenticateDoctor = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    if (payload.role !== 'doctor') {
      return res.status(403).json({ success: false, message: 'Forbidden: doctor access only' });
    }

    req.doctor = { doctorId: payload.doctorId };
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

module.exports = authenticateDoctor;
