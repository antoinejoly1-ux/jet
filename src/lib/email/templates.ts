import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import { env } from "@/lib/env";
import { formatPhone } from "@/lib/phone";
import type { Email } from "./send";

type Locale = "fr" | "en";

/** Email copy lives with the rest of the app's strings, under `emails`. */
const copy = { fr: fr.emails, en: en.emails } as const;

/** Emails people can turn off in Settings: they carry a link to their preferences (Loi 25, CASL). */
const OPTIONAL: ReadonlySet<TemplateName> = new Set([
  "invoiceIssued",
  "budgetPublished",
  "newMessage",
  "hoursLow",
  "maintenancePlanned",
]);

export type TemplateName = keyof typeof fr.emails.templates;

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Builds a one-action email (a sentence and a button) in the recipient's language. */
export function actionEmail(
  name: TemplateName,
  to: string,
  url: string,
  locale: Locale = "fr",
  vars: Record<string, string> = {},
): Email {
  const fill = (text: string) => text.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);
  const c = copy[locale];
  const raw = c.templates[name];
  const t = { subject: fill(raw.subject), body: fill(raw.body), cta: raw.cta };
  const phone = env.OPERATOR_PHONE ? formatPhone(env.OPERATOR_PHONE, locale) : "";
  const help = phone ? c.help.replace("{phone}", phone) : "";
  const prefs = OPTIONAL.has(name) ? `${env.BETTER_AUTH_URL}/account#notifications` : "";
  // French puts a (non-breaking) space before a colon.
  const colon = locale === "fr" ? "\u00a0:" : ":";
  const html = `<!doctype html><html lang="${locale}-CA"><body style="margin:0;background:#f3f1ed;font-family:Montserrat,Arial,sans-serif;color:#171615">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:20px;padding:36px">
<tr><td style="padding-bottom:24px"><div style="font-size:18px;font-weight:600;letter-spacing:0.28em">UNIVAIR</div><div style="font-size:9px;font-weight:600;letter-spacing:0.32em;color:#7a5530;padding-top:4px">MANAGEMENT</div></td></tr>
<tr><td style="font-size:15px;line-height:22px;padding-bottom:12px">${escape(c.greeting)}</td></tr>
<tr><td style="font-size:15px;line-height:22px;padding-bottom:24px">${escape(t.body)}</td></tr>
<tr><td><a href="${escape(url)}" style="display:inline-block;background:#171615;color:#ffffff;text-decoration:none;font-weight:600;padding:13px 24px;border-radius:999px">${escape(t.cta)}</a></td></tr>
<tr><td style="font-size:15px;line-height:22px;padding-top:28px">${escape(c.signature)}${help ? `<br><span style="font-size:13px;color:#5f5a53">${escape(help)}</span>` : ""}</td></tr>
<tr><td style="font-size:12px;line-height:18px;color:#5f5a53;padding-top:24px">${escape(c.linkFallback)}<br>${escape(url)}</td></tr>
${prefs ? `<tr><td style="font-size:12px;line-height:18px;color:#5f5a53;padding-top:16px">${escape(c.preferences)} <a href="${escape(prefs)}" style="color:#7a5530">${escape(c.preferencesLink)}</a></td></tr>` : ""}
</table></td></tr></table></body></html>`;
  const text = [
    c.greeting,
    "",
    t.body,
    "",
    `${t.cta}${colon} ${url}`,
    "",
    c.signature,
    ...(help ? [help] : []),
    ...(prefs ? ["", `${c.preferencesLink}${colon} ${prefs}`] : []),
  ].join("\n");
  return { to, subject: t.subject, html, text };
}
