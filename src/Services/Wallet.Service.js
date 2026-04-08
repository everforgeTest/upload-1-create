const { openDb, run, get, tx } = require('./db');

async function ensureAccount(cfg, pubkey) {
  const db = openDb(cfg.dbPath);
  await run(db, `INSERT OR IGNORE INTO accounts(pubkey, balance) VALUES(?, 0)`, [pubkey]);
}

async function deposit(cfg, pubkey, amount) {
  const db = openDb(cfg.dbPath);
  await ensureAccount(cfg, pubkey);

  return tx(db, async () => {
    await run(db, `UPDATE accounts SET balance = balance + ? WHERE pubkey = ?`, [amount, pubkey]);
    const row = await get(db, `SELECT balance FROM accounts WHERE pubkey = ?`, [pubkey]);
    return { balance: row.balance };
  });
}

async function getBalance(cfg, pubkey) {
  const db = openDb(cfg.dbPath);
  await ensureAccount(cfg, pubkey);
  const row = await get(db, `SELECT balance FROM accounts WHERE pubkey = ?`, [pubkey]);
  return { balance: row.balance };
}

async function debit(cfg, pubkey, amount) {
  const db = openDb(cfg.dbPath);
  await ensureAccount(cfg, pubkey);

  return tx(db, async () => {
    const row = await get(db, `SELECT balance FROM accounts WHERE pubkey = ?`, [pubkey]);
    if (!row || row.balance < amount) throw new Error('INSUFFICIENT_BALANCE');
    await run(db, `UPDATE accounts SET balance = balance - ? WHERE pubkey = ?`, [amount, pubkey]);
    const row2 = await get(db, `SELECT balance FROM accounts WHERE pubkey = ?`, [pubkey]);
    return { balance: row2.balance };
  });
}

async function credit(cfg, pubkey, amount) {
  const db = openDb(cfg.dbPath);
  await ensureAccount(cfg, pubkey);

  return tx(db, async () => {
    await run(db, `UPDATE accounts SET balance = balance + ? WHERE pubkey = ?`, [amount, pubkey]);
    const row = await get(db, `SELECT balance FROM accounts WHERE pubkey = ?`, [pubkey]);
    return { balance: row.balance };
  });
}

module.exports = { deposit, getBalance, debit, credit, ensureAccount };
