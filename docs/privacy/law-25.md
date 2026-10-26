# Quebec Law 25: how the portal complies

The portal holds personal and financial information about aircraft owners, so it follows Quebec's _Act respecting the
protection of personal information in the private sector_ as amended by Law 25. This page maps each obligation to what
the software does and what the operator still has to do. **It is a working document to review with the operator's
lawyer, not legal advice.**

## Checklist

| Obligation                                                         | In the portal                                                                                                                                   | Still to do (operator)                                                                            |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Name a person in charge of protecting personal information         | `PRIVACY_OFFICER_NAME` and `PRIVACY_OFFICER_EMAIL` are published on `/privacy`                                                                  | Choose the person (by default the CEO) and set both variables                                     |
| Publish a privacy policy in clear terms                            | `/privacy`, French and English, public, linked from Account                                                                                     | Have the lawyer review the text in `messages/*.json` (`privacyPolicy`); set `OPERATOR_LEGAL_NAME` |
| Privacy impact assessment before communicating data outside Quebec | Draft below                                                                                                                                     | Complete and sign it before launch; sign data-processing terms with Vercel and Resend             |
| Register of confidentiality incidents                              | Admin → Settings → Personal information: every incident with dates, data, people, severity, measures, and when the CAI and people were notified | Follow the incident procedure below                                                               |
| Access, correction and portability requests within 30 days         | Owners download all their data as JSON from Account at any time; requests are filed from Account and tracked with a 30-day countdown for admins | Answer each request in the portal before its deadline                                             |
| Consent for secondary uses; withdraw consent                       | No secondary use, no advertising, no sale. Optional emails can be turned off on Account                                                         | —                                                                                                 |
| Retention and destruction                                          | Daily job deletes what has served its purpose (table below); financial records are kept                                                         | Decide when to anonymise former owners after the six-year period                                  |
| Security measures proportionate to sensitivity                     | See [the security review](../security-review.md)                                                                                                | —                                                                                                 |

## Retention schedule

Defined in `RETENTION` in `src/lib/services/privacy.ts` and applied every night by `/api/cron/retention`.

| Data                                        | Kept for                                       | Then                                           |
| ------------------------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| Expired sessions and sign-in or reset links | Until they expire                              | Deleted                                        |
| Invitations never accepted                  | 90 days after expiring or being revoked        | Deleted                                        |
| Read notifications                          | 1 year                                         | Deleted                                        |
| Scheduling sync logs                        | 1 year                                         | Deleted                                        |
| Ledgers, invoices, budgets, flights         | At least 6 years after the end of the tax year | Kept; removal is a deliberate, logged decision |
| Audit log                                   | As long as the records it describes            | Kept                                           |
| Messages and attachments                    | As long as the owner relationship              | Deleted or anonymised after it ends            |

## Handling a request

1. The owner files it from **Account → Your personal information**, or by email to the privacy officer (file it on their
   behalf so the deadline is tracked).
2. Admins get a notification. **Admin → Settings → Personal information** lists open requests, oldest first, with the
   days left out of 30.
3. Do what is asked: correct the owner's record, export their data, or explain what can't be deleted (financial records
   under tax law).
4. Close the request with a written answer. The owner sees the answer on their Account page.

## Handling a confidentiality incident

1. Contain it (revoke access, rotate a key, recall an email).
2. Record it in the register the same day, even if minor.
3. Assess the risk of serious injury (sensitivity of the data, likely misuse, consequences).
4. If serious: notify the Commission d'accès à l'information and the people concerned promptly, then record both dates
   in the register. The register flags serious incidents not yet reported.

## Privacy impact assessment (draft)

**Purpose.** Give owners self-service access to their aircraft share, flights, hours, finances and invoices, and give
the operator's team one place to manage them.

**Information.** Identity and contact details; share, hours and flights; aircraft-related costs, payments and
invoices; messages with dispatch and their attachments; sign-in IP addresses, browser and an audit log. No health
information, no government identifiers, no payment card numbers.

**Where it goes.**

| Provider      | Role               | Location                                 | Stores data?                                 |
| ------------- | ------------------ | ---------------------------------------- | -------------------------------------------- |
| AWS (RDS, S3) | Database and files | Canada, `ca-central-1` (Montreal)        | Yes, encrypted at rest                       |
| Vercel        | Serves the app     | United States (`iad1`, Washington, D.C.) | No; processes requests in memory             |
| Resend        | Sends email        | United States                            | Email address and message, for delivery logs |
| Google        | Optional sign-in   | United States                            | Only what the owner shares with Google       |

**Assessment.** Data at rest stays in Quebec. Processing in the United States is transient (Vercel) or limited to the
email address and notice text (Resend). Both providers offer data-processing agreements with security commitments
comparable to Quebec's requirements. Risks: lawful access by foreign authorities to data in transit, provider breach.
Mitigations: encryption in transit, minimal data in emails (no amounts beyond what an invoice notice needs), contractual
terms, the ability to move email to a Canadian provider without code changes (one module, `src/lib/email/send.ts`).

**Conclusion (to confirm).** The communication outside Quebec is acceptable given the transient nature of the
processing and the contractual protections, provided the agreements above are signed before launch.
