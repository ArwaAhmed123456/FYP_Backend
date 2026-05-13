const fs = require('fs');
const path = require('path');

// Cache for CSV data
let csvDataCache = null;
let csvDataLoadTime = null;
const CSV_FILE_PATH = path.join(__dirname, '../../merged_all_health_facilities.csv');

/**
 * Load and parse CSV file
 * @returns {Array} Array of location objects
 */
function loadCSVData() {
  try {
    console.log('📂 CSV Lookup: Loading CSV file from:', CSV_FILE_PATH);
    
    if (!fs.existsSync(CSV_FILE_PATH)) {
      console.log('⚠️ CSV Lookup: CSV file not found at:', CSV_FILE_PATH);
      return [];
    }
    
    const fileContent = fs.readFileSync(CSV_FILE_PATH, 'utf-8');
    const lines = fileContent.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      console.log('⚠️ CSV Lookup: CSV file is empty or has no data rows');
      return [];
    }
    
    // Parse header
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    
    // Parse data rows
    const data = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      // Handle CSV parsing with quoted fields
      const values = parseCSVLine(line);
      
      if (values.length === headers.length) {
        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });
        
        // Only add rows that have at least a name
        if (row.name && row.name.trim()) {
          // Clean up "nan" values
          Object.keys(row).forEach(key => {
            if (row[key] && (row[key].toLowerCase() === 'nan' || row[key].trim() === '')) {
              row[key] = '';
            }
          });
          data.push(row);
        }
      }
    }
    
    console.log(`✅ CSV Lookup: Loaded ${data.length} locations from CSV`);
    return data;
  } catch (error) {
    console.error('❌ CSV Lookup: Error loading CSV file:', error.message);
    return [];
  }
}

/**
 * Parse a CSV line handling quoted fields
 * @param {string} line - CSV line to parse
 * @returns {Array} Array of field values
 */
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  // Add the last field
  values.push(current.trim());
  
  return values;
}

/**
 * Get cached CSV data, loading if necessary
 * @returns {Array} Array of location objects
 */
function getCachedCSVData() {
  // Load on first access or if cache is empty
  if (csvDataCache === null) {
    csvDataCache = loadCSVData();
    csvDataLoadTime = Date.now();
    console.log('📂 CSV Lookup: CSV data loaded and cached');
  }
  
  return csvDataCache;
}

/**
 * Normalize string for comparison (lowercase, trim, remove extra spaces)
 * @param {string} str - String to normalize
 * @returns {string} Normalized string
 */
function normalizeString(str) {
  if (!str) return '';
  return str.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Calculate similarity between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Similarity score (0-1)
 */
function calculateSimilarity(str1, str2) {
  const normalized1 = normalizeString(str1);
  const normalized2 = normalizeString(str2);
  
  // Exact match
  if (normalized1 === normalized2) return 1.0;
  
  // Check if one contains the other
  if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
    return 0.8;
  }
  
  // Word-based similarity
  const words1 = normalized1.split(/\s+/);
  const words2 = normalized2.split(/\s+/);
  
  let matches = 0;
  for (const word1 of words1) {
    for (const word2 of words2) {
      if (word1 === word2 || word1.includes(word2) || word2.includes(word1)) {
        matches++;
        break;
      }
    }
  }
  
  return matches / Math.max(words1.length, words2.length);
}

/**
 * Lookup location in CSV by name (case-insensitive)
 * @param {string} locationName - Name of the location to search for
 * @returns {Object|null} Location data from CSV or null if not found
 */
function lookupLocationInCSV(locationName) {
  if (!locationName || !locationName.trim()) {
    return null;
  }
  
  const csvData = getCachedCSVData();
  
  if (csvData.length === 0) {
    return null;
  }
  
  const normalizedSearchName = normalizeString(locationName);
  
  // First try exact match (case-insensitive)
  let bestMatch = null;
  let bestScore = 0;
  
  for (const row of csvData) {
    const rowName = row.name || '';
    const normalizedRowName = normalizeString(rowName);
    
    // Exact match
    if (normalizedRowName === normalizedSearchName) {
      console.log(`✅ CSV Lookup: Exact match found for "${locationName}"`);
      return row;
    }
    
    // Calculate similarity
    const similarity = calculateSimilarity(locationName, rowName);
    
    if (similarity > bestScore && similarity >= 0.6) {
      bestScore = similarity;
      bestMatch = row;
    }
  }
  
  if (bestMatch) {
    console.log(`✅ CSV Lookup: Similar match found for "${locationName}" (similarity: ${bestScore.toFixed(2)})`);
    return bestMatch;
  }
  
  console.log(`⚠️ CSV Lookup: No match found for "${locationName}"`);
  return null;
}

/**
 * Lookup location in CSV by coordinates (within a small radius)
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {number} radiusMeters - Search radius in meters (default: 100)
 * @returns {Object|null} Location data from CSV or null if not found
 */
function lookupLocationByCoordinates(lat, lon, radiusMeters = 100) {
  if (!lat || !lon || isNaN(lat) || isNaN(lon)) {
    return null;
  }
  
  const csvData = getCachedCSVData();
  
  if (csvData.length === 0) {
    return null;
  }
  
  // Helper function to calculate distance
  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
  
  let closestMatch = null;
  let closestDistance = Infinity;
  
  for (const row of csvData) {
    const rowLat = parseFloat(row.latitude);
    const rowLon = parseFloat(row.longitude);
    
    if (isNaN(rowLat) || isNaN(rowLon)) {
      continue;
    }
    
    const distance = calculateDistance(lat, lon, rowLat, rowLon);
    
    if (distance <= radiusMeters && distance < closestDistance) {
      closestDistance = distance;
      closestMatch = row;
    }
  }
  
  if (closestMatch) {
    console.log(`✅ CSV Lookup: Found location by coordinates (distance: ${closestDistance.toFixed(1)}m)`);
    return closestMatch;
  }
  
  return null;
}

/**
 * Get CSV data statistics
 * @returns {Object} Statistics about the CSV data
 */
function getCSVStats() {
  const csvData = getCachedCSVData();
  
  return {
    totalLocations: csvData.length,
    loadedAt: csvDataLoadTime ? new Date(csvDataLoadTime).toISOString() : null,
    cacheAge: csvDataLoadTime ? Date.now() - csvDataLoadTime : 0,
    filePath: CSV_FILE_PATH
  };
}

/**
 * Clear CSV cache (useful for testing or reloading)
 */
function clearCSVCache() {
  csvDataCache = null;
  csvDataLoadTime = null;
  console.log('📂 CSV Lookup: Cache cleared');
}

module.exports = {
  lookupLocationInCSV,
  lookupLocationByCoordinates,
  getCachedCSVData,
  getCSVStats,
  clearCSVCache,
  loadCSVData
};

