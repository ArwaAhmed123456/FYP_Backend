const axios = require('axios');
const { lookupLocationInCSV, lookupLocationByCoordinates } = require('./csv_location_lookup');

// API Keys from environment variables
const LOCATIONIQ_API_KEY = process.env.LOCATIONIQ_API_KEY || '';
const FOURSQUARE_SERVICE_KEY = process.env.FOURSQUARE_SERVICE_KEY || '';
const MAPBOX_API_KEY = process.env.MAPBOX_API_KEY || '';

// Cache for location details (10 minute TTL)
const detailsCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Helper function for axios get with retry on 429
// Enhanced axios retry function with POST support
const axiosRetry = async (url, headers = {}, retries = 2, method = 'GET', data = null) => {
  for (let i = 0; i <= retries; i++) {
    try {
      if (method === 'POST' && data) {
        const config = {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            ...headers
          }
        };
        return await axios.post(url, data, config);
      } else {
        return await axios.get(url, { headers });
      }
    } catch (error) {
      if (error.response?.status === 429 && i < retries) {
        console.log('Rate limited, retrying in 1 second...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        throw error;
      }
    }
  }
};

// Helper function to calculate distance between two coordinates (in kilometers)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Helper function to determine location type based on display name and type
function getLocationType(displayName, type) {
  const name = displayName.toLowerCase();
  if (name.includes('medical center') || name.includes('medical centre')) {
    return 'Medical Center';
  } else if (name.includes('clinic')) {
    return 'Clinic';
  } else if (name.includes('health center') || name.includes('health centre') || name.includes('healthcare center')) {
    return 'Health Center';
  } else if (name.includes('hospital') || name.includes('medical') || name.includes('health') || name.includes('emergency') || name.includes('care center')) {
    return 'Hospital';
  } else if (name.includes('pharmacy') || name.includes('drugstore') || name.includes('chemist') || name.includes('medical store')) {
    return 'Pharmacy';
  } else if (type) {
    return type.charAt(0).toUpperCase() + type.slice(1);
  } else {
    return 'Unknown';
  }
}

// Helper function to extract proper name from LocationIQ response
function extractName(item) {
  let name = 'Unknown';
  
  if (item.address && item.address.name) {
    name = item.address.name;
  } else if (item.address && (item.address.hospital || item.address.pharmacy || item.address.clinic)) {
    name = item.address.hospital || item.address.pharmacy || item.address.clinic;
  } else if (item.display_name) {
    const displayParts = item.display_name.split(',');
    
    // Try to find a specific hospital/pharmacy name
    const specificNames = item.display_name.match(/([A-Za-z\s.]+(?:Hospital|Medical Center|Medical Centre|Pharmacy|Chemist|Clinic|Health Center|Health Centre|Medical Complex|Healthcare Center))/gi);
    if (specificNames && specificNames.length > 0) {
      name = specificNames[0].trim();
    } else {
      // Look for the first part that's not just generic
      for (let part of displayParts) {
        part = part.trim();
        if (part && part !== 'Hospital' && part !== 'Pharmacy' && part !== 'Medical Center' && part !== 'Medical Centre' && 
            part !== 'Clinic' && part !== 'Health Center' && part !== 'Healthcare Center') {
          name = part;
          break;
        }
      }
    }
    
    // If we still have generic names, try to create a more descriptive name
    if (name === 'Hospital' || name === 'Pharmacy' || name === 'Medical Center' || name === 'Medical Centre' || 
        name === 'Clinic' || name === 'Health Center' || name === 'Healthcare Center') {
      const locationParts = displayParts.slice(1, 3);
      if (locationParts.length > 0) {
        const location = locationParts.join(', ').trim();
        name = `${name} - ${location}`;
      }
    }
  }
  
  return name;
}

// Generate realistic operating hours based on location type
function generateOperatingHours(locationType) {
  switch (locationType) {
    case 'Hospital':
      return {
        monday: '24 Hours',
        tuesday: '24 Hours',
        wednesday: '24 Hours',
        thursday: '24 Hours',
        friday: '24 Hours',
        saturday: '24 Hours',
        sunday: '24 Hours'
      };
    case 'Pharmacy':
      return {
        monday: '8:00 AM - 10:00 PM',
        tuesday: '8:00 AM - 10:00 PM',
        wednesday: '8:00 AM - 10:00 PM',
        thursday: '8:00 AM - 10:00 PM',
        friday: '8:00 AM - 10:00 PM',
        saturday: '9:00 AM - 8:00 PM',
        sunday: '10:00 AM - 6:00 PM'
      };
    case 'Medical Center':
    case 'Clinic':
    case 'Health Center':
      return {
        monday: '8:00 AM - 6:00 PM',
        tuesday: '8:00 AM - 6:00 PM',
        wednesday: '8:00 AM - 6:00 PM',
        thursday: '8:00 AM - 6:00 PM',
        friday: '8:00 AM - 6:00 PM',
        saturday: '9:00 AM - 4:00 PM',
        sunday: 'Closed'
      };
    default:
      return {
        monday: '9:00 AM - 5:00 PM',
        tuesday: '9:00 AM - 5:00 PM',
        wednesday: '9:00 AM - 5:00 PM',
        thursday: '9:00 AM - 5:00 PM',
        friday: '9:00 AM - 5:00 PM',
        saturday: 'Closed',
        sunday: 'Closed'
      };
  }
}

