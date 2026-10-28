/**
 * Where an audit action's plain-words label lives in messages: `audit.actions.<action with _>`.
 * tests/unit/audit-labels.test.ts checks every action the services record has one, in both languages.
 */
export const auditActionKey = (action: string) => `actions.${action.replace(/\./g, "_")}`;
