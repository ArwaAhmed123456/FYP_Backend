const authService = require('./services/auth');
const UserModel = require('./models/UserModel');

async function troubleshootLogin() {
  try {
    console.log('🔍 Troubleshooting Login Error...');
    console.log('');
    
    console.log('1️⃣ Checking current user in database:');
    const user = await UserModel.getUserByEmail('test@example.com');
    if (user) {
      console.log('   👤 User found:', user.firstName, user.lastName);
      console.log('   📧 Email:', user.emailAddress);
      console.log('   🔒 Password hash:', user.password.substring(0, 30) + '...');
      console.log('   📏 Password length:', user.password.length);
      console.log('   🔍 Is hashed:', user.password.startsWith('$2b$') || user.password.startsWith('$2a$'));
      console.log('');
      
      console.log('2️⃣ Testing login with current password:');
      const loginResult = await authService.login('test@example.com', 'PlainText123');
      console.log('   ✅ Login result:', loginResult.success ? 'SUCCESS' : 'FAILED');
      
      if (!loginResult.success) {
        console.log('   ❌ Login error:', loginResult.error);
        console.log('');
        
        console.log('3️⃣ Testing with different passwords:');
        const testPasswords = ['NewSecurePass456!', 'TestPass123!', 'PlainText123'];
        for (const pwd of testPasswords) {
          const testResult = await authService.login('test@example.com', pwd);
          console.log('   🔑 Password "' + pwd + '":', testResult.success ? 'SUCCESS' : 'FAILED');
        }
      }
    } else {
      console.log('   ❌ User not found - need to create new user');
      console.log('');
      console.log('4️⃣ Creating new test user:');
      const registerResult = await authService.register({
        firstName: 'Test',
        lastName: 'User',
        emailAddress: 'test@example.com',
        password: 'TestPass123!',
        phone: '+92 300 123 4567',
        gender: 'Male',
        Age: '25'
      });
      console.log('   ✅ Registration result:', registerResult.success ? 'SUCCESS' : 'FAILED');
      
      if (registerResult.success) {
        console.log('   🎉 New user created! Use these credentials:');
        console.log('   📧 Email: test@example.com');
        console.log('   🔑 Password: TestPass123!');
      }
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

troubleshootLogin();