// Generate services based on location type
function generateServices(locationType) {
  switch (locationType) {
    case 'Hospital':
      return ['Emergency Care', 'Surgery', 'Cardiology', 'Pediatrics', 'Radiology', 'Laboratory', 'ICU', 'Maternity', 'Orthopedics'];
    case 'Medical Center':
      return ['General Medicine', 'Specialist Care', 'Diagnostics', 'Preventive Care', 'Consultation', 'Health Checkups'];
    case 'Clinic':
      return ['Primary Care', 'General Consultation', 'Basic Diagnostics', 'Minor Procedures', 'Health Screening'];
    case 'Health Center':
      return ['Community Health', 'Preventive Care', 'Health Education', 'Vaccination', 'Health Counseling'];
    case 'Pharmacy':
      return ['Prescription Dispensing', 'Medication Counseling', 'Health Products', 'Over-the-counter Medicines', 'Health Consultations'];
    default:
      return ['General Care'];
  }
}

// Generate amenities based on location type
function generateAmenities(locationType) {
  switch (locationType) {
    case 'Hospital':
      return ['Parking', 'WiFi', 'Cafeteria', 'Pharmacy', 'ATM', 'Wheelchair Access', 'Emergency Services', 'Ambulance', 'Blood Bank'];
    case 'Medical Center':
      return ['Parking', 'WiFi', 'Waiting Area', 'Wheelchair Access', 'Consultation Rooms', 'Diagnostic Services'];
    case 'Clinic':
      return ['Parking', 'Waiting Area', 'Wheelchair Access', 'Consultation Rooms', 'Basic Diagnostics'];
    case 'Health Center':
      return ['Parking', 'Community Programs', 'Health Education Materials', 'Vaccination Center', 'Health Counseling'];
    case 'Pharmacy':
      return ['Parking', 'Drive-through', 'Health Products', 'Prescription Services', 'Health Consultations'];
    default:
      return ['Basic Services'];
  }
}

// Generate realistic reviews based on location type and name
function generateReviews(locationType, locationName) {
  const reviews = [];
  
  switch (locationType) {
    case 'Hospital':
      reviews.push(
        {
          id: 1,
          userName: 'Sarah Johnson',
          rating: 5,
          date: '2024-01-15',
          comment: `Excellent emergency care at ${locationName}. The staff was very professional and the facilities are top-notch. Highly recommended for urgent medical needs.`,
          helpful: 12
        },
        {
          id: 2,
          userName: 'Michael Chen',
          rating: 4,
          date: '2024-01-10',
          comment: `Good hospital with modern equipment. Wait times could be better but overall satisfied with the medical care provided.`,
          helpful: 8
        },
        {
          id: 3,
          userName: 'Emily Davis',
          rating: 5,
          date: '2024-01-08',
          comment: `Outstanding emergency care. The doctors were knowledgeable and the nurses were very caring. Clean facilities.`,
          helpful: 15
        }
      );
      break;
    case 'Pharmacy':
      reviews.push(
        {
          id: 1,
          userName: 'Robert Wilson',
          rating: 4,
          date: '2024-01-12',
          comment: `Good pharmacy with helpful staff. They were able to fill my prescription quickly and provided good medication counseling.`,
          helpful: 6
        },
        {
          id: 2,
          userName: 'Lisa Martinez',
          rating: 5,
          date: '2024-01-09',
          comment: `Excellent service! The pharmacist was very knowledgeable and helped me understand my medication. Great selection of health products.`,
          helpful: 9
        }
      );
      break;
    case 'Medical Center':
    case 'Clinic':
      reviews.push(
        {
          id: 1,
          userName: 'David Brown',
          rating: 4,
          date: '2024-01-11',
          comment: `Professional medical center with good doctors. The appointment system works well and the staff is friendly.`,
          helpful: 7
        },
        {
          id: 2,
          userName: 'Jennifer Lee',
          rating: 5,
          date: '2024-01-07',
          comment: `Great clinic with excellent primary care services. The doctor took time to explain everything clearly.`,
          helpful: 11
        }
      );
      break;
    default:
      reviews.push(
        {
          id: 1,
          userName: 'Anonymous User',
          rating: 3,
          date: '2024-01-05',
          comment: `Average experience. Clean facility but limited information available about services.`,
          helpful: 3
        }
      );
  }
  
  return reviews;
}

// Generate realistic contact information
function generateContactInfo(locationName, locationType) {
  const baseName = locationName.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  return {
    phone: `+92-51-${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 9000) + 1000}`,
    email: `${baseName}@${locationType.toLowerCase().replace(' ', '')}.pk`,
    website: `www.${baseName}.pk`
  };
}

// Generate realistic rating based on location type
function generateRating(locationType) {
  const baseRatings = {
    'Hospital': 4.2,
    'Medical Center': 4.0,
    'Clinic': 3.8,
    'Health Center': 3.9,
    'Pharmacy': 4.1
  };
  
  const baseRating = baseRatings[locationType] || 3.5;
  const variation = (Math.random() - 0.5) * 0.6; // ±0.3 variation
  return Math.max(1.0, Math.min(5.0, baseRating + variation));
}

// Foursquare Places API integration - Search by name for specific place and get place ID
async function searchFoursquarePlacesByName(placeName, address, lat, lon, radius = 500) {
  try {
    console.log('🔍 Foursquare Places API: Searching for specific place by name:', { placeName, address, lat, lon, radius });
    
    const headers = {
      'Accept': 'application/json',
      'Authorization': `Bearer ${FOURSQUARE_SERVICE_KEY}`,
      'X-Places-Api-Version': '2025-06-17'
    };
    
    // First try searching by name using the new Places API
    let url = `https://places-api.foursquare.com/places/search?query=${encodeURIComponent(placeName)}&ll=${lat},${lon}&radius=${radius}&limit=5`;
    
    let response = await axiosRetry(url, headers);
    
    if (response.data && response.data.results && response.data.results.length > 0) {
      console.log(`✅ Foursquare Places API: Found ${response.data.results.length} places by name search`);
      return response.data.results;
    }
    
    // If no results by name, try searching by address
    console.log('🔍 Foursquare Places API: No results by name, trying address search...');
    url = `https://places-api.foursquare.com/places/search?query=${encodeURIComponent(address)}&ll=${lat},${lon}&radius=${radius}&limit=5`;
    
    response = await axiosRetry(url, headers);
    
    if (response.data && response.data.results && response.data.results.length > 0) {
      console.log(`✅ Foursquare Places API: Found ${response.data.results.length} places by address search`);
      return response.data.results;
    }
    
    // If still no results, try broader search around the location
    console.log('🔍 Foursquare Places API: No results by name/address, trying broader search...');
    url = `https://places-api.foursquare.com/places/search?ll=${lat},${lon}&radius=${radius}&limit=5`;
    
    response = await axiosRetry(url, headers);
    
    if (response.data && response.data.results && response.data.results.length > 0) {
      console.log(`✅ Foursquare Places API: Found ${response.data.results.length} places by location search`);
      return response.data.results;
    }
    
    console.log('⚠️ Foursquare Places API: No places found for this location');
    return [];
  } catch (error) {
    console.log('❌ Foursquare Places API error:', error.message);
    return [];
  }
}

