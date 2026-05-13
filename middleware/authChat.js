/**
 * JWT authentication middleware for chat and medical-dictionary routes.
 * Optional: if no token, req.user remains undefined; routes can return 401 when user required.
 */
const authService = require('../services/auth');

/**
 * Authenticate request using Bearer token. Sets req.user = { userId, userRole }.
 * Returns 401 if Authorization header is missing or token invalid.
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Authorization token is required',
    });
  }

  try {
    const decoded = authService.verifyToken(token);
    req.user = {
      userId: decoded.userId || decoded._id,
      userRole: decoded.userRole || 'patient',
    };
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Invalid or expired token',
    });
  }
}

/**
 * Optional auth: set req.user if token present, do not fail if missing.
 * Use for routes that can work with or without auth (e.g. guest sessions).
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = authService.verifyToken(token);
    req.user = {
      userId: decoded.userId || decoded._id,
      userRole: decoded.userRole || 'patient',
    };
    next();
  } catch (err) {
    req.user = null;
    next();
  }
}

module.exports = {
  authenticateToken,
  optionalAuth,
};
