import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

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
app.use(express.json({ limit: "64kb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Parser errors may contain the submitted body: never pass them to request logging.
app.use((err: { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err.status === 413 ? 413 : err.status === 400 ? 400 : 500;
  res.status(status).set("Cache-Control", "no-store").json({ error: status === 413 ? "Request too large." : status === 400 ? "Invalid JSON request." : "Request failed." });
});

export default app;
