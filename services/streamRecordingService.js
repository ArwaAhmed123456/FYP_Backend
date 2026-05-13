/**
 * Stream.io Server-Side Recording Service
 * Handles call recording via Stream's REST API
 */

const axios = require('axios');

// Stream Video configuration
const STREAM_API_KEY = '9b9umg6sdvd7';
const STREAM_SECRET = 'eqhe4nxc4h66w4prhw2vn923k3cwy84ydjjdcza7svb9mbu6eq87fpu9rznvq6kc';
// Stream.io Video REST API base URL
const STREAM_BASE_URL = 'https://video.stream-io-api.com/v1';

/**
 * Get authentication headers for Stream API
 */
function getAuthHeaders() {
  const credentials = Buffer.from(`${STREAM_API_KEY}:${STREAM_SECRET}`).toString('base64');
  return {
    'Authorization': `Basic ${credentials}`,
    'Content-Type': 'application/json'
  };
}

/**
 * Start recording for a call
 * @param {string} callId - The Stream call ID (meetingRoomId)
 * @param {string} callType - The call type (default: 'default')
 * @returns {Promise<{success: boolean, recordingId?: string, error?: string}>}
 */
async function startRecording(callId, callType = 'default') {
  try {
    console.log(`🎬 Starting recording for call: ${callId} (type: ${callType})`);
    
    // Stream.io Video API: Start recording via call record endpoint
    // Format: POST /v1/calls/{type}/{id}/record
    const response = await axios.post(
      `${STREAM_BASE_URL}/calls/${callType}/${callId}/record`,
      {
        start_recording: true
      },
      {
        headers: getAuthHeaders(),
        timeout: 10000 // 10 second timeout
      }
    );

    console.log('Recording start response:', response.data);

    if (response.data && response.data.recording) {
      console.log(`✅ Recording started: ${response.data.recording.id || 'success'}`);
      return {
        success: true,
        recordingId: response.data.recording.id || response.data.recording_id || null
      };
    }

    // If response is successful but no recording object, still return success
    if (response.status === 200 || response.status === 201) {
      return {
        success: true,
        recordingId: null
      };
    }

    return {
      success: false,
      error: 'Unexpected response format'
    };
  } catch (error) {
    const errorMsg = error.response?.data?.detail || error.response?.data?.message || error.message;
    console.error('❌ Error starting recording:', errorMsg);
    console.error('Full error:', error.response?.data || error);
    return {
      success: false,
      error: errorMsg || 'Failed to start recording'
    };
  }
}

/**
 * Stop recording for a call
 * @param {string} callId - The Stream call ID (meetingRoomId)
 * @param {string} callType - The call type (default: 'default')
 * @returns {Promise<{success: boolean, recording?: object, error?: string}>}
 */
async function stopRecording(callId, callType = 'default') {
  try {
    console.log(`🛑 Stopping recording for call: ${callId} (type: ${callType})`);
    
    // Stream.io Video API: Stop recording via call record endpoint
    const response = await axios.post(
      `${STREAM_BASE_URL}/calls/${callType}/${callId}/record`,
      {
        stop_recording: true
      },
      {
        headers: getAuthHeaders(),
        timeout: 10000
      }
    );

    console.log('Recording stop response:', response.data);

    if (response.data && response.data.recording) {
      console.log(`✅ Recording stopped: ${response.data.recording.id || 'success'}`);
      return {
        success: true,
        recording: response.data.recording
      };
    }

    // If response is successful, return success
    if (response.status === 200 || response.status === 201) {
      return {
        success: true,
        recording: response.data || null
      };
    }

    return {
      success: false,
      error: 'Unexpected response format'
    };
  } catch (error) {
    const errorMsg = error.response?.data?.detail || error.response?.data?.message || error.message;
    console.error('❌ Error stopping recording:', errorMsg);
    console.error('Full error:', error.response?.data || error);
    return {
      success: false,
      error: errorMsg || 'Failed to stop recording'
    };
  }
}

/**
 * Get recording details for a call
 * @param {string} callId - The Stream call ID (meetingRoomId)
 * @param {string} callType - The call type (default: 'default')
 * @returns {Promise<{success: boolean, recordings?: array, error?: string}>}
 */