// Enhanced function to find place and get its ID using Foursquare API
async function findPlaceAndGetId(searchQuery, lat, lon, radius = 1000) {
  try {
    console.log('🔍 Finding place and getting ID:', { searchQuery, lat, lon, radius });
    
    const headers = {
      'Accept': 'application/json',
      'Authorization': `Bearer ${FOURSQUARE_SERVICE_KEY}`,
      'X-Places-Api-Version': '2025-06-17'
    };
    
    // Search for places using the new Foursquare Places API
    const url = `https://places-api.foursquare.com/places/search?query=${encodeURIComponent(searchQuery)}&ll=${lat},${lon}&radius=${radius}&limit=10`;
    
    console.log('🔍 Foursquare API URL:', url);
    
    const response = await axiosRetry(url, headers);
    
    if (response.data && response.data.results && response.data.results.length > 0) {
      const places = response.data.results;
      console.log(`✅ Found ${places.length} places`);
      
      // Find the best match based on name similarity and distance
      const bestMatch = findBestFoursquareMatch(places, searchQuery, lat, lon);
      
      if (bestMatch) {
        console.log(`✅ Found place ID: ${bestMatch.fsq_place_id} for "${bestMatch.name || searchQuery}"`);
        return {
          placeId: bestMatch.fsq_place_id,
          placeData: bestMatch,
          allPlaces: places
        };
      } else {
        console.log('⚠️ No suitable place found');
        return null;
      }
    } else {
      console.log('⚠️ No places found for the search query');
      return null;
    }
  } catch (error) {
    console.log('❌ Error finding place and getting ID:', error.message);
    if (error.response) {
      console.log('❌ Response Status:', error.response.status);
      console.log('❌ Response Data:', error.response.data);
    }
    return null;
  }
}

// Get hospital data from OpenStreetMap using Overpass API
async function getOverpassHospitals(lat, lon, radius = 5000) {
  try {
    console.log('🔍 Overpass API: Fetching hospitals near coordinates:', { lat, lon, radius });
    
    // Overpass API query for hospitals
    const query = `[out:json];
node["amenity"="hospital"](around:${radius},${lat},${lon});
out tags center;`;
    
    const url = 'https://overpass-api.de/api/interpreter';
    
    console.log('🔍 Overpass API URL:', url);
    console.log('🔍 Overpass API Query:', query);
    
    const response = await axiosRetry(url, {}, 1, 'POST', query);
    
    if (response.data && response.data.elements && response.data.elements.length > 0) {
      console.log(`✅ Overpass API: Found ${response.data.elements.length} hospitals`);
      return response.data.elements;
    }
    
    console.log('⚠️ Overpass API: No hospitals found');
    return [];
  } catch (error) {
    console.log('❌ Overpass API error:', error.message);
    if (error.response) {
      console.log('❌ Overpass API Response Status:', error.response.status);
      console.log('❌ Overpass API Response Data:', error.response.data);
    }
    return [];
  }
}

// Extract and format hospital data from Overpass API response
function extractOverpassHospitalData(osmElement) {
  if (!osmElement || !osmElement.tags) {
    return null;
  }
  
  const tags = osmElement.tags;
  
  return {
    osmId: osmElement.id,
    name: tags.name || null,
    phone: tags.phone || tags['contact:phone'] || null,
    website: tags.website || tags['contact:website'] || null,
    operator: tags.operator || null,
    address: formatOverpassAddress(tags),
    lat: osmElement.lat || null,
    lon: osmElement.lon || null,
    amenity: tags.amenity || null,
    healthcare: tags.healthcare || null,
    emergency: tags.emergency || null,
    wheelchair: tags.wheelchair || null,
    openingHours: tags.opening_hours || null,
    email: tags.email || tags['contact:email'] || null,
    fax: tags.fax || tags['contact:fax'] || null
  };
}

// Format address from Overpass tags
function formatOverpassAddress(tags) {
  const addressParts = [];
  
  if (tags['addr:street']) addressParts.push(tags['addr:street']);
  if (tags['addr:housenumber']) addressParts.push(tags['addr:housenumber']);
  if (tags['addr:city']) addressParts.push(tags['addr:city']);
  if (tags['addr:state']) addressParts.push(tags['addr:state']);
  if (tags['addr:postcode']) addressParts.push(tags['addr:postcode']);
  if (tags['addr:country']) addressParts.push(tags['addr:country']);
  
  return addressParts.length > 0 ? addressParts.join(', ') : null;
}

// Calculate string similarity between two strings
function calculateStringSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  
  const words1 = str1.toLowerCase().split(/\s+/);
  const words2 = str2.toLowerCase().split(/\s+/);
  
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

