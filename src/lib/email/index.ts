import "server-only";

/**
 * Transactional email via Resend's HTTP API.
 * Disabled (logs only) until RESEND_API_KEY and EMAIL_FROM are set — so the app works
 * before the sending domain is verified.
 */
export interface Email {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Same key → Resend sends at most once (24h window). */
  idempotencyKey?: string;
}

export function emailEnabled() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(mail: Email): Promise<{ sent: boolean; id?: string; error?: string }> {
  if (!emailEnabled()) {
    console.info(`[email] disabled — would send "${mail.subject}"`);
    return { sent: false, error: "disabled" };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "content-type": "application/json",
      ...(mail.idempotencyKey ? { "idempotency-key": mail.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [mail.to],
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      ...(process.env.EMAIL_REPLY_TO ? { reply_to: process.env.EMAIL_REPLY_TO } : {}),
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const error = `${res.status} ${(await res.text()).slice(0, 200)}`;
    console.error("[email] send failed", error);
    return { sent: false, error };
  }
  const json = (await res.json()) as { id?: string };
  return { sent: true, id: json.id };
}
