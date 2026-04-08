const { openDb, run, get } = require('../Services/db');

async function initDbIfNeeded(cfg) {
  const db = openDb(cfg.dbPath);

  await run(db, `PRAGMA journal_mode = WAL`);
  await run(db, `PRAGMA foreign_keys = ON`);

  // schema versioning
  await run(db, `
    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  const v = await get(db, `SELECT value FROM schema_meta WHERE key = 'schema_version'`);
  if (!v) {
    await createSchemaV1(db);
    await run(db, `INSERT INTO schema_meta(key, value) VALUES('schema_version', '1')`);
  }
}

async function createSchemaV1(db) {
  await run(db, `
    CREATE TABLE IF NOT EXISTS accounts (
      pubkey TEXT PRIMARY KEY,
      balance INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    )
  `);

  await run(db, `
    CREATE TABLE IF NOT EXISTS events (
      event_id TEXT PRIMARY KEY,
      creator_pubkey TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK(status IN ('OPEN','CLOSED','RESOLVED')),
      closes_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      resolved_at INTEGER,
      winning_outcome TEXT,
      FOREIGN KEY(creator_pubkey) REFERENCES accounts(pubkey)
    )
  `);

  await run(db, `CREATE INDEX IF NOT EXISTS idx_events_status ON events(status)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_events_closes_at ON events(closes_at)`);

  await run(db, `
    CREATE TABLE IF NOT EXISTS event_outcomes (
      event_id TEXT NOT NULL,
      outcome TEXT NOT NULL,
      PRIMARY KEY(event_id, outcome),
      FOREIGN KEY(event_id) REFERENCES events(event_id) ON DELETE CASCADE
    )
  `);

  await run(db, `
    CREATE TABLE IF NOT EXISTS bets (
      bet_id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      bettor_pubkey TEXT NOT NULL,
      outcome TEXT NOT NULL,
      amount INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(event_id) REFERENCES events(event_id) ON DELETE CASCADE,
      FOREIGN KEY(bettor_pubkey) REFERENCES accounts(pubkey),
      FOREIGN KEY(event_id, outcome) REFERENCES event_outcomes(event_id, outcome)
    )
  `);

  await run(db, `CREATE INDEX IF NOT EXISTS idx_bets_event ON bets(event_id)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_bets_bettor ON bets(bettor_pubkey)`);

  await run(db, `
    CREATE TABLE IF NOT EXISTS claims (
      event_id TEXT NOT NULL,
      claimant_pubkey TEXT NOT NULL,
      payout INTEGER NOT NULL,
      claimed_at INTEGER NOT NULL,
      PRIMARY KEY(event_id, claimant_pubkey),
      FOREIGN KEY(event_id) REFERENCES events(event_id) ON DELETE CASCADE,
      FOREIGN KEY(claimant_pubkey) REFERENCES accounts(pubkey)
    )
  `);
}

module.exports = { initDbIfNeeded };
