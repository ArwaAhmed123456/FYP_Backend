const UserModel = require('./models/UserModel');
const { ObjectId } = require('mongodb');

async function createTestUser() {
  try {
    console.log('Creating test user...');
    
    const testUserData = {
      firstName: 'John',
      lastName: 'Doe',
      emailAddress: 'john.doe@example.com',
      phone: '+962777280458',
      password: 'testpassword123',
      Age: '35',
      gender: 'male',
      dateOfBirth: '1990-01-01',
      address: '123 Test Street, Test City',
      profileImage: null,
      status: 'active'
    };

    const result = await UserModel.createUser(testUserData);
    console.log('✅ Test user created successfully!');
    console.log('User ID:', result.insertedId);
    console.log('Email:', testUserData.email);
    
    return result.insertedId;
  } catch (error) {
    console.error('❌ Error creating test user:', error);
    throw error;
  }
}

// Run the function
createTestUser()
  .then((userId) => {
    console.log('\n🎉 Test user creation completed!');
    console.log('You can now use this User ID in your frontend:', userId);
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed to create test user:', error);
    process.exit(1);
  });
