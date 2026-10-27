import type { Email } from "./send";

type Locale = "fr" | "en";

const copy = {
  verify: {
    fr: {
      subject: "Confirmez votre adresse courriel",
      body: "Confirmez votre adresse pour activer votre compte.",
      cta: "Confirmer mon adresse",
    },
    en: {
      subject: "Confirm your email address",
      body: "Confirm your address to activate your account.",
      cta: "Confirm my address",
    },
  },
  reset: {
    fr: {
      subject: "Réinitialiser votre mot de passe",
      body: "Vous avez demandé un nouveau mot de passe. Ce lien expire dans une heure.",
      cta: "Choisir un nouveau mot de passe",
    },
    en: {
      subject: "Reset your password",
      body: "You asked for a new password. This link expires in one hour.",
      cta: "Choose a new password",
    },
  },
  magicLink: {
    fr: {
      subject: "Votre lien de connexion",
      body: "Utilisez ce lien pour vous connecter. Il expire dans 10 minutes.",
      cta: "Me connecter",
    },
    en: {
      subject: "Your sign-in link",
      body: "Use this link to sign in. It expires in 10 minutes.",
      cta: "Sign me in",
    },
  },
  invitation: {
    fr: {
      subject: "Votre accès au portail des propriétaires",
      body: "Vous êtes invité à accéder au portail. Ce lien expire dans 7 jours.",
      cta: "Accepter l'invitation",
    },
    en: {
      subject: "Your access to the owner portal",
      body: "You've been invited to the portal. This link expires in 7 days.",
      cta: "Accept the invitation",
    },
  },
  invoiceIssued: {
    fr: {
      subject: "Nouvelle facture {number}",
      body: "Une nouvelle facture de {amount} pour {aircraft} est disponible dans votre portail.",
      cta: "Voir la facture",
    },
    en: {
      subject: "New invoice {number}",
      body: "A new invoice of {amount} for {aircraft} is available in your portal.",
      cta: "View the invoice",
    },
  },
  budgetPublished: {
    fr: {
      subject: "Votre budget {year} est disponible",
      body: "Le budget {year} de {aircraft} a été publié. Vous pouvez le consulter dans votre portail.",
      cta: "Voir mes finances",
    },
    en: {
      subject: "Your {year} budget is ready",
      body: "The {year} budget for {aircraft} has been published. You can review it in your portal.",
      cta: "View my finances",
    },
  },
  newMessage: {
    fr: {
      subject: "Nouveau message de notre équipe",
      body: "Notre équipe vous a répondu : « {preview} »",
      cta: "Lire et répondre",
    },
    en: {
      subject: "New message from our team",
      body: "Our team replied: \u201c{preview}\u201d",
      cta: "Read and reply",
    },
  },
  hoursLow: {
    fr: {
      subject: "Il vous reste {hours} sur {aircraft}",
      body: "Votre solde d'heures sur {aircraft} est passé sous 10 % de votre allocation annuelle : il reste {hours}.",
      cta: "Voir mon solde",
    },
    en: {
      subject: "{hours} left on {aircraft}",
      body: "Your hours on {aircraft} are below 10% of your annual allotment: {hours} remain.",
      cta: "See my balance",
    },
  },
  maintenancePlanned: {
    fr: {
      subject: "Maintenance prévue sur {aircraft}",
      body: "{aircraft} sera en maintenance à partir du {when}. L'appareil ne sera pas disponible pendant ce temps.",
      cta: "Voir l'appareil",
    },
    en: {
      subject: "Maintenance planned on {aircraft}",
      body: "{aircraft} will be in maintenance from {when}. The aircraft won't be available during that time.",
      cta: "View the aircraft",
    },
  },
} as const;

export type TemplateName = keyof typeof copy;

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
  const raw = copy[name][locale];
  const t = { subject: fill(raw.subject), body: fill(raw.body), cta: raw.cta };
  const html = `<!doctype html><html lang="${locale}"><body style="margin:0;background:#f4f5f7;font-family:Inter,Arial,sans-serif;color:#0b1220">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px">
<tr><td style="font-size:18px;font-weight:700;padding-bottom:16px">Jet</td></tr>
<tr><td style="font-size:15px;line-height:22px;padding-bottom:24px">${escape(t.body)}</td></tr>
<tr><td><a href="${escape(url)}" style="display:inline-block;background:#0b1220;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">${escape(t.cta)}</a></td></tr>
<tr><td style="font-size:12px;line-height:18px;color:#5b6475;padding-top:24px">${escape(url)}</td></tr>
</table></td></tr></table></body></html>`;
  return { to, subject: t.subject, html, text: `${t.body}\n\n${t.cta}: ${url}` };
}
