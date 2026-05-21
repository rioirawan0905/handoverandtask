import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import nodemailer from "nodemailer";
import fs from "fs";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API to securely dispatch actual operational notification emails
  app.post("/api/send-email", async (req, res) => {
    const { to, subject, html, text } = req.body;

    const resendApiKey = process.env.RESEND_API_KEY;
    const host = process.env.SMTP_HOST;
    const portStr = process.env.SMTP_PORT;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    const isResendSmtp = (host && host.includes("resend")) || (user && user.toLowerCase() === "resend");
    const isResendActive = !!(resendApiKey || isResendSmtp);

    // Default sender is configured to send from onboarding@resend.dev when using Resend, or fallback to the general portal sender.
    const from = process.env.SMTP_FROM || 
                 (isResendActive 
                   ? `"Drilling Phase 5 Handover Portal" <onboarding@resend.dev>` 
                   : `"Drilling Phase 5 Handover Portal" <onboarding@resend.dev>`); // Default to onboarding@resend.dev for this prompt

    // Handle Resend onboarding sandbox limitations gracefully:
    // If we are using Resend onboarding/sandbox and the target recipient is not the verified developer account (yesaya.rio@gmail.com),
    // we rewrite the recipient to yesaya.rio@gmail.com and add an informative system warning banner to prevent 403 Validation Errors.
    let finalTo = to;
    let finalSubject = subject;
    let finalHtml = html;
    let finalText = text;

    const isUsingOnboardingResend = isResendActive && (from.includes("onboarding@resend.dev") || !process.env.SMTP_FROM);
    const requiresSandboxFallback = isUsingOnboardingResend && to !== "yesaya.rio@gmail.com";

    if (requiresSandboxFallback) {
      finalTo = "yesaya.rio@gmail.com";
      finalSubject = `[Sandbox Redirect for ${to}] ${subject}`;
      const warningBanner = `
        <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 24px; font-family: system-ui, -apple-system, sans-serif;">
          <h3 style="margin: 0 0 6px 0; font-size: 13px; font-weight: 700; color: #991b1b; display: flex; align-items: center; gap: 6px;">
            ⚠️ Resend Sandbox System Overroute
          </h3>
          <p style="margin: 0; font-size: 11.5px; color: #7f1d1d; line-height: 1.5;">
            This transactional transmission was triggered for <strong>${to}</strong>. 
            Because you are currently utilizing the Resend Sandbox with <code>onboarding@resend.dev</code>, Resend prohibits outward testing transmissions to unverified external domains (such as <em>@pertamina.com</em>).
            To avoid a 403 API failure, the Drilling Phase 5 Portal has routed this email straight to your verified developer sandbox target (<strong>yesaya.rio@gmail.com</strong>).
          </p>
        </div>
      `;
      finalHtml = warningBanner + (html || text);
      finalText = `[Resend Sandbox Notice: Originally addressed to ${to}]\n\n` + text;
    }

    // Prioritize direct Resend REST API if RESEND_API_KEY is present
    if (resendApiKey) {
      try {
        console.log("Attempting direct email dispatch via Resend REST API...");
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${resendApiKey}`
          },
          body: JSON.stringify({
            from,
            to: [finalTo],
            subject: finalSubject,
            html: finalHtml || finalText,
            text: finalText
          })
        });

        if (response.ok) {
          const data = await response.json();
          console.log("Resend API dispatch successful:", data.id);
          return res.json({
            success: true,
            messageId: data.id,
            wasRedirected: requiresSandboxFallback,
            originalRecipient: to
          });
        } else {
          const errText = await response.text();
          console.error("Resend API rejected dispatch:", errText);
          return res.status(200).json({
            success: false,
            reason: "RESEND_API_ERROR",
            message: `Resend API returned status ${response.status}: ${errText}`
          });
        }
      } catch (err: any) {
        console.error("Resend API direct fetch error:", err);
        return res.status(500).json({
          success: false,
          reason: "RESEND_FETCH_FAILURE",
          message: err.message || "Failed to make HTTP post request to Resend service."
        });
      }
    }

    if (!host || !user || !pass) {
      return res.status(200).json({
        success: false,
        reason: "SMTP_NOT_CONFIGURED",
        message: "Neither RESEND_API_KEY nor SMTP Host (SMTP_HOST, SMTP_USER, SMTP_PASS) are active in your environment configuration. Outbox was saved strictly into Simulation sandbox."
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
        to: finalTo,
        subject: finalSubject,
        text: finalText || "Automated drilling report alert.",
        html: finalHtml
      });

      console.log("Actual SMTP alert sent successfully:", info.messageId);
      res.json({
        success: true,
        messageId: info.messageId,
        wasRedirected: requiresSandboxFallback,
        originalRecipient: to
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
    let projectId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "";
    let apiKey = process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || "";
    let authDomain = process.env.VITE_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN || "";
    let appId = process.env.VITE_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID || "";
    let firestoreDatabaseId = process.env.VITE_FIREBASE_DATABASE_ID || "";

    try {
      const configPath = path.join(process.cwd(), "firebase-applet-config.json");
      if (fs.existsSync(configPath)) {
        const fileContent = fs.readFileSync(configPath, "utf-8");
        const parsed = JSON.parse(fileContent);
        if (parsed.projectId) {
          projectId = projectId || parsed.projectId;
          apiKey = apiKey || parsed.apiKey;
          authDomain = authDomain || parsed.authDomain;
          appId = appId || parsed.appId;
          firestoreDatabaseId = firestoreDatabaseId || parsed.firestoreDatabaseId || "";
        }
      }
    } catch (e) {
      console.error("Failed to read firebase-applet-config.json", e);
    }

    res.json({
      projectId,
      apiKey,
      authDomain,
      appId,
      firestoreDatabaseId
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
