const { deposit, getBalance } = require('../Services/Wallet.Service');
const { isPositiveInt } = require('../Utils/Validators');

async function handleWallet({ ctx, pubkey, cfg, req }) {
  switch (req.action) {
    case 'deposit': {
      const amount = req.amount;
      if (!isPositiveInt(amount)) throw new Error('amount must be positive integer');
      return deposit(cfg, pubkey, amount);
    }
    case 'getBalance':
      return getBalance(cfg, pubkey);

    default:
      throw new Error(`Unsupported wallet action: ${req.action}`);
  }
}

module.exports = { handleWallet };
