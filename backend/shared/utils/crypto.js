// backend/shared/utils/crypto.js
// ============================================

const crypto = require('crypto');
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;

async function hashPassword(password) {
  return await bcrypt.hash(password, SALT_ROUNDS);
}

async function comparePassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

function generateToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

function hashSHA256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

module.exports = {
  hashPassword,
  comparePassword,
  generateToken,
  hashSHA256,
};