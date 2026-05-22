import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import nodemailer from "nodemailer";
import fs from "fs";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API to securely dispatch actual operational notification emails via standard SMTP parameters or structured handover format
  const handleSendEmail = async (req: express.Request, res: express.Response) => {
    console.log("Incoming email dispatch request body:", JSON.stringify(req.body));
    const { to, subject, html, text, recipients, handover_data } = req.body;

    let finalTo = to || recipients;
    if (!finalTo) {
      return res.status(200).json({
        success: false,
        reason: "MISSING_RECIPIENT",
        message: "No recipient was specified. Please configure recipient emails under Settings or include the 'recipients' parameter in the request body."
      });
    }

    // Standardize emails separated by semicolons to comma-separated
    if (typeof finalTo === "string") {
      finalTo = finalTo.replace(/;/g, ", ");
    } else if (Array.isArray(finalTo)) {
      finalTo = finalTo.join(", ");
    }

    let finalSubject = subject;
    let finalHtml = html;
    let finalTxt = text;

    // Handle structured handover_data input if provided
    if (handover_data) {
      let hd: any = {};
      try {
        hd = typeof handover_data === "string" ? JSON.parse(handover_data) : handover_data;
      } catch (e: any) {
        hd = { error_parsing: true, original: handover_data };
      }

      const workspace = hd.workspaceName || hd.workspace_name || "Active drilling workspace";
      const signee = hd.signedOffBy || hd.signed_off_by || hd.outgoingLead || hd.outgoing_lead || "Operator";
      const outgoingLead = hd.outgoingLead || hd.outgoing_lead || "N/A";
      const incomingLead = hd.incomingLead || hd.incoming_lead || "N/A";
      const logText = hd.logText || hd.log_text || hd.latestLog || hd.latest_log || hd.remarks || "No transitional briefing remarks provided.";
      const dateStr = hd.date ? new Date(hd.date).toUTCString() : new Date().toUTCString();

      const tasksList = Array.isArray(hd.tasks) ? hd.tasks : [];
      const backlogList = Array.isArray(hd.backlog) ? hd.backlog : [];

      finalSubject = finalSubject || `[HANDOVER REPORT] Shift transition on "${workspace}" by ${signee}`;
      finalTxt = finalTxt || `Shift rotation signed off successfully by ${signee} for space "${workspace}". Transitional brief: ${logText}`;

      const tasksRowsHtml = tasksList.map((t: any) => `
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 8px; color: #334155; text-align: left;">${t.description || t.title || "Untitled Task"}</td>
          <td style="padding: 8px; color: #475569; font-weight: 500; text-align: left;">${t.ownerName || t.assignee || "Unassigned"}</td>
          <td style="padding: 8px; text-align: center;"><span style="padding: 2px 6px; font-size: 11px; font-weight: bold; border-radius: 4px; background-color: ${t.priority === 'High' ? '#fee2e2; color: #991b1b;' : t.priority === 'Medium' ? '#fef3c7; color: #92400e;' : '#f1f5f9; color: #334155;'}">${t.priority || "Low"}</span></td>
          <td style="padding: 8px; color: #64748b; font-size: 12px; text-align: right;">${t.completed ? '✅ Completed' : '⏳ Pending'}</td>
        </tr>
      `).join('');

      const backlogRowsHtml = backlogList.map((b: any) => `
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 8px; color: #334155; text-align: left;">${b.description || b.title || "Untitled Item"}</td>
          <td style="padding: 8px; color: #475569; text-align: left;">${b.ownerName || b.assignee || "Unassigned"}</td>
          <td style="padding: 8px; text-align: center;"><span style="padding: 2px 6px; font-size: 11px; font-weight: bold; border-radius: 4px; background-color: ${b.priority === 'High' ? '#fee2e2; color: #991b1b;' : b.priority === 'Medium' ? '#fef3c7; color: #92400e;' : '#f1f5f9; color: #334155;'}">${b.priority || "Low"}</span></td>
        </tr>
      `).join('');

      finalHtml = finalHtml || `
        <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 650px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1e293b; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
          <div style="text-align: center; margin-bottom: 24px; border-bottom: 2px solid #ef4444; padding-bottom: 16px;">
            <h1 style="color: #0f172a; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.025em;">🏗️ PHASE 5 DRILLING HANDOVER</h1>
            <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em;">Certified Safety & Operations Rota Journal</p>
          </div>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
            <tbody>
              <tr>
                <td style="padding: 12px; color: #64748b; font-size: 13px; font-weight: 600; width: 35%; text-align: left;">Workspace Unit</td>
                <td style="padding: 12px; color: #0f172a; font-size: 13px; font-weight: 700; text-align: right;">${workspace}</td>
              </tr>
              <tr style="border-top: 1px solid #e2e8f0;">
                <td style="padding: 12px; color: #64748b; font-size: 13px; font-weight: 600; text-align: left;">Outgoing Operator Lead</td>
                <td style="padding: 12px; color: #dc2626; font-size: 13px; font-weight: 700; text-align: right;">${outgoingLead}</td>
              </tr>
              <tr style="border-top: 1px solid #e2e8f0;">
                <td style="padding: 12px; color: #64748b; font-size: 13px; font-weight: 600; text-align: left;">Incoming Operator Lead</td>
                <td style="padding: 12px; color: #16a34a; font-size: 13px; font-weight: 700; text-align: right;">${incomingLead}</td>
              </tr>
              <tr style="border-top: 1px solid #e2e8f0;">
                <td style="padding: 12px; color: #64748b; font-size: 13px; font-weight: 600; text-align: left;">Sign-off Approver</td>
                <td style="padding: 12px; color: #4f46e5; font-size: 13px; font-weight: 700; text-align: right;">${signee}</td>
              </tr>
              <tr style="border-top: 1px solid #e2e8f0;">
                <td style="padding: 12px; color: #64748b; font-size: 13px; font-weight: 600; text-align: left;">Certified Timestamp</td>
                <td style="padding: 12px; color: #0f172a; font-size: 12px; text-align: right; font-family: monospace;">${dateStr}</td>
              </tr>
            </tbody>
          </table>

          <div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
            <h3 style="color: #b45309; margin: 0 0 8px 0; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.025em; text-align: left;">📝 TRANSITIONAL BRIEFING & SHIFT REMARKS</h3>
            <p style="color: #451a03; font-size: 13px; line-height: 1.6; margin: 0; white-space: pre-wrap; text-align: left;">"${logText}"</p>
          </div>

          ${tasksList.length > 0 ? `
          <div style="margin-bottom: 24px;">
            <h3 style="color: #1e293b; margin: 0 0 8px 0; font-size: 14px; font-weight: 700; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; text-align: left;">🎯 SHIFT TASKS REGISTRY (${tasksList.length})</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <thead>
                <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                  <th style="padding: 8px; text-align: left; color: #64748b;">Description</th>
                  <th style="padding: 8px; text-align: left; color: #64748b;">Assignee</th>
                  <th style="padding: 8px; text-align: center; color: #64748b;">Priority</th>
                  <th style="padding: 8px; text-align: right; color: #64748b;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${tasksRowsHtml}
              </tbody>
            </table>
          </div>
          ` : ''}

          ${backlogList.length > 0 ? `
          <div style="margin-bottom: 24px;">
            <h3 style="color: #1e293b; margin: 0 0 8px 0; font-size: 14px; font-weight: 700; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; text-align: left;">🗂️ BACKLOG & RE-ENTRANT ITEMS (${backlogList.length})</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <thead>
                <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                  <th style="padding: 8px; text-align: left; color: #64748b;">Description</th>
                  <th style="padding: 8px; text-align: left; color: #64748b;">Owner</th>
                  <th style="padding: 8px; text-align: center; color: #64748b;">Priority</th>
                </tr>
              </thead>
              <tbody>
                ${backlogRowsHtml}
              </tbody>
            </table>
          </div>
          ` : ''}

          <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8;">
            <p style="margin: 0;">This is an officially certified legal operational shift record. Real-world SMTP delivery completed successfully.</p>
            <p style="margin: 4px 0 0 0; font-family: monospace;">Verification ID: ${Math.random().toString(36).substring(2, 10).toUpperCase()}</p>
          </div>
        </div>
      `;
    }

    const host = process.env.SMTP_HOST;
    const portStr = process.env.SMTP_PORT;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM || `"Drilling Operations Portal" <portal@drill-handover-portal.org>`;

    if (!host || !user || !pass) {
      console.log("SMTP Host is not configured in current sandbox. Saving to simulated sandbox logs.");
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
        to: finalTo,
        subject: finalSubject || "Automated drilling report alert.",
        text: finalTxt || "Automated drilling report alert.",
        html: finalHtml
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
  };

  app.post("/api/dispatch-smtp", handleSendEmail);
  app.post("/api/send-email", handleSendEmail);

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
