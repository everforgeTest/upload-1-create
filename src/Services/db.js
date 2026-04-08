const sqlite3 = require('sqlite3');
const path = require('path');

let _db;

function openDb(dbPath) {
  if (_db) return _db;
  const resolved = path.resolve(process.cwd(), dbPath);
  _db = new sqlite3.Database(resolved);
  return _db;
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function tx(db, fn) {
  await run(db, 'BEGIN');
  try {
    const res = await fn();
    await run(db, 'COMMIT');
    return res;
  } catch (e) {
    try { await run(db, 'ROLLBACK'); } catch (_) {}
    throw e;
  }
}

module.exports = { openDb, run, get, all, tx };
