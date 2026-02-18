import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";
import path from "path";

import walletsRoutes from "./routes/wallets.routes.js";
import transfersRoutes from "./routes/transfers.routes.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

const swaggerPath = path.join(process.cwd(), "swagger.yaml");
const swaggerDoc = YAML.load(swaggerPath);
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDoc));

app.get("/", (req, res) => {
  res.json({
    name: "Wallet Service API",
    health: "/health",
    docs: "/docs",
    endpoints: {
      wallets: "/wallets",
      transfers: "/transfers",
    },
  });
});

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/wallets", walletsRoutes);
app.use("/transfers", transfersRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
