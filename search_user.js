const UserModel = require('./models/UserModel');

async function searchForUser() {
  try {
    console.log('🔍 Searching for M33na A1i in database...');
    console.log('');
    
    console.log('📋 All users in database:');
    const users = await UserModel.getAllUsers(100);
    users.forEach((user, index) => {
      console.log('   ' + (index + 1) + '. Name:', user.firstName, user.lastName);
      console.log('      Email:', user.emailAddress);
      console.log('      Phone:', user.phone);
      console.log('      Active:', user.isActive);
      console.log('');
    });
    
    console.log('🔍 Searching specifically for M33na A1i...');
    const searchResults = await UserModel.searchUsers('M33na');
    if (searchResults.length > 0) {
      console.log('✅ Found matching users:');
      searchResults.forEach((user, index) => {
        console.log('   ' + (index + 1) + '. Name:', user.firstName, user.lastName);
        console.log('      Email:', user.emailAddress);
        console.log('      Phone:', user.phone);
        console.log('');
      });
    } else {
      console.log('❌ No users found matching "M33na"');
    }
    
    // Also search for "A1i"
    const searchResults2 = await UserModel.searchUsers('A1i');
    if (searchResults2.length > 0) {
      console.log('✅ Found users with "A1i":');
      searchResults2.forEach((user, index) => {
        console.log('   ' + (index + 1) + '. Name:', user.firstName, user.lastName);
        console.log('      Email:', user.emailAddress);
        console.log('      Phone:', user.phone);
        console.log('');
      });
    } else {
      console.log('❌ No users found matching "A1i"');
    }
    
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

searchForUser();
