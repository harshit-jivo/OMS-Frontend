/**
 * Where an order bills and ships to, on the two screens that decide it.
 *
 * An order stores the address NAME — "Head Office" — because the sales form
 * saves `address_name || full_address`. That is fine as a record of what was
 * chosen and useless as an answer to "where do these goods actually go", which
 * is the question a biller has in front of them both when placing the order
 * and when checking it afterwards.
 *
 * In a browser rather than jsdom because the point is that the street is
 * LEGIBLE and subordinate: present, smaller than the name it sits under, and
 * not so quiet that it reads as disabled.
 */
import { expect, gotoStable, settle, test } from "./harness";

test("the order detail shows each address name with its street under it", async ({
  appPage: page,
}) => {
  await gotoStable(page, "/View_Orders");
  await page.getByRole("button", { name: /View order SO-202603/i }).click();
  await settle(page);

  await expect(page.getByText("Bill to")).toBeVisible();
  const name = page.getByText("Head Office", { exact: true });
  const street = page.getByText("12 Mall Road, Ludhiana, Punjab 141001");
  await expect(name).toBeVisible();
  await expect(street).toBeVisible();

  await expect(page.getByText("Main Warehouse", { exact: true })).toBeVisible();
  await expect(page.getByText("Plot 9, Focal Point, Ludhiana, Punjab 141010")).toBeVisible();

  // Under, not beside.
  const nameBox = (await name.boundingBox())!;
  const streetBox = (await street.boundingBox())!;
  expect(streetBox.y).toBeGreaterThan(nameBox.y);

  // Smaller than the name, which is what makes it read as supporting detail
  // rather than as a second field.
  const sizeOf = (locator: typeof name) =>
    locator.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
  const nameSize = await sizeOf(name);
  const streetSize = await sizeOf(street);
  expect(streetSize).toBeLessThan(nameSize);
  // But still readable — a street set at 8px would pass the test above.
  expect(streetSize).toBeGreaterThanOrEqual(10);
});

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
