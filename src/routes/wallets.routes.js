import { Router } from "express";
import { requireBodyFields } from "../middleware/validate.js";
import {
  createWallet,
  getWallet,
  getLedger,
  deposit,
  withdraw,
  listWallets,
  deleteWallet,
  restoreWallet,
} from "../services/wallet.service.js";

const router = Router();

router.delete("/:id", async (req, res, next) => {
  try {
    const deleted = await deleteWallet(req.params.id);
    res.json(deleted);
  } catch (e) {
    next(e);
  }
});

router.patch("/:id/restore", async (req, res, next) => {
  try {
    const restored = await restoreWallet(req.params.id);
    res.json(restored);
  } catch (e) {
    next(e);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const wallets = await listWallets(req.query.limit);
    res.json(wallets);
  } catch (e) {
    next(e);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const wallet = await createWallet({
      currency: req.body?.currency || "EGP",
    });
    res.status(201).json(wallet);
  } catch (e) {
    next(e);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const wallet = await getWallet(req.params.id);
    res.json(wallet);
  } catch (e) {
    next(e);
  }
});

router.get("/:id/ledger", async (req, res, next) => {
  try {
    await getWallet(req.params.id); // ensure exists
    const entries = await getLedger(req.params.id, req.query.limit);
    res.json(entries);
  } catch (e) {
    next(e);
  }
});

router.post(
  "/:id/deposit",
  requireBodyFields(["amount_cents"]),
  async (req, res, next) => {
    try {
      const updated = await deposit(req.params.id, req.body?.amount_cents);
      res.json(updated);
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/:id/withdraw",
  requireBodyFields(["amount_cents"]),
  async (req, res, next) => {
    try {
      const updated = await withdraw(req.params.id, req.body?.amount_cents);
      res.json(updated);
    } catch (e) {
      next(e);
    }
  },
);

export default router;
