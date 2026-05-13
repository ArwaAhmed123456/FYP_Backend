const UserModel = require('./models/UserModel');

async function checkUserLogin() {
  try {
    const collection = await UserModel.getCollection();
    
    // Search for user with phone number containing 00000000000
    const user = await collection.findOne({ phone: { $regex: '00000000000', $options: 'i' } });
    
    if (user) {
      console.log('User found:');
      console.log('Email:', user.emailAddress);
      console.log('Phone:', user.phone);
      console.log('Password hash:', user.password.substring(0, 20) + '...');
      console.log('Is Active:', user.isActive);
      console.log('First Name:', user.firstName);
      console.log('Last Name:', user.lastName);
    } else {
      console.log('No user found with phone containing 00000000000');
      
      // Let's also check what users exist
      console.log('\nAll users with phone numbers:');
      const allUsers = await collection.find({ phone: { $exists: true, $ne: null } }).toArray();
      allUsers.forEach(user => {
        console.log('Phone:', user.phone, 'Email:', user.emailAddress);
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkUserLogin();
