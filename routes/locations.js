const express = require('express');
const axios = require('axios');
const router = express.Router();

// LocationIQ API key
const LOCATIONIQ_API_KEY = 'pk.42d2c68c6add2a03f7ef588c03a9891e';

// Cache for location searches (5 minute TTL)
const searchCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Helper function for axios get with retry on 429
const axiosRetry = async (url, retries = 1) => {
  for (let i = 0; i <= retries; i++) {
    try {
      return await axios.get(url);
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

// Helper function to process and format location data
function processLocationItem(item, latitude, longitude) {
  const distance = calculateDistance(latitude, longitude, parseFloat(item.lat), parseFloat(item.lon));
  
  return {
    id: item.place_id || item.osm_id || Math.random().toString(),
    name: extractName(item),
    type: getLocationType(item.display_name, item.type),
    address: item.display_name || 'Address not available',
    phone: 'Phone not available',
    schedule: 'Schedule not available',
    rating: 0,
    distance: `${distance.toFixed(1)} KM`,
    position: {
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon)
    },
    distanceValue: distance
  };
}

// Endpoint to get locations (hospitals/pharmacies)
router.get('/locations', async (req, res) => {
  try {
    const { lat, lon, query, type, radius = 25000, limit = 50 } = req.query;

    console.log('Received location request:', { lat, lon, query, type, radius, limit });

    const latitude = lat ? parseFloat(lat) : 33.710435;
    const longitude = lon ? parseFloat(lon) : 73.006143;

    console.log('Using coordinates:', { latitude, longitude });

    if (isNaN(latitude) || isNaN(longitude)) {
      console.error('Invalid coordinates provided:', { lat, lon });
      return res.status(400).json({ error: 'Invalid coordinates provided' });
    }

    const radiusInKm = parseFloat(radius) / 1000;
    
    // Create cache key based on approximate location (rounded to 2 decimals to allow some caching)
    const cacheKey = `${latitude.toFixed(2)}_${longitude.toFixed(2)}_${radiusInKm}`;
    
    // Check cache first
    const cached = searchCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      console.log('Using cached results');
      const allPlaces = cached.data;
      
      // Filter and sort based on actual coordinates and requested type
      const places = allPlaces
        .map(item => processLocationItem(item, latitude, longitude))
        .filter(place => place.distanceValue <= radiusInKm)
        .sort((a, b) => a.distanceValue - b.distanceValue);
      
      console.log(`Returning ${places.length} cached locations`);
      return res.json(places);
    }

    const latRange = radiusInKm / 111;
    const lonRange = radiusInKm / (111 * Math.cos(latitude * Math.PI / 180));
    const viewbox = `${longitude - lonRange},${latitude - latRange},${longitude + lonRange},${latitude + latRange}`;

    console.log('Search parameters:', { radiusInKm, viewbox, userLocation: { latitude, longitude } });

    let allPlaces = [];
    const seenIds = new Set();

    // If user provided a specific query, search for it
    if (query) {
      try {
        const url = `https://us1.locationiq.com/v1/search?key=${LOCATIONIQ_API_KEY}&q=${encodeURIComponent(query + ' Islamabad')}&format=json&limit=20&addressdetails=1&bounded=1&viewbox=${viewbox}&countrycodes=PK`;
        const response = await axiosRetry(url);
        
        if (response.data && response.data.length > 0) {
          response.data.forEach(item => {
            const id = item.place_id || item.osm_id;
            if (id && !seenIds.has(id)) {
              seenIds.add(id);
              allPlaces.push(item);
            }
          });
        }
      } catch (error) {
        console.log('User query search failed:', error.message);
      }
    } else {
      // Optimized: Parallel searches for much faster results
      const searchTerms = [
        // Priority hospitals
        'PAF Hospital Islamabad',
        'Maroof International Hospital Islamabad',
        'Shifa International Hospital Islamabad',
        'PIMS CMH Polyclinic CDA Hospital Islamabad',
        // Pharmacies
        'D Watson pharmacy Islamabad',
        // General searches with bounded viewbox
        'hospital Islamabad',
        'medical center Islamabad',
        'pharmacy Islamabad',
        'clinic Islamabad',
        'health center Islamabad'
      ];

      // Execute all searches in parallel
      const searchPromises = searchTerms.map(async (searchTerm) => {
        try {
          // Use bounded search for general terms, unbounded for specific hospitals
          const isGeneral = searchTerm.includes('hospital Islamabad') || 
                           searchTerm.includes('medical center Islamabad') || 
                           searchTerm.includes('pharmacy Islamabad') || 
                           searchTerm.includes('clinic Islamabad') || 
                           searchTerm.includes('health center Islamabad');
          const boundedParam = isGeneral ? `&bounded=1&viewbox=${viewbox}` : '';
          const searchLimit = isGeneral ? 30 : 5;
          
          const url = `https://us1.locationiq.com/v1/search?key=${LOCATIONIQ_API_KEY}&q=${encodeURIComponent(searchTerm)}&format=json&limit=${searchLimit}&addressdetails=1${boundedParam}&countrycodes=PK`;
          const response = await axiosRetry(url);
          
          if (response.data && response.data.length > 0) {
            console.log(`Found ${response.data.length} results for "${searchTerm}"`);
            return response.data;
          }
          return [];
        } catch (error) {
          console.log(`Search failed for "${searchTerm}":`, error.message);
          return [];
        }
      });

      // Wait for all searches to complete in parallel
      const searchResults = await Promise.all(searchPromises);
      
      // Process all results
      searchResults.flat().forEach(item => {
        const id = item.place_id || item.osm_id;
        const distance = calculateDistance(latitude, longitude, parseFloat(item.lat), parseFloat(item.lon));
        
        // Only add if within radius and not already added
        if (distance <= radiusInKm && id && !seenIds.has(id)) {
          seenIds.add(id);
          allPlaces.push(item);
        }
      });
    }

    console.log(`Total unique locations found: ${allPlaces.length}`);
    
    // Cache the raw results
    searchCache.set(cacheKey, {
      data: allPlaces,
      timestamp: Date.now()
    });

    // Filter out educational institutions and process locations
    const places = allPlaces
      .filter(item => {
        const displayName = item.display_name ? item.display_name.toLowerCase() : '';
        const name = item.address?.name ? item.address.name.toLowerCase() : '';
        const combinedText = `${displayName} ${name}`;
        
        const excludeKeywords = ['college', 'university', 'school', 'medical college', 'medical school', 'dental college', 'nursing college', 'institute', 'academy', 'training center'];
        const includeKeywords = ['hospital', 'clinic', 'medical center', 'medical centre', 'health center', 'health centre', 'healthcare', 'medical facility', 'health facility', 'pharmacy', 'drugstore', 'chemist', 'medical store'];

        const hasExcludeKeyword = excludeKeywords.some(keyword => combinedText.includes(keyword));
        const hasIncludeKeyword = includeKeywords.some(keyword => combinedText.includes(keyword));
        
        return hasIncludeKeyword && !hasExcludeKeyword;
      })
      .map(item => processLocationItem(item, latitude, longitude))
      .filter(place => place.distanceValue <= radiusInKm)
      .sort((a, b) => a.distanceValue - b.distanceValue);

    console.log(`Filtered to ${places.length} locations within ${radiusInKm}km`);
    console.log('Closest 10 locations:', places.slice(0, 10).map(p => ({
      name: p.name,
      distance: p.distance,
      type: p.type
    })));

    // Return results immediately, enrich in background (non-blocking)
    res.json(places);
    
    // Enrich hospitals asynchronously (non-blocking) for next request
    setImmediate(async () => {
      try {
        console.log('🔍 Starting background hospital enrichment with OpenStreetMap data...');
        const { enrichLocationIQHospitals } = require('../services/location_details_service');
        
        // Filter only hospitals for enrichment
        const hospitals = places.filter(place => 
          place.type === 'Hospital' || 
          place.name.toLowerCase().includes('hospital') ||
          place.name.toLowerCase().includes('medical center') ||
          place.name.toLowerCase().includes('health center')
        );
        
        if (hospitals.length > 0) {
          console.log(`🔍 Enriching ${hospitals.length} hospitals in background...`);
          const enrichedHospitals = await enrichLocationIQHospitals(hospitals, latitude, longitude);
          
          // Update cache with enriched data for future requests
          const enrichedPlaces = places.map(place => {
            const enrichedHospital = enrichedHospitals.find(h => h.id === place.id);
            return enrichedHospital || place;
          });
          
          // Update cache with enriched results (convert back to LocationIQ format)
          const enrichedAllPlaces = allPlaces.map(item => {
            const id = item.place_id || item.osm_id;
            const enrichedPlace = enrichedPlaces.find(p => p.id === id);
            return item; // Keep original format for cache
          });
          
          searchCache.set(cacheKey, {
            data: enrichedAllPlaces,
            timestamp: Date.now()
          });
          
          console.log(`✅ Successfully enriched ${enrichedHospitals.filter(h => h.enriched).length} hospitals in background`);
        }
      } catch (enrichmentError) {
        console.log('❌ Background hospital enrichment failed:', enrichmentError.message);
      }
    });
  } catch (error) {
    console.error('Error fetching locations:', error);
    console.error('Error details:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch locations', details: error.message });
  }
});

