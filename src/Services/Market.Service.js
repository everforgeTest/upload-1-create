const { v4: uuidv4 } = require('uuid');
const { openDb, run, get, all, tx } = require('./db');
const { debit, credit, ensureAccount } = require('./Wallet.Service');

function nowMs() {
  return Date.now();
}

async function createEvent(cfg, pubkey, { title, description, closesAt, outcomes }) {
  const db = openDb(cfg.dbPath);
  await ensureAccount(cfg, pubkey);

  const eventId = uuidv4();
  const createdAt = nowMs();

  return tx(db, async () => {
    await run(db, `
      INSERT INTO events(event_id, creator_pubkey, title, description, status, closes_at, created_at)
      VALUES(?, ?, ?, ?, 'OPEN', ?, ?)
    `, [eventId, pubkey, title, description || '', closesAt, createdAt]);

    for (const o of outcomes) {
      await run(db, `INSERT INTO event_outcomes(event_id, outcome) VALUES(?, ?)`, [eventId, o]);
    }

    return { eventId };
  });
}

async function listEvents(cfg, { status }) {
  const db = openDb(cfg.dbPath);
  const params = [];
  let where = '';
  if (status) {
    where = 'WHERE status = ?';
    params.push(status);
  }
  const rows = await all(db, `SELECT event_id AS eventId, title, status, closes_at AS closesAt, created_at AS createdAt, winning_outcome AS winningOutcome FROM events ${where} ORDER BY created_at DESC`, params);
  return { events: rows };
}

async function getEvent(cfg, { eventId }) {
  const db = openDb(cfg.dbPath);
  const ev = await get(db, `SELECT event_id AS eventId, creator_pubkey AS creatorPubkey, title, description, status, closes_at AS closesAt, created_at AS createdAt, resolved_at AS resolvedAt, winning_outcome AS winningOutcome FROM events WHERE event_id = ?`, [eventId]);
  if (!ev) throw new Error('EVENT_NOT_FOUND');

  const outcomes = await all(db, `SELECT outcome FROM event_outcomes WHERE event_id = ? ORDER BY outcome`, [eventId]);

  const totals = await all(db, `
    SELECT outcome, SUM(amount) AS total
    FROM bets
    WHERE event_id = ?
    GROUP BY outcome
  `, [eventId]);

  return {
    event: {
      ...ev,
      outcomes: outcomes.map(o => o.outcome),
      totals: totals.reduce((acc, r) => {
        acc[r.outcome] = r.total ? Number(r.total) : 0;
        return acc;
      }, {})
    }
  };
}

async function placeBet(cfg, pubkey, { eventId, outcome, amount }) {
  const db = openDb(cfg.dbPath);
  await ensureAccount(cfg, pubkey);

  return tx(db, async () => {
    const ev = await get(db, `SELECT status, closes_at AS closesAt FROM events WHERE event_id = ?`, [eventId]);
    if (!ev) throw new Error('EVENT_NOT_FOUND');
    if (ev.status !== 'OPEN') throw new Error('EVENT_NOT_OPEN');
    if (Number(ev.closesAt) <= nowMs()) {
      await run(db, `UPDATE events SET status = 'CLOSED' WHERE event_id = ? AND status = 'OPEN'`, [eventId]);
      throw new Error('BETTING_CLOSED');
    }

    const okOutcome = await get(db, `SELECT 1 AS ok FROM event_outcomes WHERE event_id = ? AND outcome = ?`, [eventId, outcome]);
    if (!okOutcome) throw new Error('INVALID_OUTCOME');

    // debit first
    await debit(cfg, pubkey, amount);

    const betId = uuidv4();
    await run(db, `
      INSERT INTO bets(bet_id, event_id, bettor_pubkey, outcome, amount, created_at)
      VALUES(?, ?, ?, ?, ?, ?)
    `, [betId, eventId, pubkey, outcome, amount, nowMs()]);

    return { betId };
  });
}

