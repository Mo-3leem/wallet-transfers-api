import { Router } from "express";
import {
  requireBodyFields,
  requireIdempotencyKey,
} from "../middleware/validate.js";

import {
  createTransfer,
  getTransfer,
  listTransfers,
} from "../services/transfer.service.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const transfers = await listTransfers(req.query.limit);
    res.json(transfers);
  } catch (e) {
    next(e);
  }
});

router.post(
  "/",
  requireIdempotencyKey,
  requireBodyFields(["from_wallet_id", "to_wallet_id", "amount_cents"]),
  async (req, res, next) => {
    try {
      const idempotency_key = req.header("Idempotency-Key");
      const transfer = await createTransfer({
        from_wallet_id: req.body?.from_wallet_id,
        to_wallet_id: req.body?.to_wallet_id,
        amount_cents: req.body?.amount_cents,
        idempotency_key,
      });
      res.status(201).json(transfer);
    } catch (e) {
      next(e);
    }
  },
);

router.get("/:id", async (req, res, next) => {
  try {
    const transfer = await getTransfer(req.params.id);
    res.json(transfer);
  } catch (e) {
    next(e);
  }
});

export default router;