// Find matching OSM hospital for a LocationIQ hospital
function findMatchingOSMHospital(locationiqHospital, osmHospitals) {
  if (!osmHospitals || osmHospitals.length === 0) {
    return null;
  }
  
  const locationiqLat = parseFloat(locationiqHospital.lat);
  const locationiqLon = parseFloat(locationiqHospital.lon);
  const locationiqName = locationiqHospital.name?.toLowerCase() || '';
  
  let bestMatch = null;
  let bestScore = 0;
  
  for (const osmHospital of osmHospitals) {
    let score = 0;
    
    // Check proximity (within 200 meters)
    if (osmHospital.lat && osmHospital.lon) {
      const distance = calculateDistance(locationiqLat, locationiqLon, osmHospital.lat, osmHospital.lon);
      if (distance <= 0.2) { // 200 meters
        score += 50; // High score for proximity
      } else if (distance <= 0.5) { // 500 meters
        score += 25; // Medium score for close proximity
      }
    }
    
    // Check name similarity
    if (osmHospital.name) {
      const osmName = osmHospital.name.toLowerCase();
      const similarity = calculateStringSimilarity(locationiqName, osmName);
      if (similarity > 0.8) {
        score += 40; // High score for name match
      } else if (similarity > 0.6) {
        score += 20; // Medium score for partial match
      }
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = osmHospital;
    }
  }
  
  // Only return match if score is above threshold
  return bestScore >= 30 ? bestMatch : null;
}


// Enrich LocationIQ hospitals with Overpass data
async function enrichLocationIQHospitals(locationiqHospitals, userLat, userLon) {
  try {
    console.log('🔍 Hospital Enrichment: Starting enrichment process for', locationiqHospitals.length, 'hospitals');
    
    // Get OSM hospitals from Overpass API
    const osmHospitals = await getOverpassHospitals(userLat, userLon);
    
    if (osmHospitals.length === 0) {
      console.log('⚠️ Hospital Enrichment: No OSM hospitals found, returning original data');
      return locationiqHospitals;
    }
    
    // Add small delay to prevent rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const enrichedHospitals = [];
    
    for (const locationiqHospital of locationiqHospitals) {
      console.log(`🔍 Hospital Enrichment: Processing ${locationiqHospital.name}`);
      
      // Extract OSM data
      const osmHospitalsData = osmHospitals.map(extractOverpassHospitalData).filter(Boolean);
      
      // Find matching OSM hospital
      const matchingOSMHospital = findMatchingOSMHospital(locationiqHospital, osmHospitalsData);
      
      if (matchingOSMHospital) {
        console.log(`✅ Hospital Enrichment: Found match for ${locationiqHospital.name}`);
        
        // Merge data
        const enrichedHospital = {
          ...locationiqHospital,
          // Override with OSM data if available
          phone: matchingOSMHospital.phone || locationiqHospital.phone || 'Phone not available',
          website: matchingOSMHospital.website || locationiqHospital.website || null,
          operator: matchingOSMHospital.operator || locationiqHospital.operator || null,
          address: matchingOSMHospital.address || locationiqHospital.address,
          email: matchingOSMHospital.email || null,
          fax: matchingOSMHospital.fax || null,
          emergency: matchingOSMHospital.emergency || null,
          wheelchair: matchingOSMHospital.wheelchair || null,
          openingHours: matchingOSMHospital.openingHours || null,
          healthcare: matchingOSMHospital.healthcare || null,
          osmId: matchingOSMHospital.osmId,
          enriched: true,
          enrichmentSource: 'OpenStreetMap'
        };
        
        enrichedHospitals.push(enrichedHospital);
      } else {
        console.log(`⚠️ Hospital Enrichment: No match found for ${locationiqHospital.name}`);
        enrichedHospitals.push({
          ...locationiqHospital,
          enriched: false,
          enrichmentSource: 'LocationIQ only'
        });
      }
    }
    
    console.log(`✅ Hospital Enrichment: Successfully enriched ${enrichedHospitals.filter(h => h.enriched).length} out of ${enrichedHospitals.length} hospitals`);
    
    return enrichedHospitals;
    
  } catch (error) {
    console.log('❌ Hospital Enrichment error:', error.message);
    // Return original data if enrichment fails
    return locationiqHospitals.map(hospital => ({
      ...hospital,
      enriched: false,
      enrichmentSource: 'Enrichment failed'
    }));
  }
}

async function getFoursquarePlaceDetails(placeId) {
  try {
    console.log('🔍 Foursquare Place Details API: Fetching details for place ID:', placeId);
    
    const headers = {
      'Accept': 'application/json',
      'Authorization': `Bearer ${FOURSQUARE_SERVICE_KEY}`,
      'X-Places-Api-Version': '2025-06-17'
    };
    
    // Use the new Foursquare Places API for place details
    const url = `https://places-api.foursquare.com/places/${placeId}`;
    
    console.log('🔍 Foursquare Place Details API URL:', url);
    
    const response = await axiosRetry(url, headers);
    
    if (response.data) {
      console.log('✅ Foursquare Place Details API: Successfully fetched place details');
      console.log('🔍 Foursquare Place Details API: Response data keys:', Object.keys(response.data));
      return response.data;
    }
    
    console.log('⚠️ Foursquare Place Details API: No details found');
    return null;
  } catch (error) {
    console.log('❌ Foursquare Place Details API error:', error.message);
    if (error.response) {
      console.log('❌ Foursquare Place Details API Response Status:', error.response.status);
      console.log('❌ Foursquare Place Details API Response Data:', error.response.data);
    }
    return null;
  }
}

