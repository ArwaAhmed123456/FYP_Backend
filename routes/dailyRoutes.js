/**
 * Daily.co Routes
 * Handles Daily.co meeting token generation
 */

const express = require('express');
const router = express.Router();

// Daily.co Configuration
const DAILY_API_KEY = process.env.DAILY_API_KEY || "4189e7825f3966f6baeac18cc1132490d60ef61a1168649704f890bd0c7b43bd";
const DAILY_API_BASE_URL = "https://api.daily.co/v1";

/**
 * POST /api/daily/session
 * Generate Daily.co meeting token and ensure room exists
 * 
 * Request body:
 * {
 *   "roomName": "tabeeb25",  // Optional
 *   "userId": "user123",      // Optional
 *   "userName": "John Doe"    // Optional
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
 *   "roomName": "sanitized-room-name",
 *   "roomUrl": "https://tabeeb25.daily.co/sanitized-room-name"
 * }
 */
/**
 * Sanitize room name for Daily.co
 * Daily.co room names must be:
 * - Lowercase letters, numbers, hyphens, and underscores only
 * - Max 250 characters
 * - No spaces or special characters
 */
function sanitizeRoomName(roomName) {
  if (!roomName) return 'tabeeb25';
  
  // Convert to lowercase
  let sanitized = roomName.toLowerCase();
  
  // Replace spaces and invalid characters with hyphens
  // Keep only: lowercase letters, numbers, hyphens, and underscores
  sanitized = sanitized.replace(/[^a-z0-9_-]/g, '-');
  
  // Remove consecutive hyphens and underscores
  sanitized = sanitized.replace(/-+/g, '-');
  sanitized = sanitized.replace(/_+/g, '_');
  
  // Remove leading/trailing hyphens and underscores
  sanitized = sanitized.replace(/^[-_]+|[-_]+$/g, '');
  
  // Limit length to 250 characters (Daily.co limit)
  if (sanitized.length > 250) {
    sanitized = sanitized.substring(0, 250);
  }
  
  // Ensure it's not empty
  if (!sanitized || sanitized.length === 0) {
    sanitized = 'tabeeb25';
  }
  
  console.log('🔄 [DAILY] Room name sanitization:', {
    original: roomName,
    sanitized: sanitized,
    length: sanitized.length
  });
  
  return sanitized;
}

/**
 * Helper function to create or get Daily room
 * Daily.co rooms are created on-demand (ephemeral) - they exist as long as someone is in them
 * But we should ensure the room exists before generating tokens
 */
