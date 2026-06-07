import { test, Page, BrowserContext, Locator } from "@playwright/test";

test.describe.serial("Locators Basic - Ex1", () => {
    let page: Page;
    let context: BrowserContext;

    test.beforeAll(async ({ browser }) => {
        context = await browser.newContext();
        page = await context.newPage();
        await page.goto("https://playwright.dev/");
    });

    test.afterAll(async () => {
        await context.close();
        await page.close();
    });

    test("Verify Logo", async () => {
        console.log(page.locator("[class='navbar__brand']"));
        console.log(page.locator("[class='navbar__logo']"));
        console.log(page.locator("[src='/img/playwright-logo.svg']"));
    });

    test("Verify Number Of Links", async () => {
        const links = await page.locator("a").all();
        console.log("links number: " + links.length);
    });
});

test.describe("Locators Basic - Ex2", () => {
    let page: Page;
    let context: BrowserContext;

    test.beforeAll(async ({ browser }) => {
        context = await browser.newContext();
        page = await context.newPage();
        await page.goto("https://www.wikipedia.org/");
    });

    test.afterAll(async () => {
        await context.close();
        await page.close();
    });

    test("Verify Elements", async () => {
        const list: Locator[] = [];
        list.push(page.locator("[class='central-featured-logo']"));
        list.push(page.locator("[id='searchInput']"));
        list.push(page.locator("[id='searchLanguage']"));
        list.push(page.locator("[class='footer-sidebar-content']"));

        for (const item of list) {
            console.log(item);
        }
    });
});
