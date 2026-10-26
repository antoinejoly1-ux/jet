import { relations } from "drizzle-orm";
import { user } from "./auth";
import { aircraft, flights, shares } from "./fleet";
import { budgetLines, budgets, invoices } from "./finance";
import { invitations, ownerMembers, owners } from "./owners";

export const userRelations = relations(user, ({ many }) => ({
  memberships: many(ownerMembers),
}));

export const ownerRelations = relations(owners, ({ many }) => ({
  members: many(ownerMembers),
  shares: many(shares),
  invitations: many(invitations),
}));

export const ownerMemberRelations = relations(ownerMembers, ({ one }) => ({
  owner: one(owners, { fields: [ownerMembers.ownerId], references: [owners.id] }),
  user: one(user, { fields: [ownerMembers.userId], references: [user.id] }),
}));

export const invitationRelations = relations(invitations, ({ one }) => ({
  owner: one(owners, { fields: [invitations.ownerId], references: [owners.id] }),
}));

export const aircraftRelations = relations(aircraft, ({ many }) => ({
  shares: many(shares),
  flights: many(flights),
}));

export const shareRelations = relations(shares, ({ one, many }) => ({
  owner: one(owners, { fields: [shares.ownerId], references: [owners.id] }),
  aircraft: one(aircraft, { fields: [shares.aircraftId], references: [aircraft.id] }),
  budgets: many(budgets),
  invoices: many(invoices),
}));

export const budgetRelations = relations(budgets, ({ one, many }) => ({
  share: one(shares, { fields: [budgets.shareId], references: [shares.id] }),
  lines: many(budgetLines),
}));

export const budgetLineRelations = relations(budgetLines, ({ one }) => ({
  budget: one(budgets, { fields: [budgetLines.budgetId], references: [budgets.id] }),
}));

export const flightRelations = relations(flights, ({ one }) => ({
  aircraft: one(aircraft, { fields: [flights.aircraftId], references: [aircraft.id] }),
  share: one(shares, { fields: [flights.shareId], references: [shares.id] }),
}));

export const invoiceRelations = relations(invoices, ({ one }) => ({
  share: one(shares, { fields: [invoices.shareId], references: [shares.id] }),
  flight: one(flights, { fields: [invoices.flightId], references: [flights.id] }),
}));
