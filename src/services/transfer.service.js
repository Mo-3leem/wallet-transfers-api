import { pool } from "../db/pool.js";
import { v4 as uuidv4 } from "uuid";
import { httpError } from "../utils/httpError.js";
import { sha256 } from "../utils/hash.js";

export async function listTransfers(limit = 50) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const { rows } = await pool.query(
    `SELECT * FROM transfers ORDER BY created_at DESC LIMIT $1`,
    [lim],
  );
  return rows;
}

export async function createTransfer({
  from_wallet_id,
  to_wallet_id,
  amount_cents,
  idempotency_key,
}) {
  if (!idempotency_key) throw httpError(400, "Missing Idempotency-Key header");

  const amt = BigInt(amount_cents);
  if (amt <= 0n) throw httpError(400, "amount_cents must be > 0");
  if (from_wallet_id === to_wallet_id)
    throw httpError(400, "Cannot transfer to same wallet");

  const requestHash = sha256(
    `${from_wallet_id}|${to_wallet_id}|${amount_cents}`,
  );

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) Idempotency check
    const existing = await client.query(
      `SELECT * FROM transfers WHERE from_wallet_id=$1 AND idempotency_key=$2`,
      [from_wallet_id, idempotency_key],
    );

    if (existing.rows[0]) {
      const t = existing.rows[0];
      if (t.request_hash !== requestHash)
        throw httpError(409, "Idempotency key reused with different payload");
      await client.query("COMMIT");
      return t;
    }

    // 2) Create transfer (PENDING)
    const transferId = uuidv4();
    const created = await client.query(
      `INSERT INTO transfers(id, from_wallet_id, to_wallet_id, amount_cents, status, idempotency_key, request_hash)
       VALUES ($1,$2,$3,$4,'PENDING',$5,$6)
       RETURNING *`,
      [
        transferId,
        from_wallet_id,
        to_wallet_id,
        amount_cents,
        idempotency_key,
        requestHash,
      ],
    );

    // 3) Lock wallets in consistent order to avoid deadlocks
    const lockIds = [from_wallet_id, to_wallet_id].sort();
    const locked = await client.query(
      `SELECT id, balance_cents, status FROM wallets WHERE id = ANY($1) FOR UPDATE`,
      [lockIds],
    );
    if (locked.rowCount !== 2) throw httpError(404, "Wallet not found");

    const fromRow = locked.rows.find((r) => r.id === from_wallet_id);
    const toRow = locked.rows.find((r) => r.id === to_wallet_id);

    if (fromRow.status !== "active" || toRow.status !== "active")
      throw httpError(400, "Wallet is not active");

    const fromBal = BigInt(fromRow.balance_cents);
    if (fromBal < amt) throw httpError(400, "Insufficient funds");

    // 4) Update balances
    await client.query(
      `UPDATE wallets SET balance_cents = balance_cents - $1, updated_at=NOW() WHERE id=$2`,
      [amount_cents, from_wallet_id],
    );
    await client.query(
      `UPDATE wallets SET balance_cents = balance_cents + $1, updated_at=NOW() WHERE id=$2`,
      [amount_cents, to_wallet_id],
    );

    // 5) Ledger
    await client.query(
      `INSERT INTO ledger_entries(id, wallet_id, type, amount_cents, transfer_id)
       VALUES
        ($1,$2,'TRANSFER_OUT',$3,$4),
        ($5,$6,'TRANSFER_IN',$3,$4)`,
      [
        uuidv4(),
        from_wallet_id,
        amount_cents,
        transferId,
        uuidv4(),
        to_wallet_id,
      ],
    );

    // 6) Mark completed
    const done = await client.query(
      `UPDATE transfers SET status='COMPLETED' WHERE id=$1 RETURNING *`,
      [transferId],
    );

    await client.query("COMMIT");
    return done.rows[0];
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function getTransfer(id) {
  const { rows } = await pool.query(`SELECT * FROM transfers WHERE id=$1`, [
    id,
  ]);
  if (!rows[0]) throw httpError(404, "Transfer not found");
  return rows[0];
}
