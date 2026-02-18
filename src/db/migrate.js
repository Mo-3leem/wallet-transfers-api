import { pool } from "./pool.js";

const sql = `
CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY,
  balance_cents BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EGP',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transfers (
  id UUID PRIMARY KEY,
  from_wallet_id UUID NOT NULL REFERENCES wallets(id),
  to_wallet_id UUID NOT NULL REFERENCES wallets(id),
  amount_cents BIGINT NOT NULL,
  status TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotency: each sender wallet cannot reuse same key for different transfer
CREATE UNIQUE INDEX IF NOT EXISTS ux_transfers_from_idempotency
ON transfers(from_wallet_id, idempotency_key);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id UUID PRIMARY KEY,
  wallet_id UUID NOT NULL REFERENCES wallets(id),
  type TEXT NOT NULL,
  amount_cents BIGINT NOT NULL,
  transfer_id UUID NULL REFERENCES transfers(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_ledger_wallet_time
ON ledger_entries(wallet_id, created_at DESC);
`;

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log("Migration complete");
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
