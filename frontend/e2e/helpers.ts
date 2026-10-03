import { createHmac } from "node:crypto";

import type { APIRequestContext } from "@playwright/test";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const API = process.env.E2E_BASE_URL ?? "http://localhost:8080";
const WEBHOOK_SECRET = "whsec_e2e_test_secret"; // matches docker-compose.e2e.yml

/** Polls Mailpit for the newest message to `to` and returns the first link in its text body. */
export async function linkFromEmail(request: APIRequestContext, to: string, subjectIncludes: string) {
  for (let i = 0; i < 30; i++) {
    const list = await (await request.get(`${MAILPIT}/api/v1/search?query=to:${encodeURIComponent(to)}`)).json();
    const msg = list.messages?.find((m: { Subject: string }) => m.Subject.includes(subjectIncludes));
    if (msg) {
      const full = await (await request.get(`${MAILPIT}/api/v1/message/${msg.ID}`)).json();
      const link = full.Text.match(/https?:\/\/\S+/)?.[0];
      if (link) return new URL(link).pathname + new URL(link).search;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no "${subjectIncludes}" email for ${to}`);
}

/** Sends a webhook signed exactly like Stripe's (t=<ts>,v1=HMAC-SHA256). */
export async function sendStripeEvent(request: APIRequestContext, type: string, object: Record<string, unknown>) {
  const payload = JSON.stringify({ id: `evt_e2e_${Date.now()}_${Math.random()}`, type, data: { object } });
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", WEBHOOK_SECRET).update(`${t}.${payload}`).digest("hex");
  const res = await request.post(`${API}/api/webhooks/stripe`, {
    data: payload,
    headers: { "Content-Type": "application/json", "Stripe-Signature": `t=${t},v1=${v1}` },
  });
  if (!res.ok()) throw new Error(`webhook rejected: ${res.status()} ${await res.text()}`);
}
