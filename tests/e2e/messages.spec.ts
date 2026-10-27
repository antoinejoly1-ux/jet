/**
 * Phase 4: an owner writes to dispatch, a dispatcher answers from the inbox,
 * and the owner sees the reply, without either side reloading.
 */
import { expect, test } from "@playwright/test";
import { signIn, unique } from "./support";

test("an owner and dispatch talk in the portal", async ({ page, browser }) => {
  const question = `Disponible le 12? ${unique()}`;
  const answer = `Oui, c'est réservé. ${unique()}`;

  const owner = await (await browser.newContext()).newPage();
  await signIn(owner, "owner@jet.test");
  await owner.goto("/messages");
  await owner.getByLabel("Message", { exact: true }).fill(question);
  await owner.getByLabel("Message", { exact: true }).press("Enter");
  await expect(owner.getByText(question)).toBeVisible();

  await signIn(page, "dispatch@jet.test");
  await page.goto("/admin/messages");
  await page
    .getByRole("link", { name: /Jean Tremblay/ })
    .first()
    .click();
  const conversation = page.getByRole("region", { name: "Conversation" });
  await expect(conversation.getByText(question)).toBeVisible();
  await page.getByLabel("Message", { exact: true }).fill(answer);
  await page.getByRole("button", { name: "Envoyer" }).click();
  await expect(conversation.getByText(answer)).toBeVisible();

  // The owner's open page picks up the reply on its own.
  await expect(owner.getByText(answer)).toBeVisible({ timeout: 15_000 });
  await expect(owner.getByText(/Répartition · /).last()).toBeVisible();

  // Resolving moves it out of the open list.
  await page.getByRole("button", { name: "Résolue" }).click();
  await page.waitForURL(/\/admin\/messages$/);
  await page.getByRole("link", { name: "Résolues" }).click();
  await expect(page.getByRole("link", { name: /Jean Tremblay/ })).toBeVisible();
});

test("owners can call or text the team from Home and Messages", async ({ page }) => {
  await signIn(page, "owner@jet.test");
  for (const path of ["/", "/messages"]) {
    await page.goto(path);
    await expect(page.getByRole("link", { name: "Appeler", exact: true }).first()).toHaveAttribute(
      "href",
      "tel:+15145550100",
    );
    await expect(page.getByRole("link", { name: "Texto", exact: true }).first()).toHaveAttribute(
      "href",
      "sms:+15145550100",
    );
  }
});
