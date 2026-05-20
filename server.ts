import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route to securely query and yield operational Firebase details without baking secrets in build files
  app.get("/api/config", (req, res) => {
    let projectId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "";
    let apiKey = process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || "";
    let authDomain = process.env.VITE_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN || "";
    let appId = process.env.VITE_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID || "";

    if (!projectId || !apiKey) {
      try {
        const configPath = path.join(process.cwd(), "firebase-applet-config.json");
        if (fs.existsSync(configPath)) {
          const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
          projectId = config.projectId || projectId;
          apiKey = config.apiKey || apiKey;
          authDomain = config.authDomain || authDomain;
          appId = config.appId || appId;
        }
      } catch (err) {
        console.error("Failed to read firebase-applet-config.json in server route", err);
      }
    }

    res.json({
      projectId,
      apiKey,
      authDomain,
      appId
    });
  });

  // Dual-mode integration: Vite middleware for development, high-speed static assets serving for production
  const isDevMode = process.env.NODE_ENV !== "production" || !process.argv[1]?.includes("server.cjs");

  if (isDevMode) {
    const vite = await createViteServer({
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
    console.log(`Full-Stack Server actively listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