async function ensureDailyRoomExists(roomName) {
  try {
    const sanitizedRoomName = sanitizeRoomName(roomName);
    
    // Check if room exists
    const getRoomResponse = await fetch(`${DAILY_API_BASE_URL}/rooms/${encodeURIComponent(sanitizedRoomName)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${DAILY_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (getRoomResponse.ok) {
      const roomData = await getRoomResponse.json();
      console.log('✅ [DAILY] Room already exists:', sanitizedRoomName);
      
      // If room is private but doesn't allow token join, update it
      if (roomData.config && roomData.config.privacy === 'private') {
        // Room exists and is private - tokens should work if they have is_owner: true
        console.log('🔒 [DAILY] Room is private, ensuring token has proper permissions');
      }
      
      return { room: roomData, sanitizedName: sanitizedRoomName };
    }

    // Room doesn't exist, create it
    if (getRoomResponse.status === 404) {
      console.log('🔄 [DAILY] Room does not exist, creating:', sanitizedRoomName);
      
      const createRoomResponse = await fetch(`${DAILY_API_BASE_URL}/rooms`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${DAILY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: sanitizedRoomName,
          privacy: 'public', // Public: anyone with the link can join
          properties: {
            // Prejoin UI: Off
            enable_prejoin_ui: false,
            // Knocking: Disabled for public rooms
            enable_knocking: false,
            // Cameras on start: On (false means cameras will be on)
            start_video_off: false,
            // Microphones on start: On (false means microphones will be on)
            start_audio_off: false,
            // Screen sharing: On
            enable_screenshare: true,
            // Text chat: Basic text chat
            enable_chat: true,
            // Recording: Off
            enable_recording: false,
            // Room expiry: 24 hours
            exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60),
            // Note: Some UI settings (People UI, Background effects, Noise cancellation UI, etc.)
            // are controlled via Daily Prebuilt UI parameters, not room properties
          }
        }),
      });

      if (!createRoomResponse.ok) {
        const errorText = await createRoomResponse.text();
        console.error('❌ [DAILY] Failed to create room:', {
          status: createRoomResponse.status,
          error: errorText,
          roomName: sanitizedRoomName
        });
        // Don't throw - Daily.co can create rooms on-demand when joining
        console.warn('⚠️ [DAILY] Room creation failed, but Daily will create on join');
        return { room: null, sanitizedName: sanitizedRoomName };
      }

      const roomData = await createRoomResponse.json();
      console.log('✅ [DAILY] Room created successfully:', sanitizedRoomName);
      return { room: roomData, sanitizedName: sanitizedRoomName };
    }

    // Other error - log but don't fail
    const errorText = await getRoomResponse.text();
    console.warn('⚠️ [DAILY] Error checking room (will create on join):', {
      status: getRoomResponse.status,
      error: errorText
    });
    return { room: null, sanitizedName: sanitizedRoomName };
  } catch (error) {
    console.error('❌ [DAILY] Error ensuring room exists:', error);
    // For Daily.co, rooms are ephemeral and created on-demand
    // If creation fails, we can still try to generate a token
    // Daily will create the room when first person joins
    console.warn('⚠️ [DAILY] Continuing without explicit room creation - Daily will create on join');
    return { room: null, sanitizedName: sanitizeRoomName(roomName) };
  }
}

router.post('/session', async (req, res) => {
  try {
    const { roomName, userId, userName } = req.body;
    
    console.log('📞 [DAILY] Generating meeting token:', {
      roomName: roomName || 'default',
      userId: userId || 'anonymous',
      userName: userName || 'User'
    });

    // Default room name if not provided
    const originalRoomName = roomName || 'tabeeb25';
    
    // Sanitize and ensure room exists (create if needed)
    // Note: Daily.co creates rooms on-demand, but we ensure it exists for better UX
    const roomResult = await ensureDailyRoomExists(originalRoomName);
    const targetRoomName = roomResult.sanitizedName;
    
    console.log('📞 [DAILY] Using room name:', {
      original: originalRoomName,
      sanitized: targetRoomName
    });
    
    // Prepare token properties
    // For private rooms, tokens need proper permissions
    const tokenProperties = {
      room_name: targetRoomName,
      exp: Math.floor(Date.now() / 1000) + (60 * 60), // 1 hour expiry
      // Grant full permissions for joining private rooms
      is_owner: true, // Allow user to join and manage the room
      enable_screenshare: true,
      enable_recording: false, // Disable recording by default
    };

    // Add user info if provided
    if (userId) {
      tokenProperties.user_id = userId;
    }
    if (userName) {
      tokenProperties.user_name = userName;
    }
    
    console.log('🔑 [DAILY] Token properties:', {
      room_name: tokenProperties.room_name,
      is_owner: tokenProperties.is_owner,
      user_id: tokenProperties.user_id,
      user_name: tokenProperties.user_name
    });

    // Generate Daily meeting token via Daily API
    const dailyResponse = await fetch(`${DAILY_API_BASE_URL}/meeting-tokens`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DAILY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: tokenProperties,
      }),
    });

    if (!dailyResponse.ok) {
      const errorText = await dailyResponse.text();
      console.error('❌ [DAILY] API error:', {
        status: dailyResponse.status,
        statusText: dailyResponse.statusText,
        error: errorText
      });
      
      throw new Error(`Daily API error: ${dailyResponse.status} ${dailyResponse.statusText} - ${errorText}`);
    }

    const dailyData = await dailyResponse.json();
    
    if (!dailyData.token) {
      console.error('❌ [DAILY] No token in response:', dailyData);
      throw new Error('Daily API did not return a token');
    }

    console.log('✅ [DAILY] Token generated successfully for room:', targetRoomName);

    res.json({
      success: true,
      token: dailyData.token,
      roomName: targetRoomName,
      roomUrl: `https://tabeeb25.daily.co/${targetRoomName}`,
    });
  } catch (error) {
    console.error('❌ [DAILY] Error generating token:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate meeting token',
      message: error.message,
    });
  }
});

/**
 * GET /api/daily/health
 * Health check endpoint for Daily.co integration
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'Daily.co Token Service',
    apiKeyConfigured: !!DAILY_API_KEY,
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;