// Endpoint to get a specific location by ID with detailed information
router.get('/locations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { lat, lon, name, address } = req.query; // Optional user coordinates and place details

    console.log('Fetching detailed location information for ID:', id, 'User location:', { lat, lon }, 'Place details:', { name, address });

    // Import the location details service
    const { getLocationDetails } = require('../services/location_details_service');
    
    // Get detailed location information
    const detailedLocation = await getLocationDetails(id, lat, lon, name, address);

    res.json(detailedLocation);
  } catch (error) {
    console.error('Error fetching location details:', error);
    res.status(500).json({ error: 'Failed to fetch location details', details: error.message });
  }
});

// Endpoint for location search with autocomplete
router.get('/search', async (req, res) => {
  try {
    const { q: query, limit = 10 } = req.query;

    if (!query || query.length < 3) {
      return res.json([]);
    }

    console.log('Location search request:', { query, limit });

    const url = `https://us1.locationiq.com/v1/autocomplete?key=${LOCATIONIQ_API_KEY}&q=${encodeURIComponent(query)}&format=json&limit=${limit}&addressdetails=1&countrycodes=PK`;

    const response = await axiosRetry(url);
    
    if (response.data && response.data.length > 0) {
      const suggestions = response.data.map(item => ({
        id: item.place_id || item.osm_id || Math.random().toString(),
        name: extractName(item),
        address: item.display_name || 'Address not available',
        coordinates: {
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon)
        },
        type: getLocationType(item.display_name, item.type)
      }));

      console.log(`Found ${suggestions.length} search suggestions for "${query}"`);
      res.json(suggestions);
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('Error in location search:', error);
    res.status(500).json({ error: 'Failed to search locations' });
  }
});

