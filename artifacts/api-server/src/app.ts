import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import ocrRouter from "./routes/ocr";
import roastRouter from "./routes/roast";

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
// OCR has its own consent check, rate/resource bounds and larger raster-only parser.
app.use("/api", ocrRouter);
// Roast accepts either text or a bounded image, so it also needs its own parser
// before the app-wide 64kb JSON limit.
app.use("/api", roastRouter);
app.use(express.json({ limit: "64kb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Parser errors may contain the submitted body: never pass them to request logging.
app.use((err: { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err.status === 413 ? 413 : err.status === 400 ? 400 : 500;
  res.status(status).set("Cache-Control", "no-store").json({ error: status === 413 ? "Request too large." : status === 400 ? "Invalid JSON request." : "Request failed." });
});

export default app;
