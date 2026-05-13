const http = require('http');
const axios = require('axios');

// Test configuration
const BASE_URL = 'http://localhost:3000';
const TEST_USER_ID = '69e080099773807a48449232';

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

// Test results tracking
let testResults = {
  passed: 0,
  failed: 0,
  total: 0
};

// Helper function to make HTTP requests
async function makeRequest(method, path, data = null) {
  try {
    const url = `${BASE_URL}${path}`;
    const config = {
      method,
      url,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return {
      success: true,
      status: response.status,
      data: response.data
    };
  } catch (error) {
    return {
      success: false,
      status: error.response?.status || 0,
      error: error.message,
      data: error.response?.data
    };
  }
}

// Test runner
async function runTest(testName, testFunction) {
  testResults.total++;
  console.log(`\n${colors.blue}🧪 Testing: ${testName}${colors.reset}`);
  
  try {
    const result = await testFunction();
    if (result.success) {
      console.log(`${colors.green}✅ PASSED${colors.reset}`);
      testResults.passed++;
    } else {
      console.log(`${colors.red}❌ FAILED${colors.reset}`);
      console.log(`   Status: ${result.status}`);
      console.log(`   Error: ${result.error}`);
      if (result.data) {
        console.log(`   Response: ${JSON.stringify(result.data, null, 2)}`);
      }
      testResults.failed++;
    }
  } catch (error) {
    console.log(`${colors.red}❌ FAILED${colors.reset}`);
    console.log(`   Error: ${error.message}`);
    testResults.failed++;
  }
}

// Individual test functions
async function testHealthEndpoint() {
  return await makeRequest('GET', '/api/health');
}

async function testProfileGet() {
  return await makeRequest('GET', `/api/profile/profile/${TEST_USER_ID}`);
}

async function testProfileUpdate() {
  const updateData = {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    phone: '+962777280458'
  };
  return await makeRequest('PUT', `/api/profile/profile/${TEST_USER_ID}`, updateData);
}

async function testPasswordChange() {
  const passwordData = {
    currentPassword: 'oldpassword123',
    newPassword: 'newpassword123'
  };
  return await makeRequest('PUT', `/api/profile/profile/${TEST_USER_ID}/password`, passwordData);
}

async function testPaymentMethodsGet() {
  return await makeRequest('GET', `/api/profile/payment-methods/${TEST_USER_ID}`);
}

async function testPaymentMethodAdd() {
  const paymentData = {
    cardHolderName: 'John Doe',
    cardNumber: '4111111111111111',
    expiryDate: '12/25',
    cvv: '123',
    brand: 'Visa'
  };
  return await makeRequest('POST', `/api/profile/payment-methods/${TEST_USER_ID}`, paymentData);
}

async function testUserSettingsGet() {
  return await makeRequest('GET', `/api/profile/settings/${TEST_USER_ID}`);
}

async function testUserSettingsUpdate() {
  const settingsData = {
    language: 'en',
    theme: 'light',
    notifications: {
      generalNotification: true,
      sound: true,
      soundCall: true,
      vibrate: false,
      appointmentReminders: true,
      payments: true
    },
    privacy: {
      profileVisibility: 'public',
      dataSharing: false,
      marketingEmails: false
    }
  };
  return await makeRequest('PUT', `/api/profile/settings/${TEST_USER_ID}`, settingsData);
}

async function testNotificationSettingsUpdate() {
  const notificationSettings = {
    generalNotification: true,
    sound: true,
    soundCall: true,
    vibrate: false,
    appointmentReminders: true,
    payments: true
  };
  return await makeRequest('PUT', `/api/profile/settings/${TEST_USER_ID}/notifications`, notificationSettings);
}

async function testLanguageUpdate() {
  const languageData = { language: 'ar' };
  return await makeRequest('PUT', `/api/profile/settings/${TEST_USER_ID}/language`, languageData);
}

async function testUserSearch() {
  return await makeRequest('GET', '/api/profile/search?q=john&limit=10');
}

async function testUserCount() {
  return await makeRequest('GET', '/api/profile/count');
}

async function testLocationsEndpoint() {
  return await makeRequest('GET', '/api/locations?lat=33.710435&lon=73.006143&radius=10000&limit=10');
}

async function testLocationSearch() {
  return await makeRequest('GET', '/api/search?q=hospital&limit=5');
}

async function testReverseGeocode() {
  return await makeRequest('GET', '/api/reverse-geocode?lat=33.710435&lon=73.006143');
}

// Main test runner
async function runAllTests() {
  console.log(`${colors.bold}${colors.blue}🚀 Starting Comprehensive Backend Tests${colors.reset}`);
  console.log(`${colors.yellow}Base URL: ${BASE_URL}${colors.reset}`);
  console.log(`${colors.yellow}Test User ID: ${TEST_USER_ID}${colors.reset}`);
  
  // Wait for server to start
  console.log('\n⏳ Waiting for server to start...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Test server health
  await runTest('Server Health Check', testHealthEndpoint);
  
  // Test Profile endpoints
  await runTest('Get User Profile', testProfileGet);
  await runTest('Update User Profile', testProfileUpdate);
  await runTest('Change Password', testPasswordChange);
  
  // Test Payment Methods endpoints
  await runTest('Get Payment Methods', testPaymentMethodsGet);
  await runTest('Add Payment Method', testPaymentMethodAdd);
  
  // Test User Settings endpoints
  await runTest('Get User Settings', testUserSettingsGet);
  await runTest('Update User Settings', testUserSettingsUpdate);
  await runTest('Update Notification Settings', testNotificationSettingsUpdate);
  await runTest('Update Language Preference', testLanguageUpdate);
  
  // Test Utility endpoints
  await runTest('Search Users', testUserSearch);
  await runTest('Get Users Count', testUserCount);
  
  // Test Location endpoints
  await runTest('Get Locations', testLocationsEndpoint);
  await runTest('Search Locations', testLocationSearch);
  await runTest('Reverse Geocoding', testReverseGeocode);
  
  // Print summary
  console.log(`\n${colors.bold}📊 Test Summary:${colors.reset}`);
  console.log(`${colors.green}✅ Passed: ${testResults.passed}${colors.reset}`);
  console.log(`${colors.red}❌ Failed: ${testResults.failed}${colors.reset}`);
  console.log(`${colors.blue}📈 Total: ${testResults.total}${colors.reset}`);
  
  const successRate = ((testResults.passed / testResults.total) * 100).toFixed(1);
  console.log(`${colors.bold}🎯 Success Rate: ${successRate}%${colors.reset}`);
  
  if (testResults.failed === 0) {
    console.log(`\n${colors.green}${colors.bold}🎉 All tests passed! Backend is fully operational.${colors.reset}`);
  } else {
    console.log(`\n${colors.yellow}${colors.bold}⚠️  Some tests failed. Check the output above for details.${colors.reset}`);
  }
}

// Run the tests
runAllTests().catch(error => {
  console.error(`${colors.red}❌ Test runner error: ${error.message}${colors.reset}`);
  process.exit(1);
});
