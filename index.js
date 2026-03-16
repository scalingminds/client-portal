const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const sgMail = require("@sendgrid/mail");

admin.initializeApp();
const db = admin.firestore();

const SENDGRID_KEY = defineSecret("SENDGRID_KEY");
const CALENDLY_TOKEN = defineSecret("CALENDLY_TOKEN");
const COACH_EMAILS = ["andyhitecoaching@gmail.com", "andy@scalingminds.com"];
const COACH_NOTIFY = "andy@scalingminds.com";
const FROM_EMAIL = "andyhitecoaching@gmail.com";
const FROM_NAME = "Scaling Minds";
const PORTAL_URL = "https://scalingminds.github.io/client-portal/";

function isCoach(email) {
  return COACH_EMAILS.indexOf(email) !== -1;
}

// ─── SEND NOTIFICATION (called from coach dashboard) ───
exports.sendNotification = onRequest(
  { secrets: [SENDGRID_KEY], cors: true },
  async (req, res) => {
    if (req.method !== "POST") { res.status(405).send("POST only"); return; }
    const { to, toName, type, data } = req.body;
    if (!to || !type) { res.status(400).send("Missing to or type"); return; }

    sgMail.setApiKey(SENDGRID_KEY.value());
    const name = (toName || "").split(" ")[0] || "there";
    let subject = "", html = "";

    if (type === "session_note") {
      subject = "New session notes from Andy";
      html = '<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:20px"><div style="background:#1B4332;color:#F5F0E8;padding:20px 24px;border-radius:12px 12px 0 0"><h2 style="margin:0;font-size:20px">Session Notes Added</h2></div><div style="background:#ffffff;border:1px solid #e0dbd2;border-top:none;padding:24px;border-radius:0 0 12px 12px"><p>Hi ' + name + ',</p><p>Andy added notes from your ' + (data.date || "") + ' session.</p>' + (data.themes ? "<p><strong>Key Themes:</strong> " + data.themes + "</p>" : "") + (data.commitments ? "<p><strong>Commitments:</strong> " + data.commitments + "</p>" : "") + '<p><a href="' + PORTAL_URL + '" style="display:inline-block;background:#1B4332;color:#F5F0E8;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">View in Portal</a></p><p style="color:#6b6b6b;font-size:12px;margin-top:20px">Scaling Minds</p></div></div>';
    } else if (type === "todo") {
      subject = "New to-do from Andy";
      html = '<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:20px"><div style="background:#1B4332;color:#F5F0E8;padding:20px 24px;border-radius:12px 12px 0 0"><h2 style="margin:0;font-size:20px">New To-Do</h2></div><div style="background:#ffffff;border:1px solid #e0dbd2;border-top:none;padding:24px;border-radius:0 0 12px 12px"><p>Hi ' + name + ',</p><p>Andy assigned you a new to-do:</p><p style="background:#FAF8F4;padding:12px 16px;border-radius:8px;border-left:4px solid #1B4332"><strong>' + (data.text || "") + '</strong>' + (data.link ? '<br><a href="' + data.link + '" style="color:#1B4332;font-size:13px">Open link</a>' : "") + '</p><p><a href="' + PORTAL_URL + '" style="display:inline-block;background:#1B4332;color:#F5F0E8;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">View in Portal</a></p><p style="color:#6b6b6b;font-size:12px;margin-top:20px">Scaling Minds</p></div></div>';
    } else if (type === "document") {
      subject = "New document from Andy";
      html = '<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:20px"><div style="background:#1B4332;color:#F5F0E8;padding:20px 24px;border-radius:12px 12px 0 0"><h2 style="margin:0;font-size:20px">New Document Shared</h2></div><div style="background:#ffffff;border:1px solid #e0dbd2;border-top:none;padding:24px;border-radius:0 0 12px 12px"><p>Hi ' + name + ',</p><p>Andy shared a new document with you:</p><p style="background:#FAF8F4;padding:12px 16px;border-radius:8px;border-left:4px solid #B8860B"><strong>' + (data.title || "") + '</strong>' + (data.desc ? '<br><span style="color:#6b6b6b;font-size:13px">' + data.desc + "</span>" : "") + '</p><p><a href="' + PORTAL_URL + '" style="display:inline-block;background:#1B4332;color:#F5F0E8;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">View in Portal</a></p><p style="color:#6b6b6b;font-size:12px;margin-top:20px">Scaling Minds</p></div></div>';
    } else {
      res.status(400).send("Unknown type"); return;
    }

    try {
      await sgMail.send({ to, from: { email: FROM_EMAIL, name: FROM_NAME }, subject, html });
      console.log("Email sent to " + to + ": " + subject);
      res.json({ success: true });
    } catch (err) {
      console.error("Email failed:", err.message);
      res.status(500).json({ error: err.message });
    }
  }
);

