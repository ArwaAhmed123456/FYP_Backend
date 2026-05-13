const UserModel = require('./models/UserModel');

async function checkPhoneUsers() {
  try {
    const collection = await UserModel.getCollection();
    const users = await collection.find({ phone: { $exists: true, $ne: null } }).toArray();
    
    console.log('Users with phone numbers:');
    users.forEach(user => {
      console.log('Email:', user.emailAddress, 'Phone:', user.phone);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkPhoneUsers();
