const fs = require('fs');
const path = require('path');

function loadConfig() {
  const settingsPath = path.join(__dirname, '..', 'settings.json');
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

  const dbPath = process.env.DB_PATH || settings.dbPath || 'prediction_market.db';
  const adminPubkeyHex = (process.env.ADMIN_PUBKEY_HEX || '').trim();

  return {
    dbPath,
    adminPubkeyHex,
    market: settings.market || { minBet: 1 }
  };
}

module.exports = { loadConfig };
