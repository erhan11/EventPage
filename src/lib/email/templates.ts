const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function shell(accent: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#0a0a0b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#f2f1ec">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px" cellpadding="0" cellspacing="0">
<tr><td style="font:500 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.18em;text-transform:uppercase;color:#8d8c86;padding-bottom:24px">EventPage</td></tr>
${body}
<tr><td style="padding-top:32px;border-top:1px solid #232325;font-size:12px;color:#8d8c86">Sent by EventPage on behalf of the organizer. <span style="color:${esc(accent)}">●</span></td></tr>
</table></td></tr></table></body></html>`;
}

export function ticketsEmail(p: {
  eventTitle: string;
  when: string;
  venue: string;
  buyerName: string;
  url: string;
  codes: { type: string; code: string }[];
  accent: string;
}) {
  const btnText = /^#[0-9a-f]{6}$/i.test(p.accent) && parseInt(p.accent.slice(1), 16) > 0x888888 ? "#0a0a0a" : "#ffffff";
  const rows = p.codes
    .map((c) => `<tr><td style="padding:10px 0;border-bottom:1px solid #232325">${esc(c.type)}</td><td align="right" style="padding:10px 0;border-bottom:1px solid #232325;font-family:ui-monospace,Menlo,monospace;letter-spacing:.2em">${esc(c.code.slice(0, 4))}-${esc(c.code.slice(4))}</td></tr>`)
    .join("");
  const html = shell(
    p.accent,
    `<tr><td style="font-size:40px;line-height:1;font-weight:700;letter-spacing:-.04em">${esc(p.eventTitle)}</td></tr>
<tr><td style="padding:14px 0 28px;font:12px/1.6 ui-monospace,Menlo,monospace;letter-spacing:.12em;text-transform:uppercase;color:#8d8c86">${esc(p.when)}<br>${esc(p.venue)}</td></tr>
<tr><td style="font-size:16px;line-height:1.6">Hi ${esc(p.buyerName.split(" ")[0])}, you're in. Your ${p.codes.length === 1 ? "ticket is" : `${p.codes.length} tickets are`} ready — show the QR code at the door.</td></tr>
<tr><td style="padding:28px 0"><a href="${esc(p.url)}" style="display:inline-block;background:${esc(p.accent)};color:${btnText};text-decoration:none;font-weight:600;padding:14px 26px;border-radius:999px">Open my tickets →</a></td></tr>
<tr><td><table role="presentation" width="100%" style="font-size:14px">${rows}</table></td></tr>
<tr><td style="padding-top:20px;font-size:13px;line-height:1.6;color:#8d8c86">Keep this email private: anyone with the link or codes can use your tickets. Each ticket admits one person once.</td></tr>`,
  );
  const text = `${p.eventTitle}\n${p.when} · ${p.venue}\n\nYour tickets: ${p.url}\n\n${p.codes.map((c) => `${c.type}: ${c.code}`).join("\n")}\n\nKeep this private — each ticket admits one person once.`;
  return { subject: `Your tickets — ${p.eventTitle}`, html, text };
}

export function staffInviteEmail(p: { eventTitle: string; orgName: string; url: string }) {
  const html = shell(
    "#d4ff3a",
    `<tr><td style="font-size:32px;line-height:1.05;font-weight:700;letter-spacing:-.04em">Join the door team for ${esc(p.eventTitle)}</td></tr>
<tr><td style="padding:16px 0;font-size:16px;line-height:1.6">${esc(p.orgName)} invited you to scan tickets at this event. The link works once and expires in 7 days.</td></tr>
<tr><td style="padding:12px 0 8px"><a href="${esc(p.url)}" style="display:inline-block;background:#d4ff3a;color:#0a0a0a;text-decoration:none;font-weight:600;padding:14px 26px;border-radius:999px">Accept invite →</a></td></tr>`,
  );
  return { subject: `Door staff invite — ${p.eventTitle}`, html, text: `${p.orgName} invited you to scan tickets for ${p.eventTitle}.\n\nAccept: ${p.url}\n\nSingle use, expires in 7 days.` };
}
