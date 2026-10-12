require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 5000,
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/sunday_circle',
  JWT_SECRET: process.env.JWT_SECRET || 'sunday_circle_ultra_secure_jwt_secret_key_2026_x!9qZ',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  NODE_ENV: process.env.NODE_ENV || 'development',
};
