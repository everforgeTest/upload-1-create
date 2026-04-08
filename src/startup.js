const HotPocket = require('hotpocket-nodejs-contract');

const { loadConfig } = require('./Utils/Config');
const { initDbIfNeeded } = require('./Data.Deploy/initDB');
const { sendOk, sendErr } = require('./Utils/Response.Helper');
const { routeRequest } = require('./routes');

const contract = {
  cfg: null,
  db: null,

  async init(ctx) {
    this.cfg = loadConfig();
    await initDbIfNeeded(this.cfg);

    ctx.log('Prediction market contract initialized.');

    ctx.on('user_message', async (user, msg) => {
      try {
        let req;
        if (Buffer.isBuffer(msg)) {
          // If the client chose BSON, msg can be a buffer; but most clients use JSON.
          // HotPocket will pass decoded object in most setups. We still guard.
          try {
            req = JSON.parse(msg.toString('utf8'));
          } catch (_) {
            return sendErr(ctx, user, 'INVALID_MESSAGE', 'Message must be JSON object.');
          }
        } else {
          req = msg;
        }

        if (!req || typeof req !== 'object')
          return sendErr(ctx, user, 'INVALID_MESSAGE', 'Message must be a JSON object.');

        const pubkey = user.publicKey;
        const result = await routeRequest({ ctx, pubkey, cfg: this.cfg, req });
        return sendOk(ctx, user, result);
      } catch (e) {
        ctx.log(`Error handling user message: ${e?.stack || e}`);
        return sendErr(ctx, user, 'INTERNAL_ERROR', e.message || 'Internal error');
      }
    });
  }
};

const hpc = new HotPocket.Contract();
hpc.init(contract);
