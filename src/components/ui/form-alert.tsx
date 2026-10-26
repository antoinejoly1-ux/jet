"use client";

import { useTranslations } from "next-intl";
import type { FormState } from "@/lib/forms";
import { Alert } from "./alert";

/** Shows a form's error code (or success message) in the user's language. */
export function FormAlert({ state }: { state: FormState }) {
  const t = useTranslations("formErrors");
  if (state.status === "error" && state.code)
    return <Alert tone="danger">{t.has(state.code) ? t(state.code) : t("generic")}</Alert>;
  if (state.status === "success" && state.message) return <Alert tone="success">{state.message}</Alert>;
  return null;
}
