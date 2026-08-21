/**
 * PropertyPro - Replay a real Stripe event at the local billing webhook.
 *
 * `stripe events resend` only reaches endpoints registered in the dashboard,
 * so it cannot drive a local `stripe listen` session. This fetches the real
 * event from the API, signs it with STRIPE_SUBSCRIPTION_WEBHOOK_SECRET exactly
 * as Stripe would, and POSTs it — which is the only way to re-run a handler
 * against a delivery that already happened.
 *
 *   node src/scripts/replay-stripe-event.cjs evt_123 [url]
 *
 * Default url is http://localhost:3001/api/billing/webhook.
 */
const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

const env = {};
fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8")
  .split(/\r?\n/)
  .forEach((line) => {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  });

const eventId = process.argv[2];
const url =
  process.argv[3] || "http://localhost:3001/api/billing/webhook";

if (!eventId) {
  console.error("  usage: node src/scripts/replay-stripe-event.cjs evt_123 [url]");
  process.exit(1);
}

const secret = env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET;
if (!secret) {
  console.error("  STRIPE_SUBSCRIPTION_WEBHOOK_SECRET is not set in .env.local");
  console.error("  It is the whsec_ value printed by `stripe listen`.");
  process.exit(1);
}

const Stripe = require("stripe");
const stripe = new Stripe(env.STRIPE_SECRET_KEY);

(async () => {
  const event = await stripe.events.retrieve(eventId);
  const body = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": `t=${timestamp},v1=${signature}`,
    },
    body,
  });

  console.log(
    `  ${event.type} -> ${response.status} ${(await response.text()).slice(0, 200)}`
  );
})().catch((e) => {
  console.error("  ERROR:", e.message);
  process.exit(1);
});
