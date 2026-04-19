// Quick smoke-test for Resend email. Run with:
//   RESEND_API_KEY=re_xxx node scripts/test-email.mjs
const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  console.error("❌  RESEND_API_KEY is not set");
  process.exit(1);
}

const from = process.env.RESEND_FROM || "VideoJam <onboarding@resend.dev>";
const to = process.argv[2] || "scott.mckay@controlaltdeleted.com";

const res = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
  },
  body: JSON.stringify({
    from,
    to: [to],
    subject: "VideoJam — test email",
    html: `<p>If you're reading this, email is wired up correctly. 🎉</p><p style="color:#888;font-size:12px">Sent from VideoJam test script.</p>`,
    text: "If you're reading this, email is wired up correctly.",
  }),
});

const body = await res.json();
if (res.ok) {
  console.log(`✅  Sent to ${to} — id: ${body.id}`);
} else {
  console.error("❌  Resend error:", res.status, body);
}
