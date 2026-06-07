import { test, expect } from "@playwright/test";

test("test", async ({ page }) => {
    await page.goto("https://playground.atidcollege.co.il/");
    await page.getByRole("textbox", { name: "Username" }).click();
    await page.getByRole("textbox", { name: "Username" }).fill("user_basic");
    await page.getByRole("textbox", { name: "Username" }).press("Tab");
    await page.getByRole("textbox", { name: "Password" }).fill("secret");
    await page.getByRole("button", { name: "Login" }).click();
    await page.getByRole("textbox", { name: "Search apps..." }).click();
    await expect(page.locator("#apps-grid")).toContainText("🌐 Data Faker");
});
