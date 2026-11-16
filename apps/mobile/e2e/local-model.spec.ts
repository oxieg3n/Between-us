import { expect, test } from "@playwright/test";

test("unsupported builds explain local model availability and offer a working private-writing fallback", async ({page}) => {
  await page.goto("/");
  await page.getByRole("button", {name:"Explore as Sam", exact:true}).click();
  await page.getByRole("button", {name:"Profile & settings", exact:true}).click();
  await page.getByRole("button", {name:"On-device conversation ideas", exact:true}).click();
  await expect(page.getByRole("button", {name:"Download & load optional model", exact:true})).toHaveCount(0);
  await page.getByRole("button", {name:"Model details", exact:true}).click();
  await expect(page.getByText(/Physical-device validation is pending/)).toBeVisible();
  await page.getByRole("button", {name:"Write in My Journal", exact:true}).click();
  await expect(page.getByRole("button", {name:"New entry", exact:true})).toBeVisible();
});