// Endpoint for reverse geocoding (coordinates to address)
router.get('/reverse-geocode', async (req, res) => {
  try {
    const { lat, lon } = req.query;

    if (!lat || !lon) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    console.log('Reverse geocoding request:', { lat, lon });

    const url = `https://us1.locationiq.com/v1/reverse?key=${LOCATIONIQ_API_KEY}&lat=${lat}&lon=${lon}&format=json&addressdetails=1`;

    const response = await axios.get(url);
    
    if (response.data && response.data.address) {
      const address = response.data.address;
      
      console.log('LocationIQ API response:', JSON.stringify(response.data, null, 2));
      
      let formattedAddress = '';
      
      if (address.house_number) formattedAddress += address.house_number + ' ';
      if (address.road) formattedAddress += address.road + ', ';
      if (address.suburb) formattedAddress += address.suburb + ', ';
      if (address.city) formattedAddress += address.city + ', ';
      if (address.state) formattedAddress += address.state + ', ';
      if (address.postcode) formattedAddress += address.postcode + ', ';
      if (address.country) formattedAddress += address.country;
      
      formattedAddress = formattedAddress.replace(/,\s*$/, '').trim();
      
      if (!formattedAddress) {
        formattedAddress = response.data.display_name || 'Location';
      }
      
      console.log('Formatted address:', formattedAddress);
      
      res.json({ 
        address: formattedAddress,
        rawAddress: address,
        coordinates: { lat: parseFloat(lat), lon: parseFloat(lon) }
      });
    } else {
      res.json({ address: 'Address not found' });
    }
  } catch (error) {
    console.error('Error in reverse geocoding:', error);
    res.status(500).json({ error: 'Failed to get address' });
  }
});

module.exports = router;
