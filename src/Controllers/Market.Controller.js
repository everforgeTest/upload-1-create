const {
  createEvent,
  listEvents,
  getEvent,
  placeBet,
  resolveEvent,
  claim,
  getInfo
} = require('../Services/Market.Service');

const { isPositiveInt, requireString, requireArray } = require('../Utils/Validators');

async function handleMarket({ ctx, pubkey, cfg, req }) {
  switch (req.action) {
    case 'getInfo':
      return getInfo(cfg);

    case 'createEvent': {
      const title = requireString('title', req.title, cfg.market?.maxTitleLength || 140);
      const description = typeof req.description === 'string' ? req.description.slice(0, cfg.market?.maxDescriptionLength || 2000) : '';
      const closesAt = Number(req.closesAt);
      if (!Number.isFinite(closesAt) || closesAt <= Date.now()) throw new Error('closesAt must be a future epoch ms timestamp');

      const outcomes = requireArray('outcomes', req.outcomes, { min: 2, max: 10 }).map(o => requireString('outcome', o, 32).toUpperCase());
      // enforce YES/NO by requirement, but still allow custom if desired; here we enforce exactly YES/NO.
      if (!(outcomes.length === 2 && outcomes.includes('YES') && outcomes.includes('NO'))) {
        throw new Error('outcomes must be exactly ["YES","NO"]');
      }

      return createEvent(cfg, pubkey, { title, description, closesAt, outcomes });
    }

    case 'listEvents': {
      const status = req.status ? String(req.status).toUpperCase() : undefined;
      if (status && !['OPEN', 'CLOSED', 'RESOLVED'].includes(status)) throw new Error('invalid status');
      return listEvents(cfg, { status });
    }

    case 'getEvent': {
      const eventId = requireString('eventId', req.eventId, 64);
      return getEvent(cfg, { eventId });
    }

    case 'placeBet': {
      const eventId = requireString('eventId', req.eventId, 64);
      const outcome = requireString('outcome', req.outcome, 32).toUpperCase();
      const amount = req.amount;
      if (!isPositiveInt(amount)) throw new Error('amount must be positive integer');
      if (amount < (cfg.market?.minBet || 1)) throw new Error(`amount must be >= ${cfg.market?.minBet || 1}`);
      return placeBet(cfg, pubkey, { eventId, outcome, amount });
    }

    case 'resolveEvent': {
      const eventId = requireString('eventId', req.eventId, 64);
      const winningOutcome = requireString('winningOutcome', req.winningOutcome, 32).toUpperCase();
      if (!['YES', 'NO'].includes(winningOutcome)) throw new Error('winningOutcome must be YES or NO');
      return resolveEvent(cfg, pubkey, { eventId, winningOutcome });
    }

    case 'claim': {
      const eventId = requireString('eventId', req.eventId, 64);
      return claim(cfg, pubkey, { eventId });
    }

    default:
      throw new Error(`Unsupported market action: ${req.action}`);
  }
}

module.exports = { handleMarket };
