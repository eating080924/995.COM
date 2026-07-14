import express from "express";
import path from "path";
import { createProxyMiddleware } from "http-proxy-middleware";

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Proxy Firebase Auth endpoints to bypass Safari/iOS Chrome third-party cookie restrictions (ITP)
  app.use(
    "/__/auth",
    (req, res, next) => {
      // Restore the /__/auth prefix because Express app.use("/__/auth") stripped it,
      // but http-proxy-middleware needs the full path to forward correctly.
      req.url = req.originalUrl;

      // Strip headers that confuse Firebase Hosting routing
      delete req.headers["x-forwarded-host"];
      delete req.headers["x-forwarded-proto"];
      delete req.headers["x-forwarded-for"];
      delete req.headers["forwarded"];
      delete req.headers["via"];
      next();
    },
    createProxyMiddleware({
      target: "https://com-515d4.firebaseapp.com",
      changeOrigin: true,
      xfwd: false,
    })
  );

  // Explicit route for ads.txt to guarantee AdSense crawler reliability and bypass cold start static resolution quirks
  app.get("/ads.txt", (req, res) => {
    res.set("Content-Type", "text/plain");
    res.send("google.com, pub-6474295952980654, DIRECT, f08c47fec0942fa0\n");
  });

  // In production, serve build artifacts. Otherwise, plug in Vite middleware
  if (process.env.NODE_ENV !== "production") {
    // Dynamically import Vite to avoid loading it in production (where it might trigger ERR_REQUIRE_ESM)
    const viteModule = await (Function('return import("vite")')() as Promise<typeof import("vite")>);
    const vite = await viteModule.createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
