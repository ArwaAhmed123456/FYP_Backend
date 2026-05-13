const { connectToMongoDB, getDatabase, testConnection, healthCheck } = require('./services/mongodb');
const UserModel = require('./models/UserModel');
const PaymentMethodModel = require('./models/PaymentMethodModel');
const UserSettingsModel = require('./models/UserSettingsModel');

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
      console.log(`   Error: ${result.error}`);
      testResults.failed++;
    }
  } catch (error) {
    console.log(`${colors.red}❌ FAILED${colors.reset}`);
    console.log(`   Error: ${error.message}`);
    testResults.failed++;
  }
}

// Individual test functions
async function testMongoConnection() {
  try {
    const connected = await testConnection();
    return { success: connected, error: connected ? null : 'Connection failed' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function testMongoHealthCheck() {
  try {
    const health = await healthCheck();
    return { success: health.status === 'healthy', error: health.error || null };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function testDatabaseAccess() {
  try {
    const db = await getDatabase();
    const collections = await db.listCollections().toArray();
    return { success: true, error: null, data: collections };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function testUserModelOperations() {
  try {
    // Test creating a test user
    const testUser = {
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      phone: '+1234567890',
      password: 'testpassword123'
    };
    
    const createResult = await UserModel.createUser(testUser);
    console.log(`   Created user with ID: ${createResult.insertedId}`);
    
    // Test getting the user
    const getUser = await UserModel.getUserById(createResult.insertedId);
    console.log(`   Retrieved user: ${getUser ? getUser.firstName : 'Not found'}`);
    
    // Test updating the user
    const updateResult = await UserModel.updateUser(createResult.insertedId, { firstName: 'Updated' });
    console.log(`   Updated user: ${updateResult.modifiedCount} documents modified`);
    
    // Test searching users
    const searchResult = await UserModel.searchUsers('Test');
    console.log(`   Search results: ${searchResult.length} users found`);
    
    // Test getting users count
    const countResult = await UserModel.getUsersCount();
    console.log(`   Total users: ${countResult}`);
    
    // Clean up - delete the test user
    await UserModel.deleteUser(createResult.insertedId);
    console.log(`   Cleaned up test user`);
    
    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function testPaymentMethodModelOperations() {
  try {
    // First create a test user
    const testUser = {
      firstName: 'Test',
      lastName: 'User',
      email: 'testpayment@example.com',
      phone: '+1234567890',
      password: 'testpassword123'
    };
    
    const createUserResult = await UserModel.createUser(testUser);
    const userId = createUserResult.insertedId;
    
    // Test creating a payment method
    const paymentData = {
      cardHolderName: 'Test User',
      cardNumber: '**** **** **** 1234',
      last4: '1234',
      expiryDate: '12/25',
      brand: 'Visa',
      type: 'Credit Card'
    };
    
    const createPaymentResult = await PaymentMethodModel.addPaymentMethod(userId, paymentData);
    console.log(`   Created payment method with ID: ${createPaymentResult.insertedId}`);
    
    // Test getting user payment methods
    const getPaymentsResult = await PaymentMethodModel.getUserPaymentMethods(userId);
    console.log(`   Retrieved ${getPaymentsResult.length} payment methods`);
    
    // Test updating payment method
    const updateResult = await PaymentMethodModel.updatePaymentMethod(createPaymentResult.insertedId, { cardHolderName: 'Updated Name' });
    console.log(`   Updated payment method: ${updateResult.modifiedCount} documents modified`);
    
    // Test setting default payment method
    const setDefaultResult = await PaymentMethodModel.setDefaultPaymentMethod(userId, createPaymentResult.insertedId);
    console.log(`   Set default payment method: ${setDefaultResult.modifiedCount} documents modified`);
    
    // Clean up
    await PaymentMethodModel.deletePaymentMethod(createPaymentResult.insertedId);
    await UserModel.deleteUser(userId);
    console.log(`   Cleaned up test data`);
    
    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function testUserSettingsModelOperations() {
  try {
    // First create a test user
    const testUser = {
      firstName: 'Test',
      lastName: 'User',
      email: 'testsettings@example.com',
      phone: '+1234567890',
      password: 'testpassword123'
    };
    
    const createUserResult = await UserModel.createUser(testUser);
    const userId = createUserResult.insertedId;
    
    // Test creating user settings
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
    
    const createSettingsResult = await UserSettingsModel.upsertUserSettings(userId, settingsData);
    console.log(`   Created/updated user settings: ${createSettingsResult.upsertedId || createSettingsResult.modifiedCount} documents affected`);
    
    // Test getting user settings
    const getSettingsResult = await UserSettingsModel.getUserSettings(userId);
    console.log(`   Retrieved settings: ${getSettingsResult ? getSettingsResult.language : 'Not found'}`);
    
    // Test updating notification settings
    const notificationSettings = {
      generalNotification: false,
      sound: false,
      soundCall: true,
      vibrate: true,
      appointmentReminders: true,
      payments: false
    };
    
    const updateNotificationsResult = await UserSettingsModel.updateNotificationSettings(userId, notificationSettings);
    console.log(`   Updated notification settings: ${updateNotificationsResult.modifiedCount} documents modified`);
    
    // Test updating language preference
    const updateLanguageResult = await UserSettingsModel.updateLanguagePreference(userId, 'ar');
    console.log(`   Updated language preference: ${updateLanguageResult.modifiedCount} documents modified`);
    
    // Clean up
    await UserSettingsModel.deleteUserSettings(userId);
    await UserModel.deleteUser(userId);
    console.log(`   Cleaned up test data`);
    
    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Main test runner
async function runDatabaseTests() {
  console.log(`${colors.bold}${colors.blue}🗄️  Starting Database Tests${colors.reset}`);
  
  // Test MongoDB connection
  await runTest('MongoDB Connection', testMongoConnection);
  await runTest('MongoDB Health Check', testMongoHealthCheck);
  await runTest('Database Access', testDatabaseAccess);
  
  // Test Models
  await runTest('User Model Operations', testUserModelOperations);
  await runTest('Payment Method Model Operations', testPaymentMethodModelOperations);
  await runTest('User Settings Model Operations', testUserSettingsModelOperations);
  
  // Print summary
  console.log(`\n${colors.bold}📊 Database Test Summary:${colors.reset}`);
  console.log(`${colors.green}✅ Passed: ${testResults.passed}${colors.reset}`);
  console.log(`${colors.red}❌ Failed: ${testResults.failed}${colors.reset}`);
  console.log(`${colors.blue}📈 Total: ${testResults.total}${colors.reset}`);
  
  const successRate = ((testResults.passed / testResults.total) * 100).toFixed(1);
  console.log(`${colors.bold}🎯 Success Rate: ${successRate}%${colors.reset}`);
  
  if (testResults.failed === 0) {
    console.log(`\n${colors.green}${colors.bold}🎉 All database tests passed!${colors.reset}`);
  } else {
    console.log(`\n${colors.yellow}${colors.bold}⚠️  Some database tests failed. Check the output above for details.${colors.reset}`);
  }
}

// Run the tests
runDatabaseTests().catch(error => {
  console.error(`${colors.red}❌ Database test runner error: ${error.message}${colors.reset}`);
  process.exit(1);
});
