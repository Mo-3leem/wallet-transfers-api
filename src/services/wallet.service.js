import { pool } from "../db/pool.js";
import { v4 as uuidv4 } from "uuid";
import { httpError } from "../utils/httpError.js";

export async function createWallet({ currency = "EGP" } = {}) {
  const id = uuidv4();
  const q = `
    INSERT INTO wallets(id, balance_cents, currency, status)
    VALUES ($1, 0, $2, 'active')
    RETURNING *;
  `;
  const { rows } = await pool.query(q, [id, currency]);
  return rows[0];
}

export async function getWallet(id, { includeDeleted = false } = {}) {
  const { rows } = await pool.query(`SELECT * FROM wallets WHERE id=$1`, [id]);
  if (!rows[0]) throw httpError(404, "Wallet not found");

  if (!includeDeleted && rows[0].status !== "active") {
    throw httpError(404, "Wallet not found");
  }

  return rows[0];
}

export async function deleteWallet(walletId) {
  const { rows } = await pool.query(
    `UPDATE wallets
     SET status='deleted', updated_at=NOW()
     WHERE id=$1 AND status='active'
     RETURNING *`,
    [walletId],
  );

  if (!rows[0]) throw httpError(404, "Wallet not found");

  return rows[0];
}
export async function restoreWallet(walletId) {
  const { rows } = await pool.query(
    `UPDATE wallets
     SET status='active', updated_at=NOW()
     WHERE id=$1 AND status='deleted'
     RETURNING *`,
    [walletId],
  );

  if (!rows[0]) throw httpError(404, "Wallet not found or not deleted");
  return rows[0];
}

export async function listWallets(limit = 50) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const { rows } = await pool.query(
    `SELECT * FROM wallets ORDER BY created_at DESC LIMIT $1`,
    [lim],
  );
  return rows;
}

export async function getLedger(walletId, limit = 50) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const { rows } = await pool.query(
    `SELECT * FROM ledger_entries
     WHERE wallet_id=$1
     ORDER BY created_at DESC
     LIMIT $2`,
    [walletId, lim],
  );
  return rows;
}

export async function deposit(walletId, amount_cents) {
  const amt = BigInt(amount_cents);
  if (amt <= 0n) throw httpError(400, "amount_cents must be > 0");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const w = await client.query(
      `SELECT * FROM wallets WHERE id=$1 FOR UPDATE`,
      [walletId],
    );
    if (!w.rows[0]) throw httpError(404, "Wallet not found");
    if (w.rows[0].status !== "active")
      throw httpError(400, "Wallet is not active");

    await client.query(
      `UPDATE wallets SET balance_cents = balance_cents + $1, updated_at=NOW() WHERE id=$2`,
      [amount_cents, walletId],
    );

    const entryId = uuidv4();
    await client.query(
      `INSERT INTO ledger_entries(id, wallet_id, type, amount_cents)
       VALUES ($1,$2,'DEPOSIT',$3)`,
      [entryId, walletId, amount_cents],
    );

    const updated = await client.query(`SELECT * FROM wallets WHERE id=$1`, [
      walletId,
    ]);
    await client.query("COMMIT");
    return updated.rows[0];
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function withdraw(walletId, amount_cents) {
  const amt = BigInt(amount_cents);
  if (amt <= 0n) throw httpError(400, "amount_cents must be > 0");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const w = await client.query(
      `SELECT * FROM wallets WHERE id=$1 FOR UPDATE`,
      [walletId],
    );
    if (!w.rows[0]) throw httpError(404, "Wallet not found");
    if (w.rows[0].status !== "active")
      throw httpError(400, "Wallet is not active");

    const bal = BigInt(w.rows[0].balance_cents);
    if (bal < amt) throw httpError(400, "Insufficient funds");

    await client.query(
      `UPDATE wallets SET balance_cents = balance_cents - $1, updated_at=NOW() WHERE id=$2`,
      [amount_cents, walletId],
    );

    const entryId = uuidv4();
    await client.query(
      `INSERT INTO ledger_entries(id, wallet_id, type, amount_cents)
       VALUES ($1,$2,'WITHDRAW',$3)`,
      [entryId, walletId, amount_cents],
    );

    const updated = await client.query(`SELECT * FROM wallets WHERE id=$1`, [
      walletId,
    ]);
    await client.query("COMMIT");
    return updated.rows[0];
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
