const { handleMarket } = require('./Controllers/Market.Controller');
const { handleWallet } = require('./Controllers/Wallet.Controller');

async function routeRequest({ ctx, pubkey, cfg, req }) {
  const action = req.action;
  if (!action || typeof action !== 'string') throw new Error('Missing action');

  if ([
    'deposit',
    'getBalance'
  ].includes(action)) {
    return handleWallet({ ctx, pubkey, cfg, req });
  }

  if ([
    'getInfo',
    'createEvent',
    'listEvents',
    'getEvent',
    'placeBet',
    'resolveEvent',
    'claim'
  ].includes(action)) {
    return handleMarket({ ctx, pubkey, cfg, req });
  }

  throw new Error(`Unknown action: ${action}`);
}

module.exports = { routeRequest };