async function resolveEvent(cfg, pubkey, { eventId, winningOutcome }) {
  if (!cfg.adminPubkeyHex) throw new Error('ADMIN_NOT_CONFIGURED');
  if (pubkey !== cfg.adminPubkeyHex) throw new Error('NOT_AUTHORIZED');

  const db = openDb(cfg.dbPath);

  return tx(db, async () => {
    const ev = await get(db, `SELECT status FROM events WHERE event_id = ?`, [eventId]);
    if (!ev) throw new Error('EVENT_NOT_FOUND');
    if (ev.status === 'RESOLVED') throw new Error('ALREADY_RESOLVED');

    const okOutcome = await get(db, `SELECT 1 AS ok FROM event_outcomes WHERE event_id = ? AND outcome = ?`, [eventId, winningOutcome]);
    if (!okOutcome) throw new Error('INVALID_OUTCOME');

    // Close if still open and time passed.
    await run(db, `UPDATE events SET status = CASE WHEN status='OPEN' THEN 'CLOSED' ELSE status END WHERE event_id = ?`, [eventId]);

    await run(db, `
      UPDATE events
      SET status = 'RESOLVED', winning_outcome = ?, resolved_at = ?
      WHERE event_id = ?
    `, [winningOutcome, nowMs(), eventId]);

    return { eventId, winningOutcome };
  });
}

async function claim(cfg, pubkey, { eventId }) {
  const db = openDb(cfg.dbPath);
  await ensureAccount(cfg, pubkey);

  return tx(db, async () => {
    const ev = await get(db, `SELECT status, winning_outcome AS winningOutcome FROM events WHERE event_id = ?`, [eventId]);
    if (!ev) throw new Error('EVENT_NOT_FOUND');
    if (ev.status !== 'RESOLVED') throw new Error('EVENT_NOT_RESOLVED');

    const already = await get(db, `SELECT 1 AS ok FROM claims WHERE event_id = ? AND claimant_pubkey = ?`, [eventId, pubkey]);
    if (already) throw new Error('ALREADY_CLAIMED');

    const win = ev.winningOutcome;

    const totals = await all(db, `
      SELECT outcome, SUM(amount) AS total
      FROM bets
      WHERE event_id = ?
      GROUP BY outcome
    `, [eventId]);

    const totalPool = totals.reduce((s, r) => s + Number(r.total || 0), 0);
    const winPool = totals.reduce((s, r) => s + (r.outcome === win ? Number(r.total || 0) : 0), 0);

    if (totalPool <= 0) {
      await run(db, `INSERT INTO claims(event_id, claimant_pubkey, payout, claimed_at) VALUES(?, ?, 0, ?)`, [eventId, pubkey, nowMs()]);
      return { payout: 0, note: 'No bets placed.' };
    }

    // Sum claimant winning bets
    const myWin = await get(db, `
      SELECT SUM(amount) AS amt
      FROM bets
      WHERE event_id = ? AND bettor_pubkey = ? AND outcome = ?
    `, [eventId, pubkey, win]);

    const myWinAmt = Number(myWin?.amt || 0);
    if (myWinAmt <= 0) {
      await run(db, `INSERT INTO claims(event_id, claimant_pubkey, payout, claimed_at) VALUES(?, ?, 0, ?)`, [eventId, pubkey, nowMs()]);
      return { payout: 0, note: 'No winning bets for this user.' };
    }

    // Pari-mutuel payout: payout = floor(myWinAmt / winPool * totalPool)
    // This includes original stake, consistent with pool sharing.
    const payout = Math.floor((myWinAmt * totalPool) / winPool);

    await credit(cfg, pubkey, payout);
    await run(db, `INSERT INTO claims(event_id, claimant_pubkey, payout, claimed_at) VALUES(?, ?, ?, ?)`, [eventId, pubkey, payout, nowMs()]);

    return { payout, totalPool, winPool, myWinAmt };
  });
}

function getInfo(cfg) {
  return {
    contract: 'prediction-market-contract',
    dbPath: cfg.dbPath,
    adminConfigured: Boolean(cfg.adminPubkeyHex)
  };
}

module.exports = {
  createEvent,
  listEvents,
  getEvent,
  placeBet,
  resolveEvent,
  claim,
  getInfo
};
