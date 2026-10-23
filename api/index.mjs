import app from "./dist/vercel.mjs";

// Vercel Node adapter. The build command bundles the API server and copies
// its dist next to this entry (api/dist), so the function and its pino
// transport workers stay together as static siblings.
export default async function handler(req, res) {
  await app.handle(req, res);
}
