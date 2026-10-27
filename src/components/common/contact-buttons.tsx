import { MessageCircle, Phone } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";

/** Call and text the operator: owners reach the team by phone rather than chat. Hidden until OPERATOR_PHONE is set. */
export async function ContactButtons() {
  const phone = env.OPERATOR_PHONE.replace(/[^\d+]/g, "");
  if (!phone) return null;
  const t = await getTranslations("contact");
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild size="sm">
        <a href={`tel:${phone}`}>
          <Phone aria-hidden />
          {t("call")}
        </a>
      </Button>
      <Button asChild size="sm" variant="secondary">
        <a href={`sms:${phone}`}>
          <MessageCircle aria-hidden />
          {t("text")}
        </a>
      </Button>
    </div>
  );
}
