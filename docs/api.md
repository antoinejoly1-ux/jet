# Connecting other software: API and webhooks

The portal exposes a REST API at `/api/v1` and sends signed webhooks, so accounting software, Zapier or Make can read
and write the same data as the screens, under the same rules. The full description is the OpenAPI document at
**`/api/v1/openapi.json`** (import it into Postman, Insomnia or a Zapier/Make custom app).

## Keys and scopes

An admin creates keys in **Admin → Settings → Developers**. A key is shown once, stored only as a hash, and can be
revoked at any time. Each key carries scopes:

| Scope              | Allows                                                    |
| ------------------ | --------------------------------------------------------- |
| `owners:read`      | `GET /owners`                                             |
| `fleet:read`       | `GET /aircraft`, `GET /shares`, `GET /flights`            |
| `finance:read`     | `GET /invoices`, `GET /transactions`                      |
| `finance:write`    | `POST /transactions`                                      |
| `operations:write` | `POST /flights`, `POST /flights/{id}/complete`, `/cancel` |

Every change made with a key goes through the same services, validation and audit log as the screens; the audit log
records the admin who created the key. Limit: 120 requests per minute per key (HTTP 429 beyond).

## Conventions

- `Authorization: Bearer jet_xxxxxxxx_…`
- Responses: `{ "data": … }`. Errors: `{ "error": { "code", "message", "fields"? } }` with 400, 401, 403, 404, 409 or 429.
- Money is integer **cents** with a `currency`, always `CAD` (it may be left out when writing); durations are **minutes**; times are ISO 8601 (responses in UTC).
- Ledger entries are never edited through the API: a correction is a reversal, made in the portal.

```sh
curl -H "Authorization: Bearer $JET_KEY" "https://portal.example.com/api/v1/transactions?year=2026&kind=cost"

curl -X POST -H "Authorization: Bearer $JET_KEY" -H "Content-Type: application/json" \
  -d '{"aircraftId":"…","shareId":"…","fromAirport":"CYUL","toAirport":"KPBI","departsAt":"2026-12-20T14:00:00Z"}' \
  https://portal.example.com/api/v1/flights
```

## Webhooks

Also in **Settings → Developers**: give a name, an HTTPS URL and the events to receive. The signing secret is shown
once. Events: `invoice.issued`, `invoice.paid`, `invoice.voided`, `transaction.created`, `budget.published`,
`flight.scheduled`, `flight.completed`, `flight.cancelled`, `maintenance.planned` (and `webhook.test` from the "Send a
test" button).

Each event is written in the same database transaction as the change, so it's sent if and only if the change happened.
Deliveries go out within about five minutes, are retried after 1, 5, 15, 60, 180, 360, 720 and 1,440 minutes on any
non-2xx answer or timeout (10 s), and the last ten per endpoint are listed on the page. Redirects aren't followed and
addresses that resolve to private networks are refused.

```http
POST /your/endpoint
Content-Type: application/json
Jet-Event: flight.completed
Jet-Delivery: 0192…            (the same id on every retry: use it to ignore duplicates)
Jet-Signature: t=1792990000,v1=5f2c…

{"id":"0192…","type":"flight.completed","createdAt":"2026-10-26T14:02:11.000Z","data":{"flightId":"…","flightMinutes":95,…}}
```

Verify the signature before trusting a delivery:

```js
import { createHmac, timingSafeEqual } from "node:crypto";

function verify(rawBody, header, secret) {
  const { t, v1 } = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false; // older than 5 minutes: replay
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}
```

## Running the delivery job

`/api/cron/webhooks` fans events out and delivers what is due. It is called every five minutes by
`.github/workflows/scheduled-jobs.yml` (with `APP_URL` and `CRON_SECRET` set), like the other jobs.