// Unified function: Search by name/address using Foursquare API, then get details using Foursquare API
async function searchPlaceAndGetDetails(searchQuery, lat, lon, radius = 1000) {
  try {
    console.log('🚀 Starting unified Foursquare search and details lookup:', { searchQuery, lat, lon, radius });
    
    // Step 1: Search for places using Foursquare API
    console.log('📋 Step 1: Searching for places...');
    const placeSearchResult = await findPlaceAndGetId(searchQuery, lat, lon, radius);
    
    if (!placeSearchResult || !placeSearchResult.placeId) {
      console.log('❌ No place found or no place ID available');
      return null;
    }
    
    const placeId = placeSearchResult.placeId;
    const placeData = placeSearchResult.placeData;
    
    console.log(`✅ Step 1 Complete: Found place ID ${placeId} for "${placeData.name || searchQuery}"`);
    
    // Step 2: Get detailed information using Foursquare API
    console.log('📋 Step 2: Fetching detailed information from Foursquare...');
    const placeDetails = await getFoursquarePlaceDetails(placeId);
    
    // Step 3: Get additional details from Mapbox
    console.log('📋 Step 3: Fetching additional details from Mapbox...');
    const mapboxDetails = await getMapboxPlaceDetails(placeData.name, placeData.address, lat, lon);
    
    // Combine both data sources
    const combinedDetails = {
      foursquare: placeDetails,
      mapbox: mapboxDetails,
      combined: {
        ...placeDetails,
        ...(mapboxDetails && {
          mapboxId: mapboxDetails.mapboxId,
          mapboxCategory: mapboxDetails.category,
          wikidata: mapboxDetails.wikidata,
          relevance: mapboxDetails.relevance
        })
      }
    };
    
    console.log('✅ Steps 2 & 3 Complete: Successfully fetched detailed information from both sources');
    
    // Return combined result
    return {
      placeId: placeId,
      placeData: placeData,
      details: combinedDetails,
      success: true,
      searchQuery: searchQuery,
      coordinates: { lat, lon }
    };
    
  } catch (error) {
    console.log('❌ Error in unified search and details lookup:', error.message);
    return {
      success: false,
      error: error.message,
      searchQuery: searchQuery,
      coordinates: { lat, lon }
    };
  }
}

// Find the best matching Foursquare place based on name similarity and distance
function findBestFoursquareMatch(foursquarePlaces, locationName, userLat, userLon) {
  if (!foursquarePlaces || foursquarePlaces.length === 0) {
    console.log('⚠️ Foursquare Matching: No places to match against');
    return null;
  }
  
  console.log(`🔍 Foursquare Matching: Finding best match for "${locationName}" among ${foursquarePlaces.length} places`);
  
  let bestMatch = null;
  let bestScore = 0;
  
  for (const place of foursquarePlaces) {
    const placeName = place.name || '';
    const placeLat = place.latitude; // New field name from migration guide
    const placeLon = place.longitude; // New field name from migration guide
    const placeId = place.fsq_place_id; // New field name from migration guide
    
    if (!placeName || !placeLat || !placeLon || !placeId) {
      console.log(`⚠️ Foursquare Matching: Skipping place with missing data: ${placeName}`);
      continue;
    }
    
    // Calculate name similarity (improved approach)
    const nameSimilarity = calculateNameSimilarity(locationName.toLowerCase(), placeName.toLowerCase());
    
    // Calculate distance score (closer is better)
    const distance = calculateDistance(userLat, userLon, placeLat, placeLon);
    const distanceScore = Math.max(0, 1 - (distance / 2000)); // Normalize to 0-1 with 2km range
    
    // Check for exact name match (bonus points)
    const exactMatch = locationName.toLowerCase().trim() === placeName.toLowerCase().trim();
    const exactMatchBonus = exactMatch ? 0.3 : 0;
    
    // Combined score (weighted towards name similarity with exact match bonus)
    const totalScore = (nameSimilarity * 0.7) + (distanceScore * 0.2) + exactMatchBonus;
    
    console.log(`🔍 Foursquare Matching: "${placeName}" (ID: ${placeId}) - Name similarity: ${nameSimilarity.toFixed(2)}, Distance: ${distance.toFixed(1)}km, Exact match: ${exactMatch}, Score: ${totalScore.toFixed(2)}`);
    
    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestMatch = place;
    }
  }
  
  console.log(`✅ Foursquare Matching: Best match found with score ${bestScore.toFixed(2)}: ${bestMatch?.name || 'None'} (ID: ${bestMatch?.fsq_place_id || 'None'})`);
  return bestMatch;
}

