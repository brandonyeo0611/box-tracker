import { createServer } from "node:http";
import { mkdirSync, existsSync, createReadStream } from "node:fs";
import { resolve, extname, sep } from "node:path";
import { Store } from "./store.ts";
const dev = process.argv.includes("--dev");
const dataDir = resolve(process.env.DATA_DIR || "data");
mkdirSync(dataDir, { recursive: true });
const store = new Store(resolve(dataDir, "boxes.sqlite"));
const vite = dev ? await (await import("vite")).createServer({ server: { middlewareMode: true }, appType: "spa" }) : null;
const root = resolve("dist");
const mime: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url || "/", "http://localhost").pathname;
  if (pathname.startsWith("/api/")) {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    const send = (status: number, data: unknown) => { res.writeHead(status); res.end(JSON.stringify(data)); };
    try {
      if (req.method === "GET" && pathname === "/api/boxes") { send(200, store.boxes()); return; }
      if (req.method !== "POST" || !["/api/scans", "/api/tags", "/api/reset"].includes(pathname)) { send(404, { error: "Not found" }); return; }
      // Browser writes must originate from this app, including when accessed through an HTTPS tunnel.
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) { send(403, { error: "Use the checkpoint page on this server." }); return; }
      if (!req.headers["content-type"]?.startsWith("application/json")) { send(415, { error: "JSON required" }); return; }
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 4096) { send(413, { error: "Request too large" }); return; }
      }
      const input = JSON.parse(body);
      if (!input || typeof input !== "object") throw new Error("Invalid scan.");
      if (pathname === "/api/reset") { store.reset(); send(200, { ok: true }); return; }
      const { tag, boxId, location } = input;
      if (pathname === "/api/tags") {
        if (typeof tag !== "string" || typeof boxId !== "string") throw new Error("Tag and box are required.");
        store.register(tag, boxId); send(200, { ok: true }); return;
      }
      if (typeof location !== "string") throw new Error("Choose a checkpoint.");
      const id = typeof tag === "string" ? store.resolve(tag) : boxId;
      if (typeof id !== "string") throw new Error("Unknown tag. Register it in checkpoint setup first.");
      send(200, store.record(id, location));
    } catch (error) { send(400, { error: error instanceof Error ? error.message : "Unable to save scan." }); }
    return;
  }
  if (vite) { vite.middlewares(req, res); return; }
  let file = resolve(root, `.${pathname}`);
  if (!file.startsWith(root + sep) || !extname(pathname)) file = resolve(root, "index.html");
  if (!existsSync(file)) { res.writeHead(404); res.end("Not found. Run npm run build first."); return; }
  res.setHeader("Content-Type", mime[extname(file)] || "application/octet-stream");
  const stream = createReadStream(file);
  stream.on("error", () => { if (!res.headersSent) res.writeHead(404); res.end(); });
  stream.pipe(res);
});
server.listen(Number(process.env.PORT || 5173), "0.0.0.0", () => console.log("Box Tracker: http://localhost:" + (process.env.PORT || 5173)));

