import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./lib/logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve frontend static build relative to this file's location.
// In production the built server lives at artifacts/api-server/dist/index.mjs,
// so two levels up reaches the repo root, then into the frontend dist.
const frontendDist = path.resolve(__dirname, "../../wblackjack/dist/public");

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: "text/csv" }));

app.use("/api", router);

// Serve the React frontend static files
app.use(express.static(frontendDist));

// Wildcard fallback — let Wouter handle client-side routing
// Express 5 requires a named wildcard param (bare "*" is rejected by path-to-regexp v8)
app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(frontendDist, "index.html"));
});

export default app;