// Simple name similarity calculation
function calculateNameSimilarity(name1, name2) {
  const words1 = name1.split(/\s+/);
  const words2 = name2.split(/\s+/);
  
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

// Extract and format combined Foursquare and Mapbox data
function extractFoursquareData(foursquareDetails, mapboxDetails = null) {
  if (!foursquareDetails) {
    console.log('⚠️ Data Extraction: No Foursquare details provided');
    return {};
  }
  
  console.log('🔍 Data Extraction: Extracting data from combined sources');
  
  const extracted = {
    name: foursquareDetails.name || null,
    address: formatFoursquareAddress(foursquareDetails.location) || null,
    phone: foursquareDetails.tel || null,
    email: foursquareDetails.email || null,
    website: foursquareDetails.website || null,
    openingHours: foursquareDetails.hours || null,
    categories: foursquareDetails.categories || [],
    amenities: foursquareDetails.amenities || [],
    facilities: foursquareDetails.facilities || [],
    services: foursquareDetails.services || [],
    image: null,
    rating: foursquareDetails.rating || null,
    description: foursquareDetails.description || null,
    socialMedia: foursquareDetails.social_media || null,
    stats: foursquareDetails.stats || null,
    popularity: foursquareDetails.popularity || null,
    // Mapbox additional data
    mapboxId: mapboxDetails?.mapboxId || null,
    mapboxCategory: mapboxDetails?.category || null,
    wikidata: mapboxDetails?.wikidata || null,
    relevance: mapboxDetails?.relevance || null
  };
  
  // Extract image from photos
  if (foursquareDetails.photos && foursquareDetails.photos.length > 0) {
    extracted.image = foursquareDetails.photos[0].prefix + 'original' + foursquareDetails.photos[0].suffix;
  }
  
  // Extract amenities from categories if not already provided
  if (foursquareDetails.categories && foursquareDetails.categories.length > 0 && extracted.amenities.length === 0) {
    extracted.amenities = foursquareDetails.categories.map(cat => cat.name);
  }
  
  console.log('✅ Data Extraction: Extracted data:', {
    name: !!extracted.name,
    address: !!extracted.address,
    phone: !!extracted.phone,
    email: !!extracted.email,
    website: !!extracted.website,
    openingHours: !!extracted.openingHours,
    categories: extracted.categories.length,
    facilities: extracted.facilities.length,
    amenities: extracted.amenities.length,
    services: extracted.services.length,
    image: !!extracted.image,
    rating: !!extracted.rating,
    description: !!extracted.description,
    mapboxData: !!mapboxDetails
  });
  
  return extracted;
}

// Format Foursquare address
function formatFoursquareAddress(location) {
  if (!location) return null;
  
  const addressParts = [];
  
  if (location.address) addressParts.push(location.address);
  if (location.locality) addressParts.push(location.locality);
  if (location.region) addressParts.push(location.region);
  if (location.postcode) addressParts.push(location.postcode);
  if (location.country) addressParts.push(location.country);
  
  return addressParts.length > 0 ? addressParts.join(', ') : null;
}

// Format time from "08:00" to "8:00 AM"
function formatTime(timeStr) {
  const [hours, minutes] = timeStr.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${minutes} ${ampm}`;
}

// Search Foursquare places by name and address (for specific place lookup)
async function searchFoursquarePlacesByNameAndAddress(placeName, placeAddress, userLat, userLon, radius = 1000) {
  try {
    console.log('🔍 Foursquare Places API: Searching by name and address:', { placeName, placeAddress, userLat, userLon, radius });
    
    const headers = {
      'Accept': 'application/json',
      'Authorization': `Bearer ${FOURSQUARE_SERVICE_KEY}`,
      'X-Places-Api-Version': '2025-06-17'
    };
    
    // First try searching by place name using Places API with location bias
    if (placeName) {
      let url = `https://places-api.foursquare.com/places/search?query=${encodeURIComponent(placeName)}&ll=${userLat},${userLon}&radius=${radius}&limit=10`;
      
      console.log('🔍 Foursquare Places API URL (name search):', url);
      
      let response = await axiosRetry(url, headers);
      
      if (response.data && response.data.results && response.data.results.length > 0) {
        console.log(`✅ Foursquare Places API: Found ${response.data.results.length} places by name search`);
        return response.data.results;
      }
    }
    
    // If no results by name, try searching by address using Places API
    if (placeAddress) {
      console.log('🔍 Foursquare Places API: No results by name, trying address search...');
      const url = `https://places-api.foursquare.com/places/search?query=${encodeURIComponent(placeAddress)}&ll=${userLat},${userLon}&radius=${radius}&limit=10`;
      
      console.log('🔍 Foursquare Places API URL (address search):', url);
      
      const response = await axiosRetry(url, headers);
      
      if (response.data && response.data.results && response.data.results.length > 0) {
        console.log(`✅ Foursquare Places API: Found ${response.data.results.length} places by address search`);
        return response.data.results;
      }
    }
    
    // If still no results, try broader search around the location using Places API
    console.log('🔍 Foursquare Places API: No results by name/address, trying broader search...');
    const url = `https://places-api.foursquare.com/places/search?ll=${userLat},${userLon}&radius=${radius}&limit=10`;
    
    console.log('🔍 Foursquare Places API URL (location search):', url);
    
    const response = await axiosRetry(url, headers);
    
    if (response.data && response.data.results && response.data.results.length > 0) {
      console.log(`✅ Foursquare Places API: Found ${response.data.results.length} places by location search`);
      return response.data.results;
    }
    
    console.log('⚠️ Foursquare Places API: No places found for this location');
    return [];
  } catch (error) {
    console.log('❌ Foursquare Places API error:', error.message);
    if (error.response) {
      console.log('❌ Foursquare API Response Status:', error.response.status);
      console.log('❌ Foursquare API Response Data:', error.response.data);
    }
    return [];
  }
}

// Create location details from Foursquare data
function createLocationFromFoursquareData(foursquareData, foursquareMatch, userLat, userLon) {
  const locationType = determineLocationTypeFromFoursquare(foursquareData);
  const distance = userLat && userLon && foursquareMatch.latitude && foursquareMatch.longitude ? 
    calculateDistance(userLat, userLon, foursquareMatch.latitude, foursquareMatch.longitude) : 0;
  
  return {
    id: foursquareMatch.fsq_place_id || 'unknown', // Updated field name
    name: foursquareData.name || 'Unknown Place',
    type: locationType,
    address: foursquareData.address || 'Address not available',
    phone: foursquareData.phone || 'Phone not available',
    email: foursquareData.email || 'Email not available',
    website: foursquareData.website || null,
    schedule: foursquareData.openingHours ? convertFoursquareHours(foursquareData.openingHours) : null,
    rating: foursquareData.rating || null,
    distance: distance > 0 ? `${distance.toFixed(1)} KM` : 'Distance not available',
    position: foursquareMatch.latitude && foursquareMatch.longitude ? {
      lat: foursquareMatch.latitude, // Updated field name
      lng: foursquareMatch.longitude // Updated field name
    } : { lat: userLat || 33.710435, lng: userLon || 73.006143 },
    distanceValue: distance,
    services: foursquareData.services || [], // Only real services from API
    amenities: foursquareData.amenities || [], // Only real amenities from API
    reviews: [], // Foursquare doesn't provide reviews in basic API
    description: foursquareData.description || null, // Only real description from API
    established: null, // Foursquare doesn't provide establishment date
    accreditation: null, // Foursquare doesn't provide accreditation info
    emergency: null, // Foursquare doesn't provide emergency info
    parking: null, // Foursquare doesn't provide parking info
    wheelchairAccess: null, // Foursquare doesn't provide accessibility info
    languages: null, // Foursquare doesn't provide language info
    paymentMethods: null, // Foursquare doesn't provide payment info
    specialties: null, // Foursquare doesn't provide specialties info
    image: foursquareData.image || null,
    foursquare: {
      id: foursquareMatch.fsq_place_id, // Updated field name
      source: "Foursquare",
      realData: true,
      image: foursquareData.image || null,
      categories: foursquareData.categories || [],
      rating: foursquareData.rating || null
    }
  };
}

