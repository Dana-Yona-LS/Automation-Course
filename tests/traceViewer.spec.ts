import { test, expect, BrowserContext, Page } from "@playwright/test";

test("test", async ({ page }) => {
    await page.goto("https://www.saucedemo.com/");
    await page.locator("id=user-name").fill("standard_user");
    await page.locator("data-test=password").fill("secret_sauce");
    await page.getByRole("button", { name: "Login" }).click();
    await expect(page.locator("span[class='title']")).toContainText("Products");
});

test.describe("Trace Viewer", () => {
    let page: Page;
    let context: BrowserContext;

    test.beforeAll(async ({ browser }) => {
        context = await browser.newContext();

        // Start tracing before creating / navigating a page.
        await context.tracing.start({ screenshots: true, snapshots: true, sources: true });

        page = await context.newPage();
        await page.goto("https://www.saucedemo.com/");
    });

    test.afterAll(async () => {
        // Stop tracing and export it into a zip archive.
        await context.tracing.stop({ path: "trace.zip" });

        await context.close();
        await page.close();
    });

    test("Verify Title", async () => {
        const user_name = "standard_user";
        const password = "secret_sauce";
        const expected_title = "Products";

        await page.locator("[id='user-name']").fill(user_name);
        await page.locator("[name='password']").fill(password);
        await page.locator("[id='login-button']").click();

        const actual_title = await page.locator("span[class='title']").innerText();
        expect(actual_title).toEqual(expected_title);
    });
});
