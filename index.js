const functions = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const sgMail = require('@sendgrid/mail');
const fetch = require('node-fetch');

admin.initializeApp();
const db = admin.firestore();

const FROM_EMAIL = 'andy@scalingminds.com';
const FROM_NAME = 'Andy Hite — Scaling Minds';
const COACH_EMAIL = 'andy@scalingminds.com';

function getSendGridKey() {
  try {
    return functions.params ? process.env.SENDGRID_KEY : require('firebase-functions').config().sendgrid?.key;
  } catch(e) {
    return process.env.SENDGRID_KEY;
  }
}

// ─── BRAND STYLES ────────────────────────────────────────────────────────────
const BRAND = {
  green: '#1B4332',
  greenLight: '#2D6A4F',
  gold: '#B8860B',
  cream: '#FAF8F4',
  text: '#1a1a1a',
  muted: '#6b6b6b',
};

function emailWrapper(content) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:${BRAND.cream};font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.cream};padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <!-- Header -->
        <tr><td style="background:${BRAND.green};border-radius:12px 12px 0 0;padding:24px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <div style="font-family:Georgia,serif;font-size:20px;color:#F0EAD6;font-weight:400;">Scaling Minds</div>
                <div style="font-size:12px;color:rgba(240,234,214,0.7);margin-top:2px;">Client Portal</div>
              </td>
            </tr>
          </table>
        </td></tr>
        <!-- Body -->
        <tr><td style="background:#ffffff;padding:32px;border-left:1px solid #e8dfd0;border-right:1px solid #e8dfd0;">
          ${content}
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:${BRAND.cream};border:1px solid #e8dfd0;border-top:none;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;">
          <p style="margin:0;font-size:12px;color:${BRAND.muted};">© Scaling Minds · <a href="https://portal.scalingminds.com" style="color:${BRAND.greenLight};text-decoration:none;">Open Portal</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildEmail(type, toName, data) {
  const firstName = (toName || '').split(' ')[0] || 'there';

  if (type === 'todo') {
    return {
      subject: `New to-do added for you — Scaling Minds`,
      html: emailWrapper(`
        <h2 style="font-family:Georgia,serif;font-size:24px;color:${BRAND.green};margin:0 0 8px;">You have a new to-do</h2>
        <p style="font-size:14px;color:${BRAND.muted};margin:0 0 24px;">Hi ${firstName}, Andy added something to your list.</p>
        <div style="background:${BRAND.cream};border-left:4px solid ${BRAND.gold};border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:24px;">
          <p style="margin:0;font-size:16px;color:${BRAND.text};font-weight:600;">${data.text || ''}</p>
          ${data.link ? `<a href="${data.link}" style="font-size:13px;color:${BRAND.greenLight};margin-top:6px;display:inline-block;">↗ View resource</a>` : ''}
        </div>
        <a href="https://portal.scalingminds.com" style="display:inline-block;background:${BRAND.green};color:#F0EAD6;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Open Your Portal</a>
      `)
    };
  }

  if (type === 'session_note') {
    return {
      subject: `Session notes from ${data.date || 'your last session'} — Scaling Minds`,
      html: emailWrapper(`
        <h2 style="font-family:Georgia,serif;font-size:24px;color:${BRAND.green};margin:0 0 8px;">Session notes added</h2>
        <p style="font-size:14px;color:${BRAND.muted};margin:0 0 24px;">Hi ${firstName}, Andy posted notes from your session.</p>
        ${data.themes ? `<div style="margin-bottom:16px;"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:${BRAND.muted};margin-bottom:4px;">Key Themes</div><p style="margin:0;font-size:14px;color:${BRAND.text};line-height:1.6;">${data.themes}</p></div>` : ''}
        ${data.commitments ? `<div style="margin-bottom:16px;"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:${BRAND.muted};margin-bottom:4px;">Your Commitments</div><p style="margin:0;font-size:14px;color:${BRAND.text};line-height:1.6;">${data.commitments}</p></div>` : ''}
        <a href="https://portal.scalingminds.com" style="display:inline-block;background:${BRAND.green};color:#F0EAD6;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;margin-top:8px;">View Full Notes</a>
      `)
    };
  }

  if (type === 'document') {
    return {
      subject: `New resource shared with you — Scaling Minds`,
      html: emailWrapper(`
        <h2 style="font-family:Georgia,serif;font-size:24px;color:${BRAND.green};margin:0 0 8px;">A new resource was shared</h2>
        <p style="font-size:14px;color:${BRAND.muted};margin:0 0 24px;">Hi ${firstName}, Andy shared something with you in your portal.</p>
        <div style="background:${BRAND.cream};border:1px solid #e8dfd0;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
          <p style="margin:0;font-size:15px;color:${BRAND.text};font-weight:600;">${data.title || 'New document'}</p>
          ${data.desc ? `<p style="margin:6px 0 0;font-size:13px;color:${BRAND.muted};">${data.desc}</p>` : ''}
        </div>
        <a href="https://portal.scalingminds.com" style="display:inline-block;background:${BRAND.green};color:#F0EAD6;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Open Your Portal</a>
      `)
    };
  }

  if (type === 'habit') {
    return {
      subject: `New habit added for you — Scaling Minds`,
      html: emailWrapper(`
        <h2 style="font-family:Georgia,serif;font-size:24px;color:${BRAND.green};margin:0 0 8px;">New habit added</h2>
        <p style="font-size:14px;color:${BRAND.muted};margin:0 0 24px;">Hi ${firstName}, Andy added a new habit to track.</p>
        <div style="background:${BRAND.cream};border-left:4px solid ${BRAND.greenLight};border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:24px;">
          <p style="margin:0;font-size:16px;color:${BRAND.text};font-weight:600;">${data.name || ''}</p>
        </div>
        <a href="https://portal.scalingminds.com" style="display:inline-block;background:${BRAND.green};color:#F0EAD6;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Open Your Portal</a>
      `)
    };
  }

  return null;
}

// ─── sendNotification ─────────────────────────────────────────────────────────
exports.sendNotification = functions.onRequest(
  { cors: true, secrets: ['SENDGRID_KEY'] },
  async (req, res) => {
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

    const { to, toName, type, data } = req.body;

    if (!to || !type) {
      res.status(400).json({ error: 'Missing required fields: to, type' });
      return;
    }

    const email = buildEmail(type, toName, data || {});
    if (!email) {
      res.status(400).json({ error: `Unknown type: ${type}` });
      return;
    }

    const apiKey = process.env.SENDGRID_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'SendGrid key not configured' });
      return;
    }

    sgMail.setApiKey(apiKey);

    try {
      await sgMail.send({
        to,
        from: { email: FROM_EMAIL, name: FROM_NAME },
        subject: email.subject,
        html: email.html,
      });
      res.json({ success: true });
    } catch (err) {
      console.error('SendGrid error:', err.response?.body || err.message);
      res.status(500).json({ error: 'Failed to send email', detail: err.message });
    }
  }
);

// ─── calendlyWebhook ──────────────────────────────────────────────────────────
exports.calendlyWebhook = functions.onRequest(
  { cors: true },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }

    try {
      const payload = req.body;
      const eventType = payload?.event;
      if (eventType !== 'invitee.created') { res.json({ received: true }); return; }

      const invitee = payload?.payload?.invitee;
      const event = payload?.payload?.event;
      const email = invitee?.email;
      const startTime = event?.start_time;

      if (!email || !startTime) { res.status(400).json({ error: 'Missing email or start_time' }); return; }

      const snapshot = await db.collection('users').where('email', '==', email).limit(1).get();
      if (snapshot.empty) { res.json({ matched: false }); return; }

      const userDoc = snapshot.docs[0];
      await userDoc.ref.update({ nextSession: startTime });
      res.json({ success: true, uid: userDoc.id });
    } catch (err) {
      console.error('Calendly webhook error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ─── registerCalendlyWebhook ──────────────────────────────────────────────────
exports.registerCalendlyWebhook = functions.onRequest(
  { cors: true, secrets: ['CALENDLY_TOKEN'] },
  async (req, res) => {
    const token = process.env.CALENDLY_TOKEN;
    if (!token) { res.status(500).json({ error: 'CALENDLY_TOKEN not set' }); return; }

    const webhookUrl = 'https://us-central1-scaling-minds-portal.cloudfunctions.net/calendlyWebhook';

    try {
      // Get user URI first
      const meRes = await fetch('https://api.calendly.com/users/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const me = await meRes.json();
      const userUri = me?.resource?.uri;
      if (!userUri) { res.status(500).json({ error: 'Could not get Calendly user URI' }); return; }

      // Register webhook
      const whRes = await fetch('https://api.calendly.com/webhook_subscriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          events: ['invitee.created', 'invitee.canceled'],
          organization: me?.resource?.current_organization,
          user: userUri,
          scope: 'user',
        })
      });
      const wh = await whRes.json();
      res.json({ success: true, webhook: wh });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ─── weeklySummary ────────────────────────────────────────────────────────────
exports.weeklySummary = onSchedule(
  { schedule: 'every monday 07:00', timeZone: 'America/Chicago', secrets: ['SENDGRID_KEY'] },
  async () => {
    const snapshot = await db.collection('users').get();
    const clients = [];

    snapshot.forEach(doc => {
      const d = doc.data();
      const coachEmails = ['andyhitecoaching@gmail.com', 'andy@scalingminds.com'];
      if (coachEmails.includes(d.email)) return;

      const habits = d.habits || [];
      const completions = d.completions || {};
      const goals = (d.goals || []).filter(g => g.status === 'active');
      const notes = d.notes || {};

      // Count completions in last 7 days
      const days = [];
      for (let i = 0; i < 7; i++) {
        const dt = new Date();
        dt.setDate(dt.getDate() - i);
        days.push(dt.toISOString().split('T')[0]);
      }

      let totalDue = 0, totalDone = 0;
      habits.forEach(h => {
        totalDue += 7;
        days.forEach(k => {
          if ((completions[k] || []).includes(h.id)) totalDone++;
        });
      });

      const rate = totalDue > 0 ? Math.round((totalDone / totalDue) * 100) : 0;
      const journalEntries = days.filter(k => notes[k] && notes[k].trim()).length;

      clients.push({
        name: d.displayName || d.email,
        email: d.email,
        habitRate: rate,
        habits: habits.length,
        activeGoals: goals.length,
        journalEntries,
      });
    });

    if (clients.length === 0) return;

    const rows = clients.map(c =>
      `<tr style="border-bottom:1px solid #e8dfd0;">
        <td style="padding:10px 12px;font-size:13px;font-weight:600;color:#1B4332;">${c.name}</td>
        <td style="padding:10px 12px;font-size:13px;text-align:center;">${c.habitRate}%</td>
        <td style="padding:10px 12px;font-size:13px;text-align:center;">${c.habits}</td>
        <td style="padding:10px 12px;font-size:13px;text-align:center;">${c.activeGoals}</td>
        <td style="padding:10px 12px;font-size:13px;text-align:center;">${c.journalEntries}</td>
      </tr>`
    ).join('');

    const html = emailWrapper(`
      <h2 style="font-family:Georgia,serif;font-size:24px;color:#1B4332;margin:0 0 8px;">Weekly Client Summary</h2>
      <p style="font-size:14px;color:#6b6b6b;margin:0 0 24px;">Here's how your clients did this past week.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8dfd0;border-radius:8px;overflow:hidden;">
        <tr style="background:#1B4332;">
          <th style="padding:10px 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#F0EAD6;text-align:left;">Client</th>
          <th style="padding:10px 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#F0EAD6;text-align:center;">Habit Rate</th>
          <th style="padding:10px 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#F0EAD6;text-align:center;">Habits</th>
          <th style="padding:10px 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#F0EAD6;text-align:center;">Goals</th>
          <th style="padding:10px 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#F0EAD6;text-align:center;">Journal</th>
        </tr>
        ${rows}
      </table>
      <p style="margin:20px 0 0;font-size:12px;color:#6b6b6b;text-align:center;"><a href="https://portal.scalingminds.com" style="color:#2D6A4F;">Open Coach Dashboard</a></p>
    `);

    const apiKey = process.env.SENDGRID_KEY;
    if (!apiKey) return;
    sgMail.setApiKey(apiKey);
    await sgMail.send({
      to: COACH_EMAIL,
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject: `Weekly Client Summary — ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`,
      html,
    });
  }
);

// ─── nudgeInactiveClients ─────────────────────────────────────────────────────
// Runs daily at 8am CT. Sends a nudge email to clients who haven't logged in
// for exactly 7, 14, or 21 days. Tracks sent nudges to avoid duplicates.
exports.nudgeInactiveClients = onSchedule(
  { schedule: 'every day 08:00', timeZone: 'America/Chicago', secrets: ['SENDGRID_KEY'] },
  async () => {
    const apiKey = process.env.SENDGRID_KEY;
    if (!apiKey) return;
    sgMail.setApiKey(apiKey);

    const COACH_EMAILS = ['andyhitecoaching@gmail.com', 'andy@scalingminds.com'];
    const NUDGE_DAYS = [7, 14, 21];

    const snapshot = await db.collection('users').get();
    const now = new Date();

    for (const doc of snapshot.docs) {
      const d = doc.data();
      if (COACH_EMAILS.includes(d.email)) continue;
      if (!d.email) continue;

      // Use updatedAt as last activity — falls back to startDate
      const lastActive = d.updatedAt ? d.updatedAt.toDate() : null;
      if (!lastActive) continue;

      const daysSince = Math.floor((now - lastActive) / (1000 * 60 * 60 * 24));
      if (!NUDGE_DAYS.includes(daysSince)) continue;

      // Check if we already sent this nudge
      const nudgeKey = `nudge_${daysSince}`;
      const sentNudges = d.sentNudges || {};
      const alreadySent = sentNudges[nudgeKey];
      if (alreadySent) continue;

      const firstName = (d.displayName || d.email).split(' ')[0].split('@')[0];

      // Build email based on how many days inactive
      let subject, bodyHtml;

      if (daysSince === 7) {
        subject = `Checking in — Scaling Minds`;
        bodyHtml = `
          <h2 style="font-family:Georgia,serif;font-size:24px;color:#1B4332;margin:0 0 8px;">Hey ${firstName}</h2>
          <p style="font-size:15px;color:#1a1a1a;line-height:1.7;margin:0 0 16px;">Haven't seen you in the portal this week. The portal works best when you're in it between sessions, not just during them.</p>
          <p style="font-size:15px;color:#1a1a1a;line-height:1.7;margin:0 0 24px;">Even five minutes makes a difference.</p>
          <a href="https://portal.scalingminds.com" style="display:inline-block;background:#1B4332;color:#F0EAD6;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Jump Back In</a>
        `;
      } else if (daysSince === 14) {
        subject = `Two weeks — Scaling Minds`;
        bodyHtml = `
          <h2 style="font-family:Georgia,serif;font-size:24px;color:#1B4332;margin:0 0 8px;">Hey ${firstName}</h2>
          <p style="font-size:15px;color:#1a1a1a;line-height:1.7;margin:0 0 16px;">Two weeks. I notice these things.</p>
          <p style="font-size:15px;color:#1a1a1a;line-height:1.7;margin:0 0 8px;">"What gets measured gets managed." The portal is how we keep score. Come back and check in on what you said you'd do.</p>
          <a href="https://portal.scalingminds.com" style="display:inline-block;background:#1B4332;color:#F0EAD6;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;margin-top:16px;">Open Your Portal</a>
        `;
      } else if (daysSince === 21) {
        subject = `Three weeks — Scaling Minds`;
        bodyHtml = `
          <h2 style="font-family:Georgia,serif;font-size:24px;color:#1B4332;margin:0 0 8px;">Hey ${firstName}</h2>
          <p style="font-size:15px;color:#1a1a1a;line-height:1.7;margin:0 0 16px;">Three weeks away from the portal. Sessions are great, but the real work happens in between.</p>
          <p style="font-size:15px;color:#1a1a1a;line-height:1.7;margin:0 0 8px;">"We don't rise to the level of our goals, we fall to the level of our systems." This is your system. Let's use it.</p>
          <p style="font-size:15px;color:#1a1a1a;line-height:1.7;margin:0 0 24px;">Reply here or reach out directly if you need anything.</p>
          <a href="https://portal.scalingminds.com" style="display:inline-block;background:#1B4332;color:#F0EAD6;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Open Your Portal</a>
          <p style="margin:20px 0 0;font-size:13px;color:#6b6b6b;">Andy<br><a href="mailto:andy@scalingminds.com" style="color:#2D6A4F;">andy@scalingminds.com</a></p>
        `;
      }

      // Send the email
      try {
        await sgMail.send({
          to: d.email,
          from: { email: FROM_EMAIL, name: FROM_NAME },
          subject,
          html: emailWrapper(bodyHtml),
        });

        // Mark as sent so we don't fire again
        await doc.ref.update({
          [`sentNudges.${nudgeKey}`]: new Date().toISOString()
        });

        console.log(`Nudge sent to ${d.email} (day ${daysSince})`);
      } catch (err) {
        console.error(`Failed to nudge ${d.email}:`, err.message);
      }
    }
  }
);
