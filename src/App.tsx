// Handle Complete Handover Sign-off with popup verification dialog, agreement checks, and email override controls
  const handleConfirmSignOffSubmit = async () => {
    setSignoffResult({ status: "submitting", message: "Processing handover rotation and logs archiving...", sentTo: signoffEmailOverride });
    
    // Auto-update email override inside local settings so they don't lose it!
    setNotificationSettings(prev => ({ ...prev, userEmail: signoffEmailOverride }));

    // Capture precise, non-stale copies of current active tasks and backlog
    const currentTasks = [...dbState.tasks];
    const currentBacklog = [...dbState.backlog];

    const newHistoryItem: HandoverHistoryItem = {
      id: `history-${Date.now()}`,
      date: new Date().toISOString(),
      outgoingLead: dbState.outgoingLead,
      incomingLead: dbState.incomingLead,
      logText: logText,
      tasksCount: currentTasks.length,
      backlogCount: currentBacklog.length,
      signedOffBy: dbState.outgoingLead,
      tasks: currentTasks,
      backlog: currentBacklog
    };

    // Advanced rotation logic: 
    updateWorkspaceState((prev) => {
      const uncompletedTasks = prev.tasks.filter(t => !t.completed);
      return {
        ...prev,
        outgoingLead: prev.incomingLead, // Rotation!
        incomingLead: "", // Blank wait for input
        tasks: uncompletedTasks, // Keep uncompleted
        history: [newHistoryItem, ...prev.history],
        signoffChecklist: {
          blockersReviewed: false,
          systemsNormal: false,
          credsTransferred: false,
        },
        latestLog: ""
      };
    });

    const workspaceName = workspaces.find(w => w.id === currentSelectedWorkspaceId)?.name || currentSelectedWorkspaceId;

    // Trigger physical SMTP/API dispatch directly to Cloudflare Worker
    if (signoffEmailOverride.trim()) {
      try {
        // 1. Generate Rich HTML Email Content dynamically to match SendGrid structure
        let tasksRows = "";
        if (currentTasks.length === 0) {
          tasksRows = `<tr><td colspan="4" style="padding: 12px; text-align: center; color: #64748b; font-style: italic; border-top: 1px solid #e2e8f0;">No tasks registered this shift cycle.</td></tr>`;
        } else {
          currentTasks.forEach((t) => {
            const statusBadge = t.completed 
              ? `<span style="background-color: #d1fae5; color: #065f46; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; border: 1px solid #a7f3d0;">COMPLETED</span>`
              : `<span style="background-color: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; border: 1px solid #fde68a;">OPEN / CARRIED OVER</span>`;
            const pColor = t.priority === "High" ? "#dc2626" : t.priority === "Medium" ? "#d97706" : "#2563eb";
            tasksRows += `
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 10px 8px; font-size: 12px; font-weight: 600; color: #1e293b; text-align: left;">${t.description}</td>
                <td style="padding: 10px 8px; font-size: 11px; color: #475569; text-align: left;">${t.ownerName}</td>
                <td style="padding: 10px 8px; font-size: 11px; text-align: center; color: ${pColor}; font-weight: bold;">${t.priority}</td>
                <td style="padding: 10px 8px; font-size: 11px; text-align: right;">${statusBadge}</td>
              </tr>
            `;
          });
        }

        let backlogRows = "";
        if (currentBacklog.length === 0) {
          backlogRows = `<tr><td colspan="3" style="padding: 12px; text-align: center; color: #64748b; font-style: italic; border-top: 1px solid #e2e8f0;">No backlog/long-term issues registered.</td></tr>`;
        } else {
          currentBacklog.forEach((b) => {
            const pColor = b.priority === "High" ? "#dc2626" : b.priority === "Medium" ? "#d97706" : "#2563eb";
            backlogRows += `
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 10px 8px; font-size: 12px; font-weight: 600; color: #1e293b; text-align: left;">${b.description}</td>
                <td style="padding: 10px 8px; font-size: 11px; color: #475569; text-align: left;">${b.ownerName}</td>
                <td style="padding: 10px 8px; font-size: 11px; text-align: right; color: ${pColor}; font-weight: bold;">${b.priority}</td>
              </tr>
            `;
          });
        }

        const emailSubject = `[HANDOVER HUB] Shift Handover Completed: ${newHistoryItem.outgoingLead} ➔ ${newHistoryItem.incomingLead}`;
        const emailHtml = `
          <div style="font-family: 'Inter', sans-serif; background-color: #f1f5f9; padding: 32px 16px; color: #1e293b; text-align: left; line-height: 1.5;">
            <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
              <div style="background-color: #0f172a; padding: 24px; color: #ffffff; border-bottom: 4px solid #10b981;">
                <span style="background-color: #059669; color: #ffffff; font-size: 10px; font-weight: bold; padding: 4px 8px; border-radius: 100px; text-transform: uppercase;">✓ Shift Certified</span>
                <h1 style="margin: 8px 0 0 0; font-size: 20px; font-weight: 800;">DRILLING HANDOVER REPORT</h1>
                <p style="margin: 4px 0 0 0; font-size: 11px; color: #94a3b8;">SPACE: ${workspaceName} • DATE: ${new Date(newHistoryItem.date).toLocaleString()}</p>
              </div>
              <div style="padding: 24px;">
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                  <h3 style="margin: 0 0 12px 0; font-size: 12px; font-weight: 800; color: #475569; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; text-transform: uppercase;">Sign-Off Summary</h3>
                  <p><strong>Outgoing Lead:</strong> ${newHistoryItem.outgoingLead}</p>
                  <p><strong>Incoming Counterpart:</strong> ${newHistoryItem.incomingLead}</p>
                  <p><strong>Authorized Signer:</strong> ${newHistoryItem.signedOffBy} [DIGITAL STAMP]</p>
                </div>
                <div style="margin-bottom: 24px;">
                  <h3 style="margin: 0 0 8px 0; font-size: 12px; font-weight: 800; color: #475569; text-transform: uppercase;">Operations Log Notes</h3>
                  <div style="background-color: #faf5ff; border: 1px solid #e9d5ff; border-left: 4px solid #8b5cf6; border-radius: 6px; padding: 14px; font-size: 13px; color: #581c87;">
                    "${newHistoryItem.logText}"
                  </div>
                </div>
                <div style="margin-bottom: 24px;">
                  <h3 style="margin: 0 0 10px 0; font-size: 12px; font-weight: 800; color: #475569; text-transform: uppercase;">Active Shift Tasks</h3>
                  <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                    <thead>
                      <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0; color: #475569; font-weight: bold;">
                        <th style="padding: 8px; text-align: left;">Description</th>
                        <th style="padding: 8px; text-align: left;">Owner</th>
                        <th style="padding: 8px; text-align: center;">Priority</th>
                        <th style="padding: 8px; text-align: right;">Status</th>
                      </tr>
                    </thead>
                    <tbody>${tasksRows}</tbody>
                  </table>
                </div>
                <div style="margin-bottom: 24px;">
                  <h3 style="margin: 0 0 10px 0; font-size: 12px; font-weight: 800; color: #475569; text-transform: uppercase;">Registry Backlog</h3>
                  <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                    <thead>
                      <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0; color: #475569; font-weight: bold;">
                        <th style="padding: 8px; text-align: left;">Description</th>
                        <th style="padding: 8px; text-align: left;">Owner</th>
                        <th style="padding: 8px; text-align: right;">Priority</th>
                      </tr>
                    </thead>
                    <tbody>${backlogRows}</tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        `;

        // 2. Tembak langsung ke Custom/Cloudflare Worker API Endpoint menggunakan URL dari panel Settings
        const response = await fetch(getApiUrl("/api/send-email"), {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify({
            to: signoffEmailOverride,
            subject: emailSubject,
            htmlContent: emailHtml
          })
        });

        const totalText = await response.text();
        let data: any;
        try {
          data = JSON.parse(totalText);
        } catch (jsonErr: any) {
          throw new Error(`Response dari server bukan JSON valid (Status ${response.status}): ${totalText.substring(0, 200)}`);
        }

        if (response.ok && data.success) {
          setSignoffResult({
            status: "success",
            message: `Handover transaction successfully completed and database archived! Real-time email relay dispatched via SendGrid.`,
            sentTo: signoffEmailOverride
          });
          addNotification(`📧 Email terkirim ke: ${signoffEmailOverride}`, "success");
        } else {
          throw new Error(data.error || data.details || "Gagal mengirim melalui SendGrid API");
        }

      } catch (err: any) {
        console.error("Fetch API error:", err);
        setSignoffResult({
          status: "error",
          message: `Handover berhasil disimpan ke database lokal, namun pengiriman email via Sendgrid gagal: ${err.message}`,
          sentTo: signoffEmailOverride
        });
        addNotification(`⚠️ Gagal mengirim email: ${err.message}`, "warning");
      }
    } else {
      setSignoffResult({
        status: "success",
        message: `Handover rotation completed and saved into historical archive. (No recipient emails were selected to dispatch notifications)`,
        sentTo: "None"
      });
    }

    // Trigger normal in-app / log dispatches
    dispatchNotification({
      event: "handoverSignoff",
      message: `Handover signed off by ${newHistoryItem.signedOffBy}. Shift rota successfully archived for space "${workspaceName}".`,
      type: "success"
    });

    setLogText("");
  };
