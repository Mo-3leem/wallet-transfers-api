import request from "supertest";
import app from "../src/app.js";

describe("Wallet Transfers API", () => {
  let walletA;
  let walletB;

  test("should create wallets", async () => {
    const resA = await request(app).post("/wallets").send({ currency: "EGP" });

    const resB = await request(app).post("/wallets").send({ currency: "EGP" });

    expect(resA.statusCode).toBe(201);
    expect(resB.statusCode).toBe(201);

    walletA = resA.body.id;
    walletB = resB.body.id;
  });

  test("should deposit money", async () => {
    const res = await request(app)
      .post(`/wallets/${walletA}/deposit`)
      .send({ amount_cents: 10000 });

    expect(res.statusCode).toBe(200);
  });

  test("should transfer money successfully", async () => {
    const res = await request(app)
      .post("/transfers")
      .set("Idempotency-Key", "test-transfer-1")
      .send({
        from_wallet_id: walletA,
        to_wallet_id: walletB,
        amount_cents: 3000,
      });

    expect(res.statusCode).toBe(201);
  });

  test("should reject transfer with insufficient balance", async () => {
    const res = await request(app)
      .post("/transfers")
      .set("Idempotency-Key", "test-transfer-2")
      .send({
        from_wallet_id: walletA,
        to_wallet_id: walletB,
        amount_cents: 999999999,
      });

    expect(res.statusCode).toBe(400);
  });

  test("should return same response for same idempotency key", async () => {
    const payload = {
      from_wallet_id: walletA,
      to_wallet_id: walletB,
      amount_cents: 1000,
    };

    const first = await request(app)
      .post("/transfers")
      .set("Idempotency-Key", "same-key-test")
      .send(payload);

    const second = await request(app)
      .post("/transfers")
      .set("Idempotency-Key", "same-key-test")
      .send(payload);

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.body.id).toBe(first.body.id);
  });

  test("should reject same idempotency key with different payload", async () => {
    const firstPayload = {
      from_wallet_id: walletA,
      to_wallet_id: walletB,
      amount_cents: 500,
    };

    const secondPayload = {
      from_wallet_id: walletA,
      to_wallet_id: walletB,
      amount_cents: 700,
    };

    await request(app)
      .post("/transfers")
      .set("Idempotency-Key", "conflict-key-test")
      .send(firstPayload);

    const res = await request(app)
      .post("/transfers")
      .set("Idempotency-Key", "conflict-key-test")
      .send(secondPayload);

    expect(res.statusCode).toBe(409);
  });

  test("should prevent transfer from deleted wallet", async () => {
    await request(app).delete(`/wallets/${walletA}`);

    const res = await request(app)
      .post("/transfers")
      .set("Idempotency-Key", "deleted-wallet-test")
      .send({
        from_wallet_id: walletA,
        to_wallet_id: walletB,
        amount_cents: 100,
      });

    expect(res.statusCode).toBe(400);
  });
});

import { pool } from "../src/db/pool.js";

afterAll(async () => {
  await pool.end();
});
