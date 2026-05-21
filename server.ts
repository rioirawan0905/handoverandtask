import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import nodemailer from "nodemailer";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API to securely dispatch actual operational notification emails via standard SMTP parameters
  app.post("/api/send-email", async (req, res) => {
    const { to, subject, html, text } = req.body;

    const host = process.env.SMTP_HOST;
    const portStr = process.env.SMTP_PORT;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM || `"Drilling Operations Portal" <portal@drill-handover-portal.org>`;

    if (!host || !user || !pass) {
      return res.status(200).json({
        success: false,
        reason: "SMTP_NOT_CONFIGURED",
        message: "SMTP Host, Username, or Password credentials are missing in your environment configuration. Outbox was saved strictly into Simulation sandbox."
      });
    }

    try {
      const port = portStr ? parseInt(portStr, 10) : 587;
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465, // secure for 465 client SSL, false for 587 TLS
        auth: {
          user,
          pass
        }
      });

      const info = await transporter.sendMail({
        from,
        to,
        subject,
        text: text || "Automated drilling report alert.",
        html
      });

      console.log("Actual SMTP alert sent successfully:", info.messageId);
      res.json({
        success: true,
        messageId: info.messageId
      });
    } catch (err: any) {
      console.error("Express backend SMTP server dispatch failure:", err);
      res.status(500).json({
        success: false,
        reason: "SMTP_DISPATCH_FAILURE",
        message: err.message || "Failed to deliver email through real SMTP relay."
      });
    }
  });

  // API Route to securely query and yield operational Firebase details without baking secrets in build files
  app.get("/api/config", (req, res) => {
    const projectId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "";
    const apiKey = process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || "";
    const authDomain = process.env.VITE_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN || "";
    const appId = process.env.VITE_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID || "";

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
