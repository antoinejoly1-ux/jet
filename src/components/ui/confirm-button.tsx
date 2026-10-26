"use client";

import { useState, type ReactNode } from "react";
import { Button, type ButtonProps } from "./button";

/**
 * A destructive submit button that asks once, inline, before submitting its
 * form: the first click turns it into "Confirm / Cancel".
 */
export function ConfirmButton({
  children,
  confirmLabel,
  cancelLabel,
  question,
  variant = "secondary",
  size = "sm",
}: {
  children: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  question: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
}) {
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <Button type="button" variant={variant} size={size} onClick={() => setAsking(true)}>
        {children}
      </Button>
    );
  return (
    <span role="group" aria-label={question} className="inline-flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium">{question}</span>
      <Button type="submit" variant="danger" size={size}>
        {confirmLabel}
      </Button>
      <Button type="button" variant="ghost" size={size} onClick={() => setAsking(false)}>
        {cancelLabel}
      </Button>
    </span>
  );
}
