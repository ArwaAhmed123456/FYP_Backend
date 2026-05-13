const bcrypt = require('bcryptjs');
const UserModel = require('./models/UserModel');

async function resetUserPassword(email, newPassword) {
  try {
    console.log(`Starting password reset for: ${email}`);
    
    // Find the user by email
    const user = await UserModel.getUserByEmail(email);
    if (!user) {
      console.error(`User not found with email: ${email}`);
      return { success: false, message: 'User not found' };
    }

    console.log(`User found: ${user.firstName} ${user.lastName} (ID: ${user._id})`);

    // Hash the new password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    
    console.log(`Password hashed successfully. Length: ${hashedPassword.length}`);

    // Update the password in the database
    const updateResult = await UserModel.updatePassword(user._id, hashedPassword);
    
    console.log('Password update result:', {
      matchedCount: updateResult.matchedCount,
      modifiedCount: updateResult.modifiedCount,
      acknowledged: updateResult.acknowledged
    });

    if (updateResult.modifiedCount > 0) {
      console.log(`✅ Password successfully reset for ${email}`);
      return { 
        success: true, 
        message: `Password successfully reset for ${email}`,
        userId: user._id,
        userName: `${user.firstName} ${user.lastName}`
      };
    } else {
      console.error(`❌ Failed to update password for ${email}`);
      return { success: false, message: 'Failed to update password' };
    }

  } catch (error) {
    console.error('Error resetting password:', error);
    return { success: false, message: error.message };
  }
}

// Main execution
async function main() {
  const email = 'M33na.04@gmail.com';
  const newPassword = 'NewPassword123!'; // You can change this to any secure password
  
  console.log('='.repeat(50));
  console.log('PASSWORD RESET SCRIPT');
  console.log('='.repeat(50));
  
  const result = await resetUserPassword(email, newPassword);
  
  console.log('='.repeat(50));
  console.log('RESULT:', result);
  console.log('='.repeat(50));
  
  if (result.success) {
    console.log(`\n🔐 New password for ${email}: ${newPassword}`);
    console.log('⚠️  Please inform the user to change this password after login.');
  }
  
  process.exit(0);
}

// Run the script
main().catch(error => {
  console.error('Script execution failed:', error);
  process.exit(1);
});