// ─── CALENDLY WEBHOOK (receives booking events) ───
exports.calendlyWebhook = onRequest(
  { secrets: [CALENDLY_TOKEN], cors: true },
  async (req, res) => {
    if (req.method !== "POST") { res.status(405).send("POST only"); return; }

    const { event, payload } = req.body;
    console.log("Calendly webhook received:", event);

    // Only handle new bookings
    if (event !== "invitee.created") {
      res.json({ ok: true, skipped: true });
      return;
    }

    try {
      const inviteeEmail = payload.email || (payload.invitee || {}).email;
      const eventUri = payload.event || (payload.scheduled_event || {}).uri;

      if (!inviteeEmail || !eventUri) {
        console.log("Missing email or event URI");
        res.json({ ok: true, skipped: true });
        return;
      }

      // Fetch event details from Calendly API to get the start time
      const eventId = eventUri.split("/").pop();
      const fetch = (await import("node-fetch")).default;
      const eventRes = await fetch("https://api.calendly.com/scheduled_events/" + eventId, {
        headers: { "Authorization": "Bearer " + CALENDLY_TOKEN.value() }
      });
      const eventData = await eventRes.json();
      const startTime = eventData.resource ? eventData.resource.start_time : null;

      if (!startTime) {
        console.log("Could not get start time from Calendly");
        res.json({ ok: true, skipped: true });
        return;
      }

      // Find the client in Firestore by email
      const snap = await db.collection("users").where("email", "==", inviteeEmail).get();
      if (snap.empty) {
        console.log("No client found with email: " + inviteeEmail);
        res.json({ ok: true, noClient: true });
        return;
      }

      // Update their nextSession
      const clientDoc = snap.docs[0];
      await clientDoc.ref.update({ nextSession: startTime });
      console.log("Updated nextSession for " + inviteeEmail + " to " + startTime);

      res.json({ ok: true, updated: true, email: inviteeEmail, nextSession: startTime });
    } catch (err) {
      console.error("Calendly webhook error:", err.message);
      res.status(500).json({ error: err.message });
    }
  }
);

// ─── REGISTER CALENDLY WEBHOOK (one-time setup) ───
exports.registerCalendlyWebhook = onRequest(
  { secrets: [CALENDLY_TOKEN] },
  async (req, res) => {
    try {
      const fetch = (await import("node-fetch")).default;

      // Get current user URI
      const meRes = await fetch("https://api.calendly.com/users/me", {
        headers: { "Authorization": "Bearer " + CALENDLY_TOKEN.value() }
      });
      const meData = await meRes.json();
      const userUri = meData.resource.uri;
      const orgUri = meData.resource.current_organization;

      // Get the webhook URL (this function's sibling)
      const webhookUrl = "https://us-central1-scaling-minds-portal.cloudfunctions.net/calendlyWebhook";

      // Create webhook subscription
      const subRes = await fetch("https://api.calendly.com/webhook_subscriptions", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + CALENDLY_TOKEN.value(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          url: webhookUrl,
          events: ["invitee.created", "invitee.canceled"],
          organization: orgUri,
          user: userUri,
          scope: "user"
        })
      });
      const subData = await subRes.json();
      console.log("Webhook registered:", JSON.stringify(subData));
      res.json(subData);
    } catch (err) {
      console.error("Register webhook error:", err.message);
      res.status(500).json({ error: err.message });
    }
  }
);