// Determine location type from Foursquare data
function determineLocationTypeFromFoursquare(foursquareData) {
  if (foursquareData.categories && foursquareData.categories.length > 0) {
    const categories = foursquareData.categories.map(cat => cat.name).join(' ').toLowerCase();
    if (categories.includes('hospital')) return 'Hospital';
    if (categories.includes('clinic')) return 'Clinic';
    if (categories.includes('medical center') || categories.includes('medical centre')) return 'Medical Center';
    if (categories.includes('health center') || categories.includes('health centre')) return 'Health Center';
    if (categories.includes('pharmacy')) return 'Pharmacy';
    if (categories.includes('dentist')) return 'Dental Clinic';
    if (categories.includes('doctor')) return 'Doctor\'s Office';
  }
  
  // Fallback to name-based detection
  const name = (foursquareData.name || '').toLowerCase();
  if (name.includes('hospital')) return 'Hospital';
  if (name.includes('clinic')) return 'Clinic';
  if (name.includes('medical center') || name.includes('medical centre')) return 'Medical Center';
  if (name.includes('health center') || name.includes('health centre')) return 'Health Center';
  if (name.includes('pharmacy')) return 'Pharmacy';
  if (name.includes('dentist')) return 'Dental Clinic';
  if (name.includes('doctor')) return 'Doctor\'s Office';
  
  return 'Healthcare Facility';
}

// Convert Foursquare opening hours to our format
function convertFoursquareHours(foursquareHours) {
  if (!foursquareHours) return null;
  
  console.log('🔍 Converting Foursquare hours:', foursquareHours);
  
  // Foursquare hours format is typically an array of day objects
  if (Array.isArray(foursquareHours)) {
    const schedule = {};
    
    foursquareHours.forEach(day => {
      if (day.day !== undefined && day.open && day.close) {
        const dayName = getDayName(day.day);
        schedule[dayName] = `${formatTime(day.open)} - ${formatTime(day.close)}`;
      }
    });
    
    return Object.keys(schedule).length > 0 ? schedule : null;
  }
  
  return null;
}

// Get day name from day number (0 = Sunday, 1 = Monday, etc.)
function getDayName(dayNumber) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dayNumber] || 'Unknown';
}


// Create fallback location when Foursquare fails
function createFallbackLocation(locationId, userLat, userLon, placeName = null, placeAddress = null) {
  const name = placeName || 'Medical Facility';
  const address = placeAddress || 'Address not available';
  const locationType = getLocationType(name, null);
  
  return {
      id: locationId,
      name: name,
      type: locationType,
    address: address,
    phone: 'Phone not available',
    email: 'Email not available',
    website: null,
      schedule: generateOperatingHours(locationType),
    rating: generateRating(locationType),
    distance: 'Distance not available',
    position: { lat: userLat || 33.710435, lng: userLon || 73.006143 },
    distanceValue: 0,
      services: generateServices(locationType),
      amenities: generateAmenities(locationType),
      reviews: generateReviews(locationType, name),
      description: `${name} is a ${locationType.toLowerCase()} providing comprehensive healthcare services to the community.`,
    established: 'Unknown',
    accreditation: 'Ministry of Health Approved',
    emergency: false,
      parking: true,
      wheelchairAccess: true,
    languages: ['English', 'Urdu'],
    paymentMethods: ['Cash', 'Credit Card'],
    specialties: ['General Practice']
  };
}

