const express = require('express');
const router = express.Router();
const healthTipsService = require('../services/healthTipsService');
const HealthTipModel = require('../models/HealthTipModel');

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
    const authService = require('../services/auth');
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

// ==================== HEALTH TIPS ROUTES ====================

// Get health tip of the day (public endpoint - no authentication required)
router.get('/tip-of-the-day', async (req, res) => {
  try {
    const { lang, language } = req.query;
    const requestedLanguage = lang || language || 'en';
    
    const tip = await healthTipsService.getHealthTipOfTheDay(requestedLanguage);
    
    if (!tip || !tip.success) {
      return res.status(404).json({
        success: false,
        message: 'No health tips available'
      });
    }

    res.json({
      success: true,
      data: tip.data
    });
  } catch (error) {
    console.error('Get health tip of the day error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get health tip of the day'
    });
  }
});

// Get health tips by category
router.get('/category/:category', authenticateToken, async (req, res) => {
  try {
    const { category } = req.params;
    const { limit = 10 } = req.query;
    
    const tips = await healthTipsService.getHealthTipsByCategory(category, parseInt(limit));
    
    res.json({
      success: true,
      data: tips
    });
  } catch (error) {
    console.error('Get health tips by category error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get health tips by category'
    });
  }
});

// Get all health tips with pagination
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { skip = 0, limit = 50 } = req.query;
    
    const tips = await HealthTipModel.getAllHealthTips(parseInt(skip), parseInt(limit));
    const totalCount = await HealthTipModel.getHealthTipsCount();
    
    res.json({
      success: true,
      data: {
        tips,
        totalCount,
        skip: parseInt(skip),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get all health tips error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get health tips'
    });
  }
});

// Search health tips
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;
    
    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters long'
      });
    }
    
    const tips = await HealthTipModel.searchHealthTips(q.trim(), parseInt(limit));
    
    res.json({
      success: true,
      data: tips
    });
  } catch (error) {
    console.error('Search health tips error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search health tips'
    });
  }
});

// Get available categories
router.get('/categories', authenticateToken, async (req, res) => {
  try {
    const categories = [
      'hydration',
      'heat_safety',
      'sun_protection',
      'nutrition',
      'hygiene',
      'vulnerable_groups',
      'work_safety',
      'general'
    ];
    
    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get categories'
    });
  }
});

// ==================== ADMIN ROUTES ====================

// Generate and store health tips (admin only)
router.post('/generate', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin (you can implement your own admin check)
    if (req.user.userRole !== 'Admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    
    console.log('Starting health tips generation...');
    const result = await healthTipsService.generateAndStoreHealthTips();
    
    res.json({
      success: true,
      message: `Successfully generated and stored ${result.insertedCount} health tips`,
      data: result
    });
  } catch (error) {
    console.error('Generate health tips error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate health tips'
    });
  }
});

// Create a new health tip (admin only)
router.post('/', authenticateToken, async (req, res) => {
  try {
    if (req.user.userRole !== 'Admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    
    const { tip, category, priority } = req.body;
    
    if (!tip || !tip.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Health tip is required'
      });
    }
    
    const result = await HealthTipModel.createHealthTip({
      tip: tip.trim(),
      category: category || 'general',
      priority: priority || 'medium'
    });
    
    res.status(201).json({
      success: true,
      message: 'Health tip created successfully',
      data: result
    });
  } catch (error) {
    console.error('Create health tip error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create health tip'
    });
  }
});

// Update health tip (admin only)
router.put('/:tipId', authenticateToken, async (req, res) => {
  try {
    if (req.user.userRole !== 'Admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    
    const { tipId } = req.params;
    const { tip, category, priority, isActive } = req.body;
    
    const updateData = {};
    if (tip) updateData.tip = tip.trim();
    if (category) updateData.category = category;
    if (priority) updateData.priority = priority;
    if (isActive !== undefined) updateData.isActive = isActive;
    
    const result = await HealthTipModel.updateHealthTip(tipId, updateData);
    
    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Health tip not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Health tip updated successfully',
      data: result
    });
  } catch (error) {
    console.error('Update health tip error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update health tip'
    });
  }
});

// Delete health tip (admin only)
router.delete('/:tipId', authenticateToken, async (req, res) => {
  try {
    if (req.user.userRole !== 'Admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    
    const { tipId } = req.params;
    
    const result = await HealthTipModel.deleteHealthTip(tipId);
    
    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Health tip not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Health tip deleted successfully',
      data: result
    });
  } catch (error) {
    console.error('Delete health tip error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete health tip'
    });
  }
});

module.exports = router;
