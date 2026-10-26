import { FileJson, KeyRound, Webhook } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { ApiKeyForm, RevokeKeyButton, TestHookButton, WebhookForm } from "@/components/admin/developer-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { API_SCOPES, can } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listApiKeys } from "@/lib/services/api-keys";
import { listWebhooks } from "@/lib/services/webhooks";
import { WEBHOOK_EVENTS } from "@/lib/webhook-events";
import {
  createApiKeyAction,
  createWebhookAction,
  revokeApiKeyAction,
  setWebhookEnabledAction,
  testWebhookAction,
} from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("developers"))("title") };
}

export default async function DevelopersPage() {
  const viewer = await requireStaff();
  if (!can(viewer, "integrations:manage")) redirect("/admin/settings");
  const t = await getTranslations("developers");
  const format = await getFormatter();
  const [keys, hooks] = await Promise.all([listApiKeys(db, viewer), listWebhooks(db, viewer)]);
  const when = (d: Date | null) => (d ? format.relativeTime(d) : t("never"));

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <Button asChild size="sm" variant="secondary">
            <a href="/api/v1/openapi.json" target="_blank" rel="noreferrer">
              <FileJson aria-hidden />
              {t("openapi")}
            </a>
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <KeyRound className="text-muted size-4" aria-hidden />
            <CardTitle>{t("keysTitle")}</CardTitle>
          </div>
          {keys.length === 0 ? (
            <p className="text-muted mb-4 text-sm">{t("noKeys")}</p>
          ) : (
            <ul className="divide-border mb-5 divide-y">
              {keys.map((k) => (
                <li key={k.id} className="flex flex-wrap items-start gap-3 py-3 first:pt-0">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {k.name}
                      {k.revokedAt ? <Badge>{t("revoked")}</Badge> : null}
                    </p>
                    <p className="text-muted font-mono text-xs">{k.prefix}_…</p>
                    <p className="text-muted text-xs">
                      {k.scopes.join(", ")} · {t("lastUsed", { when: when(k.lastUsedAt) })}
                    </p>
                  </div>
                  {!k.revokedAt ? <RevokeKeyButton action={revokeApiKeyAction.bind(null, k.id)} /> : null}
                </li>
              ))}
            </ul>
          )}
          <div className="border-border border-t pt-4">
            <ApiKeyForm
              action={createApiKeyAction}
              scopes={API_SCOPES.map((s) => ({ value: s, label: t(`scopeNames.${s.replace(":", "_")}`) }))}
            />
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-center gap-2">
            <Webhook className="text-muted size-4" aria-hidden />
            <CardTitle>{t("hooksTitle")}</CardTitle>
          </div>
          {hooks.length === 0 ? (
            <p className="text-muted mb-4 text-sm">{t("noHooks")}</p>
          ) : (
            <ul className="divide-border mb-5 divide-y">
              {hooks.map((h) => (
                <li key={h.id} className="flex flex-col gap-2 py-3 first:pt-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {h.name || h.url}
                    <Badge tone={h.disabledAt ? "neutral" : "success"}>
                      {h.disabledAt ? t("disabled") : t("active")}
                    </Badge>
                  </p>
                  <p className="text-muted text-xs break-all">{h.url}</p>
                  <p className="text-muted text-xs">{h.events.join(", ")}</p>
                  {h.deliveries.length ? (
                    <ul className="flex flex-col gap-0.5 text-xs">
                      {h.deliveries.slice(0, 5).map((d) => (
                        <li key={d.id} className="tabular flex flex-wrap gap-x-2">
                          <span
                            className={
                              d.deliveredAt ? "text-success" : d.nextAttemptAt ? "text-warning" : "text-danger"
                            }
                          >
                            {d.deliveredAt
                              ? t("delivered")
                              : d.nextAttemptAt
                                ? t("retrying", { attempts: d.attempts })
                                : t("gaveUp")}
                          </span>
                          <span>{d.type}</span>
                          <span className="text-muted">
                            {d.responseStatus ? `HTTP ${d.responseStatus} · ` : d.lastError ? `${d.lastError} · ` : ""}
                            {format.relativeTime(d.createdAt)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2">
                    {!h.disabledAt ? <TestHookButton action={testWebhookAction.bind(null, h.id)} /> : null}
                    <form action={setWebhookEnabledAction.bind(null, h.id, !!h.disabledAt)}>
                      <Button type="submit" size="sm" variant="ghost">
                        {h.disabledAt ? t("enable") : t("disable")}
                      </Button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="border-border border-t pt-4">
            <WebhookForm action={createWebhookAction} events={WEBHOOK_EVENTS.map((e) => ({ value: e, label: e }))} />
          </div>
        </Card>
      </div>
      <p className="text-muted mt-4 text-sm">{t("docsHint")}</p>
    </>
  );
}
