import express from "express";
import path from "path";

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

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
