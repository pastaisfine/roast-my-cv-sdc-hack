import app from "./app";

// Serverless adapter for Vercel. The request handler lives on Vercel's Node
// runtime; the same Express app never listens there, so `src/index.ts` keeps
// owning the listen step while `src/vercel.ts` only exports the routing core.
export default app;
