const UserModel = require('./models/UserModel');

async function checkUserDetails() {
  try {
    const collection = await UserModel.getCollection();
    const user = await collection.findOne({ phone: { $regex: '920000000000', $options: 'i' } });
    
    if (user) {
      console.log('User found:');
      console.log('Email:', user.emailAddress);
      console.log('Phone:', user.phone);
      console.log('Password hash:', user.password.substring(0, 20) + '...');
      console.log('Password length:', user.password.length);
      console.log('Is Active:', user.isActive);
    } else {
      console.log('No user found');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkUserDetails();
