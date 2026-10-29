import { MessageCircle, Phone } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";
import { smsHref, telHref } from "@/lib/phone";

/** Call and text the operator: owners reach the team by phone rather than chat. Hidden until OPERATOR_PHONE is set. */
export async function ContactButtons() {
  const phone = env.OPERATOR_PHONE;
  if (!phone) return null;
  const t = await getTranslations("contact");
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild>
        <a href={telHref(phone)}>
          <Phone aria-hidden />
          {t("call")}
        </a>
      </Button>
      <Button asChild variant="secondary">
        <a href={smsHref(phone)}>
          <MessageCircle aria-hidden />
          {t("text")}
        </a>
      </Button>
    </div>
  );
}
