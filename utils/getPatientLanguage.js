/**
 * getPatientLanguage(userId)
 *
 * Looks up the patient's language preference from user_settings.
 * Returns 'ur' or 'en'. Always returns 'en' on failure — never throws.
 */
const UserSettingsModel = require('../models/UserSettingsModel');

async function getPatientLanguage(userId) {
  if (!userId) return 'en';
  try {
    const settings = await UserSettingsModel.getUserSettings(String(userId));
    return settings?.language === 'ur' ? 'ur' : 'en';
  } catch (err) {
    console.error('[getPatientLanguage] error:', err.message);
    return 'en';
  }
}

module.exports = { getPatientLanguage };