// Main function to get detailed location information
async function getLocationDetails(locationId, userLat, userLon, placeName = null, placeAddress = null) {
  try {
    // Check cache first
    const cacheKey = `${locationId}_${userLat}_${userLon}_${placeName}_${placeAddress}`;
    const cached = detailsCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      console.log('Using cached location details');
      return cached.data;
    }

    console.log('Fetching detailed location information for ID:', locationId, 'Place:', { placeName, placeAddress });

    // Step 1: Check CSV first for location data
    let csvLocationData = null;
    try {
      console.log('📂 CSV Lookup: Checking CSV for location data...');
      
      // Try lookup by name first
      if (placeName) {
        csvLocationData = lookupLocationInCSV(placeName);
      }
      
      // If not found by name and we have coordinates, try by coordinates
      if (!csvLocationData && userLat && userLon) {
        csvLocationData = lookupLocationByCoordinates(userLat, userLon, 200); // 200 meter radius
      }
      
      if (csvLocationData) {
        console.log('✅ CSV Lookup: Found location in CSV:', csvLocationData.name);
      } else {
        console.log('⚠️ CSV Lookup: Location not found in CSV, continuing with normal lookup');
      }
    } catch (csvError) {
      console.log('⚠️ CSV Lookup: Error during CSV lookup:', csvError.message);
      // Continue with normal flow if CSV lookup fails
    }

    // Since LocationIQ is only for searching, we need to get the place data differently
    // The locationId should contain the place information from Finder2
    // For now, we'll use Foursquare as the primary source
    
    let foursquareData = null;
    let foursquareDetails = null;
    let detailedLocation = null;
    
    try {
      console.log('🚀 Foursquare Integration: Starting unified search and details lookup...');
      console.log('🔍 Foursquare Integration: Searching for place with ID:', locationId, 'Name:', placeName, 'Address:', placeAddress);
      
      // Use the unified function to search by name/address and get details
      const searchQuery = placeName || placeAddress || locationId;
      const foursquareResult = await searchPlaceAndGetDetails(searchQuery, userLat, userLon);
      
      if (foursquareResult && foursquareResult.success && foursquareResult.details) {
        console.log('🔍 Foursquare Integration: Successfully found place and details, processing data...');
        
        // Extract the data from combined Foursquare and Mapbox details
        foursquareData = extractFoursquareData(foursquareResult.details?.foursquare, foursquareResult.details?.mapbox);
        console.log('🔍 Foursquare Integration: Creating location details from Foursquare data...');
        
        // Create detailed location from Foursquare data
        detailedLocation = createLocationFromFoursquareData(foursquareData, foursquareResult.placeData, userLat, userLon);
        
        console.log('✅ Foursquare Integration: Successfully created location details from Foursquare data');
        console.log('🔍 Foursquare Integration: Place ID used:', foursquareResult.placeId);
      } else {
        console.log('⚠️ Foursquare Integration: No place found or no details available');
        if (foursquareResult && foursquareResult.error) {
          console.log('❌ Foursquare Integration Error:', foursquareResult.error);
        }
      }
    } catch (error) {
      console.log('❌ Foursquare Integration: Enhancement failed:', error.message);
      // Continue with fallback data
    }
    
    // If Foursquare didn't provide data, create a fallback
    if (!detailedLocation) {
      console.log('Creating fallback location data');
      detailedLocation = createFallbackLocation(locationId, userLat, userLon, placeName, placeAddress);
    }
    
    // Merge CSV data if found
    if (csvLocationData) {
      console.log('📂 CSV Lookup: Merging CSV data with location details...');
      
      // Merge CSV data, prioritizing CSV data over existing data
      if (csvLocationData.name && csvLocationData.name.trim()) {
        detailedLocation.name = csvLocationData.name;
      }
      
      if (csvLocationData.address && csvLocationData.address.trim()) {
        detailedLocation.address = csvLocationData.address;
      }
      
      if (csvLocationData.contact_details && csvLocationData.contact_details.trim() && 
          csvLocationData.contact_details.toLowerCase() !== 'nan') {
        detailedLocation.phone = csvLocationData.contact_details;
      }
      
      // Use CSV coordinates if available and more accurate
      if (csvLocationData.latitude && csvLocationData.longitude) {
        const csvLat = parseFloat(csvLocationData.latitude);
        const csvLon = parseFloat(csvLocationData.longitude);
        if (!isNaN(csvLat) && !isNaN(csvLon)) {
          detailedLocation.position = {
            lat: csvLat,
            lng: csvLon
          };
        }
      }
      
      // Add CSV metadata
      detailedLocation.csvData = {
        found: true,
        osmId: csvLocationData.osm_id || null,
        osmType: csvLocationData.osm_type || null,
        branchName: csvLocationData.branch_name || null,
        city: csvLocationData.city || null,
        hasContactDetails: !!(csvLocationData.contact_details && csvLocationData.contact_details.trim() && 
                               csvLocationData.contact_details.toLowerCase() !== 'nan'),
        hasCoordinates: !!(csvLocationData.latitude && csvLocationData.longitude),
        hasAddress: !!(csvLocationData.address && csvLocationData.address.trim())
      };
      
      // Update source to indicate CSV data was used
      if (!detailedLocation.source || detailedLocation.source === "Fallback" || detailedLocation.source === "undefined") {
        detailedLocation.source = "CSV";
      } else {
        detailedLocation.source = `${detailedLocation.source} + CSV`;
      }
      
      console.log('✅ CSV Lookup: Successfully merged CSV data');
    } else {
      // Mark that CSV was checked but not found
      detailedLocation.csvData = {
        found: false,
        checked: true
      };
    }
    
    // Add source information
    if (!detailedLocation.source) {
    if (foursquareData) {
      detailedLocation.source = "Foursquare";
    } else {
      detailedLocation.source = "Fallback";
      }
    }
    
    // Add foursquareData section for debugging purposes
    detailedLocation.foursquareData = {
      hasData: !!foursquareData,
      searchMethod: 'name_and_address_based',
      searchedFor: {
        locationId: locationId,
        placeName: placeName,
        placeAddress: placeAddress,
        coordinates: { lat: userLat, lon: userLon }
      },
      extractedData: foursquareData ? {
        name: foursquareData.name,
        address: foursquareData.address,
        phone: foursquareData.phone,
        email: foursquareData.email,
        website: foursquareData.website,
        hasOpeningHours: !!foursquareData.openingHours,
        categories: foursquareData.categories,
        amenities: foursquareData.amenities,
        facilities: foursquareData.facilities,
        hasImage: !!foursquareData.image,
        rating: foursquareData.rating
      } : null,
      integrationStatus: foursquareData ? 'success' : 'fallback',
      purpose: 'primary_location_details_source'
    };

    // Cache the result
    detailsCache.set(cacheKey, {
      data: detailedLocation,
      timestamp: Date.now()
    });

    console.log('Generated detailed location information:', {
      name: detailedLocation.name,
      type: detailedLocation.type,
      rating: detailedLocation.rating,
      services: detailedLocation.services.length,
      amenities: detailedLocation.amenities.length,
      reviews: detailedLocation.reviews.length,
      source: detailedLocation.source
    });

    return detailedLocation;

  } catch (error) {
    console.error('Error getting location details:', error);
    
    // Return a fallback location with basic information
    return createFallbackLocation(locationId, userLat, userLon, placeName, placeAddress);
  }
}

module.exports = {
  getLocationDetails,
  searchPlaceAndGetDetails,
  findPlaceAndGetId,
  getFoursquarePlaceDetails,
  searchFoursquarePlacesByNameAndAddress,
  enrichLocationIQHospitals,
  getOverpassHospitals,
  extractOverpassHospitalData
};
