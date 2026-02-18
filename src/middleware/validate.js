import { httpError } from "../utils/httpError.js";

export function requireBodyFields(fields = []) {
  return (req, res, next) => {
    for (const f of fields) {
      if (req.body?.[f] === undefined || req.body?.[f] === null) {
        return next(httpError(400, `Missing field: ${f}`));
      }
    }
    next();
  };
}

export function requireIdempotencyKey(req, res, next) {
  const key = req.header("Idempotency-Key");
  if (!key) return next(httpError(400, "Missing Idempotency-Key header"));
  next();
}
