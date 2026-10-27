"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

type Role = "owner" | "assistant" | "read_only";

/** One login's role for an owner, and whether a non-owner sees finances. */
export function MemberAccessForm({
  name,
  role: initialRole,
  canSeeFinances,
  action,
}: {
  name: string;
  role: Role;
  canSeeFinances: boolean;
  action: (formData: FormData) => Promise<void>;
}) {
  const t = useTranslations("owners");
  const [role, setRole] = useState<Role>(initialRole);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <Select
        name="role"
        aria-label={t("memberRoleFor", { name })}
        value={role}
        onChange={(e) => setRole(e.target.value as Role)}
        className="h-9 w-auto"
      >
        {(["owner", "assistant", "read_only"] as const).map((r) => (
          <option key={r} value={r}>
            {t(`memberRoles.${r}`)}
          </option>
        ))}
      </Select>
      {role === "owner" ? null : (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="canSeeFinances"
            defaultChecked={canSeeFinances}
            className="accent-accent size-4"
          />
          {t("seesFinances")}
        </label>
      )}
      <Button type="submit" size="sm" variant="secondary">
        {t("saveAccess")}
      </Button>
    </form>
  );
}
