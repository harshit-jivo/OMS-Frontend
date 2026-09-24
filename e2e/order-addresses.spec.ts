/**
 * The street under a Bill To / Ship To on Add Sales.
 *
 * An address is shown by its NAME — "Head Office" — which is fine as a label
 * and useless as an answer to "where do these goods actually go". That is the
 * question in front of a biller at the moment they pick one.
 *
 * In a browser rather than jsdom because the bug this guards is geometric: the
 * section is a CSS grid and each Field is one cell, so a street rendered as a
 * SIBLING of the Field becomes an extra cell and shunts every following
 * control one place along. A visibility assertion passes straight through
 * that — the text is visible, in the wrong column.
 */
import { expect, gotoStable, settle, test } from "./harness";

test("Add Sales shows the street under the chosen Bill To and Ship To", async ({
  appPage: page,
}) => {
  await gotoStable(page, "/Add_Sales");

  // The address pickers only populate once a party is chosen.
  const party = page.getByRole("combobox", { name: /Search part/i }).first();
  await party.click();
  await page.getByText("Northern Traders").first().click();
  await settle(page);

  const bill = page.getByRole("combobox", { name: /Search bill to/i });
  await bill.click();
  // The option itself carries the street, so two similarly named premises can
  // be told apart BEFORE choosing one.
  await expect(page.getByText("12 Mall Road, Ludhiana, Punjab 141001").first()).toBeVisible();
  await page.getByText("Head Office", { exact: true }).first().click();
  await settle(page);

  /*
   * INSIDE its own field, not merely somewhere on the page.
   *
   * This form is a CSS grid and each Field is one cell. A street rendered as a
   * SIBLING of the Field is an extra cell, which shunts every following
   * control one place along — Ship To lands where Dispatch From belongs, and
   * so on down the form. That is exactly what the first version of this did,
   * and a bare `toBeVisible` passed straight through it, because the text was
   * indeed visible: in the wrong column.
   */
  const billField = page.locator('[data-slot="field"]', { hasText: "Bill To Address" }).first();
  await expect(billField.getByText("12 Mall Road, Ludhiana, Punjab 141001")).toBeVisible();

  // And the grid is undisturbed: Bill To and Ship To still start on the same
  // row, which they cannot if a stray cell has been inserted between them.
  const shipField = page.locator('[data-slot="field"]', { hasText: "Ship To Address" }).first();
  const billBox = (await billField.boundingBox())!;
  const shipBox = (await shipField.boundingBox())!;
  expect(Math.abs(billBox.y - shipBox.y)).toBeLessThan(4);
  expect(shipBox.x).toBeGreaterThan(billBox.x);
});

test("choosing a party fills Bill To and Ship To with the top address", async ({
  appPage: page,
}) => {
  await gotoStable(page, "/Add_Sales");

  const party = page.getByRole("combobox", { name: /Search part/i }).first();
  await party.click();
  await page.getByText("Northern Traders").first().click();
  await settle(page);

  // No address clicked: the first of each list is already chosen, street and all.
  const billField = page.locator('[data-slot="field"]', { hasText: "Bill To Address" }).first();
  const shipField = page.locator('[data-slot="field"]', { hasText: "Ship To Address" }).first();
  await expect(billField.getByText("12 Mall Road, Ludhiana, Punjab 141001")).toBeVisible();
  await expect(shipField.getByText("Plot 9, Focal Point, Ludhiana, Punjab 141010")).toBeVisible();
  // So step 1 can be continued straight away.
  await expect(page.getByRole("button", { name: "Continue" })).toBeEnabled();
});
