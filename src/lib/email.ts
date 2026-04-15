import type { PartyRecap } from "./types";
import { formatDuration } from "./recap";

// Thin wrapper around Resend's REST API (https://resend.com/docs). We
// pick Resend over nodemailer/SMTP because it's a single HTTP call with
// no deps — matches the rest of this app's "one small fetch" style.
// Config is entirely via env:
//   RESEND_API_KEY  — required to enable email at all
//   RESEND_FROM     — optional; e.g. "Jukebox <recap@yourdomain.com>".
//                     Falls back to Resend's sandbox "onboarding@resend.dev".
//
// When the key isn't set we return a `not-configured` failure — callers
// surface that in the response so the host sees "email not configured"
// rather than a silent no-op.

export interface SendResult {
  ok: boolean;
  reason?: string;
}

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export async function sendRecapEmail(
  to: string,
  recap: PartyRecap,
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, reason: "not-configured" };
  }
  if (!to || !/.+@.+\..+/.test(to)) {
    return { ok: false, reason: "invalid-recipient" };
  }
  const from = process.env.RESEND_FROM || "Jukebox <onboarding@resend.dev>";
  const subject = `Your Jukebox recap — ${recap.name}`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html: renderRecapHtml(recap),
        text: renderRecapText(recap),
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[email] resend failed", res.status, body);
      return { ok: false, reason: `resend-${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("[email] resend threw", err);
    return { ok: false, reason: "network" };
  }
}

// Tiny escape — just for the recap's user-entered fields (display names,
// song titles) that end up in HTML context. Not a general-purpose
// sanitizer; the strings are already length-capped by the store.
function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderRecapHtml(recap: PartyRecap): string {
  const durationMs = recap.endedAt - recap.startedAt;
  const elapsedHrs = Math.max(0, Math.floor(durationMs / 3_600_000));
  const elapsedMins = Math.max(0, Math.floor((durationMs % 3_600_000) / 60_000));
  const elapsed =
    elapsedHrs > 0 ? `${elapsedHrs}h ${elapsedMins}m` : `${elapsedMins}m`;

  const topRows = recap.topRequesters
    .map(
      (r, i) => `
        <tr>
          <td style="padding:6px 8px;color:#888;font-variant-numeric:tabular-nums">${i + 1}</td>
          <td style="padding:6px 8px">${esc(r.name)}</td>
          <td style="padding:6px 8px;color:#888;text-align:right">${r.count} song${r.count === 1 ? "" : "s"}</td>
        </tr>`,
    )
    .join("");

  const historyRows = recap.history
    .map((h) => {
      const dur = typeof h.playedSeconds === "number"
        ? formatDuration(h.playedSeconds)
        : "—";
      return `
        <tr>
          <td style="padding:6px 8px;vertical-align:top">
            <img src="${esc(h.thumbnail)}" alt="" width="64" height="36" style="border-radius:4px;object-fit:cover;display:block" />
          </td>
          <td style="padding:6px 8px;vertical-align:top">
            <div style="color:#111">${esc(h.title)}</div>
            <div style="color:#888;font-size:12px">Added by ${esc(h.addedBy)}</div>
          </td>
          <td style="padding:6px 8px;vertical-align:top;color:#888;text-align:right;font-variant-numeric:tabular-nums">${dur}</td>
        </tr>`;
    })
    .join("");

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f3fa;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111">
    <div style="max-width:620px;margin:0 auto;padding:24px 16px">
      <div style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e7e4ef">
        <div style="padding:20px 24px;border-bottom:1px solid #eee">
          <div style="color:#888;font-size:11px;letter-spacing:0.15em;text-transform:uppercase">Jukebox recap</div>
          <h1 style="margin:4px 0 0;font-size:22px">${esc(recap.name)}</h1>
          <div style="color:#888;font-size:13px;margin-top:4px">
            Code <code style="background:#f1edfa;padding:1px 6px;border-radius:4px">${esc(recap.code)}</code>
            · ${recap.totalPlayed} song${recap.totalPlayed === 1 ? "" : "s"} played
            · ${elapsed} elapsed
            · ${formatDuration(recap.totalSeconds)} of music
          </div>
        </div>

        <div style="padding:18px 24px">
          <h2 style="margin:0 0 8px;font-size:15px">Top requesters</h2>
          ${
            recap.topRequesters.length > 0
              ? `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px">${topRows}</table>`
              : `<p style="color:#888;margin:0">Nobody added a song this party.</p>`
          }
        </div>

        <div style="padding:18px 24px;border-top:1px solid #eee">
          <h2 style="margin:0 0 8px;font-size:15px">What played</h2>
          ${
            recap.history.length > 0
              ? `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px">${historyRows}</table>`
              : `<p style="color:#888;margin:0">No songs played.</p>`
          }
        </div>
      </div>
      <p style="color:#888;font-size:12px;text-align:center;margin:16px 0 0">
        Sent automatically when you ended the party. Replies go nowhere.
      </p>
    </div>
  </body>
</html>`;
}

function renderRecapText(recap: PartyRecap): string {
  const lines: string[] = [];
  lines.push(`Jukebox recap — ${recap.name} (code ${recap.code})`);
  lines.push(
    `${recap.totalPlayed} song${recap.totalPlayed === 1 ? "" : "s"} played · ${formatDuration(recap.totalSeconds)} of music`,
  );
  lines.push("");
  lines.push("Top requesters:");
  if (recap.topRequesters.length === 0) {
    lines.push("  (no requests)");
  } else {
    recap.topRequesters.forEach((r, i) => {
      lines.push(`  ${i + 1}. ${r.name} — ${r.count}`);
    });
  }
  lines.push("");
  lines.push("What played:");
  if (recap.history.length === 0) {
    lines.push("  (nothing)");
  } else {
    recap.history.forEach((h) => {
      const dur = typeof h.playedSeconds === "number"
        ? formatDuration(h.playedSeconds)
        : "?";
      lines.push(`  • ${h.title} — ${h.addedBy} · ${dur}`);
    });
  }
  return lines.join("\n");
}
