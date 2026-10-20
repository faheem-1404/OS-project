import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);
const hostname = "0.0.0.0";

const app = next({ dev, port, hostname });
const handle = app.getRequestHandler();

console.log(`[CampusLock] Initializing Next.js app (dev=${dev}) on port ${port}...`);

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url || "/", true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error handling request:", req.url, err);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });

  server.listen(port, hostname, () => {
    console.log(`[CampusLock] 🚀 Server actively listening on http://localhost:${port}`);
  });
}).catch((err) => {
  console.error("[CampusLock] Failed to prepare Next.js app:", err);
  process.exit(1);
});