async function getRecordings(callId, callType = 'default') {
  try {
    console.log(`📹 Getting recordings for call: ${callId} (type: ${callType})`);
    
    // Stream.io Video API: Get recordings for a call
    // Format: GET /v1/calls/{type}/{id}/recordings
    const response = await axios.get(
      `${STREAM_BASE_URL}/calls/${callType}/${callId}/recordings`,
      {
        headers: getAuthHeaders(),
        timeout: 10000
      }
    );

    console.log('Recordings response:', response.data);

    if (response.data) {
      // Stream.io may return recordings in different formats
      const recordings = response.data.recordings || response.data.recording || 
                        (Array.isArray(response.data) ? response.data : []);
      
      if (recordings.length > 0) {
        console.log(`✅ Found ${recordings.length} recording(s)`);
        return {
          success: true,
          recordings: Array.isArray(recordings) ? recordings : [recordings]
        };
      }
    }

    return {
      success: true,
      recordings: []
    };
  } catch (error) {
    const errorMsg = error.response?.data?.detail || error.response?.data?.message || error.message;
    console.error('❌ Error getting recordings:', errorMsg);
    console.error('Full error:', error.response?.data || error);
    
    // If 404, recording might not exist yet (not an error)
    if (error.response?.status === 404) {
      return {
        success: true,
        recordings: []
      };
    }
    
    return {
      success: false,
      error: errorMsg || 'Failed to get recordings'
    };
  }
}

/**
 * Wait for recording to be ready and get URLs
 * Polls the recordings endpoint until recording is available
 * @param {string} callId - The Stream call ID (meetingRoomId)
 * @param {number} maxAttempts - Maximum polling attempts (default: 30)
 * @param {number} intervalMs - Polling interval in milliseconds (default: 2000)
 * @returns {Promise<{success: boolean, audioUrl?: string, videoUrl?: string, error?: string}>}
 */
async function waitForRecordingUrls(callId, maxAttempts = 30, intervalMs = 2000) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await getRecordings(callId);
      
      if (result.success && result.recordings && result.recordings.length > 0) {
        // Get the most recent recording
        const recording = result.recordings[0];
        
        // Check if recording is ready (has URLs)
        // Stream.io recordings can have status: 'ready', 'in_progress', 'failed'
        const isReady = recording.status === 'ready' || recording.status === 'completed' || 
                       recording.url || recording.file || recording.download_url;
        
        if (isReady) {
          // Extract audio and video URLs
          let audioUrl = null;
          let videoUrl = null;
          
          // Stream recordings may have different formats
          // Check for direct URL
          const recordingUrl = recording.url || recording.file || recording.download_url || 
                              recording.hls_url || recording.mp4_url;
          
          if (recordingUrl) {
            // Determine type based on mime_type or file extension
            const mimeType = recording.mime_type || recording.content_type || '';
            const urlLower = recordingUrl.toLowerCase();
            
            if (mimeType.includes('audio') || urlLower.includes('.mp3') || urlLower.includes('.m4a')) {
              audioUrl = recordingUrl;
            } else {
              // Default to video for most cases
              videoUrl = recordingUrl;
            }
          }
          
          // Check for separate audio/video tracks or files
          if (recording.tracks && Array.isArray(recording.tracks)) {
            recording.tracks.forEach(track => {
              const trackUrl = track.url || track.file || track.download_url;
              if (trackUrl) {
                if (track.type === 'audio' || track.mime_type?.includes('audio')) {
                  audioUrl = trackUrl;
                } else if (track.type === 'video' || track.mime_type?.includes('video')) {
                  videoUrl = trackUrl;
                }
              }
            });
          }
          
          // Check for files array
          if (recording.files && Array.isArray(recording.files)) {
            recording.files.forEach(file => {
              const fileUrl = file.url || file.download_url;
              if (fileUrl) {
                if (file.type === 'audio' || file.mime_type?.includes('audio')) {
                  audioUrl = fileUrl;
                } else {
                  videoUrl = fileUrl;
                }
              }
            });
          }
          
          // If we have at least one URL, return success
          if (audioUrl || videoUrl) {
            console.log(`✅ Recording URLs ready: audio=${!!audioUrl}, video=${!!videoUrl}`);
            return {
              success: true,
              audioUrl,
              videoUrl
            };
          }
        }
      }
      
      // Wait before next attempt
      if (attempt < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
    } catch (error) {
      console.error(`Error polling for recording (attempt ${attempt + 1}):`, error.message);
    }
  }
  
  return {
    success: false,
    error: 'Recording URLs not available after maximum attempts'
  };
}

module.exports = {
  startRecording,
  stopRecording,
  getRecordings,
  waitForRecordingUrls
};

