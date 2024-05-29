import "dotenv/config";
import express from "express";
import http from "http";
import { Request, Response, NextFunction } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import { createTerminus } from "@godaddy/terminus";
import { extractAndClassify } from "src/classify";
import { validateSuiAddress } from "src/utils";

const app = express();
app.set("trust proxy", 1);
app.use(morgan("tiny"));
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:5173",
      /getnimbus\.io$/,
      /onrender\.com$/,
      /pages\.dev$/,
      /vercel\.app$/,
    ],
  })
);

const limiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 500, // Limit each IP to 500 requests per `window` (here, per 10 minutes)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    error: "Too many requests. Please wait for minutes",
  },
});
// Apply the rate limiting middleware to all requests
app.use((req, res, next) => {
  try {
    const apiKey = req.headers["x-api-key"];
    if (apiKey === process.env.ADMIN_API_KEY) {
      return next();
    }
  } catch (error) {
    console.log(error);
  }
  return limiter(req, res, next);
});

const port = process.env.PORT || 3000;

function defaultContentTypeMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  req.headers["content-type"] =
    req.headers["content-type"] || "application/json";
  next();
}
app.use(defaultContentTypeMiddleware);
app.use(express.json());
app.use(express.urlencoded());

// api handlers
app.get("/v1/nfts/classify", async (req, res) => {
  try {
    const address = req.query.address as string;
    if (!address) {
      return res.status(400).json({ error: "Address is required" });
    }
    if (!validateSuiAddress(address)) {
      return res.status(400).json({ error: "Invalid Sui address" });
    }

    const result = await extractAndClassify(address);
    return res.status(200).json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error?.message || error });
  }
});

function onHealthCheck() {
  return Promise.resolve();
}

function onSignal() {
  console.log("server is starting cleanup");
  // close db connections, etc
  return Promise.all([]);
}

function onShutdown() {
  console.log("cleanup finished, server is shutting down");
  return Promise.resolve();
}

const terminusOptions = {
  signals: ["SIGINT", "SIGTERM"],
  timeout: 10000,
  healthChecks: { "/": onHealthCheck },
  headers: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "OPTIONS, POST, GET",
  },
  onSignal,
  onShutdown,
};

const server = http.createServer(app);

// graceful shutdown
createTerminus(server, terminusOptions);

server.listen(port, () => {
  console.log(`App ready on :${port}`);
});