// ─── WEEKLY SUMMARY (Monday 7am CT) ───
exports.weeklySummary = onSchedule(
  { schedule: "0 7 * * 1", timeZone: "America/Chicago", secrets: [SENDGRID_KEY] },
  async () => {
    sgMail.setApiKey(SENDGRID_KEY.value());
    const snap = await db.collection("users").get();
    const clients = [];
    snap.forEach((doc) => { const d = doc.data(); if (!isCoach(d.email) && !d.archived) clients.push(d); });
    if (clients.length === 0) return null;
    const today = new Date();
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
    let summaryHtml = "";
    for (const c of clients) {
      const habits = c.habits || [], completions = c.completions || {};
      const name = c.displayName || c.email, company = c.company ? " (" + c.company + ")" : "";
      let totalDue = 0, totalDone = 0;
      const journalCount = Object.keys(c.notes || {}).filter(k => { const d = new Date(k); return d >= weekAgo && (c.notes[k] || "").trim(); }).length;
      for (let i = 0; i < 7; i++) { const d = new Date(today); d.setDate(d.getDate() - i); const dk = d.toISOString().split("T")[0]; const dayComp = completions[dk] || []; habits.forEach(h => { let due = true; if (h.freq === "days") due = (h.freqDays || []).indexOf(d.getDay()) !== -1; if (due) { totalDue++; if (dayComp.indexOf(h.id) !== -1) totalDone++; } }); }
      const rate = totalDue > 0 ? Math.round((totalDone / totalDue) * 100) : 0;
      const color = rate >= 70 ? "#2D6A4F" : rate >= 40 ? "#B8860B" : "#c0392b";
      const goals = (c.goals || []).filter(g => g.status === "active");
      summaryHtml += '<div style="background:#FAF8F4;border:1px solid #e0dbd2;border-radius:10px;padding:16px 20px;margin-bottom:12px"><div style="display:flex;justify-content:space-between;align-items:center"><strong style="color:#1B4332">' + name + company + '</strong><span style="color:' + color + ';font-weight:700;font-size:18px">' + rate + '%</span></div><div style="font-size:13px;color:#6b6b6b;margin-top:6px">' + habits.length + ' habits · ' + totalDone + '/' + totalDue + ' completed · ' + journalCount + ' journal entries' + (goals.length > 0 ? ' · ' + goals.length + ' active goals' : '') + '</div></div>';
    }
    try {
      await sgMail.send({ to: COACH_NOTIFY, from: { email: FROM_EMAIL, name: FROM_NAME }, subject: "Weekly Client Summary — " + today.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }), html: '<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:20px"><div style="background:#1B4332;color:#F5F0E8;padding:20px 24px;border-radius:12px 12px 0 0"><h2 style="margin:0;font-size:20px">Weekly Client Summary</h2><p style="margin:4px 0 0;opacity:0.8;font-size:13px">' + clients.length + ' active clients</p></div><div style="background:#ffffff;border:1px solid #e0dbd2;border-top:none;padding:24px;border-radius:0 0 12px 12px">' + summaryHtml + '<p style="margin-top:16px"><a href="' + PORTAL_URL + '" style="display:inline-block;background:#1B4332;color:#F5F0E8;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Open Dashboard</a></p><p style="color:#6b6b6b;font-size:12px;margin-top:20px">Scaling Minds</p></div></div>' });
      console.log("Weekly summary sent");
    } catch (err) { console.error("Weekly summary failed:", err.message); }
    return null;
  }
);
