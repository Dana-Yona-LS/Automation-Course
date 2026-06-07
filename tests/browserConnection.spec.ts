import { BrowserContext, chromium, expect, firefox, Page, test } from "@playwright/test";

test.describe("Browser Connection Exercise_1", () => {
    const expected_title = "IMDb: Ratings, Reviews, and Where to Watch the Best Movies & TV Shows";
    const expected_url = "https://www.imdb.com/";
    let page: Page;
    let context: BrowserContext;
    test.beforeAll(async ({ browser }) => {
        context = await browser.newContext();
        page = await context.newPage();
        await page.goto("https://www.imdb.com/");
    });
    test.afterAll(async () => {
        await context.close();
        await page.close();
    });
    test("Test 1", async () => {
        console.log("Reload the page and verify the title");
        await page.reload();
        await page.waitForFunction(() => document.title.length > 0);
        const title = await page.title();
        console.log("Title is: " + title);
        expect(title).toEqual(expected_title);
    });

    test("Test 2", async () => {
        console.log("verify the url");
        await page.reload();
        const url = await page.url();
        console.log("URL is: " + expected_url);
        expect(url).toEqual(expected_url);
    });
});

test.describe("Browser Connection Exercise_2", () => {
    let page: Page;
    let context: BrowserContext;
    test.beforeAll(async ({ browser }) => {
        context = await browser.newContext();
        page = await context.newPage();
        await page.goto("https://www.google.com/");
    });
    test.afterAll(async () => {
        await context.close();
        await page.close();
    });
    test("Test 1", async () => {
        console.log("Different url");
        await page.goto("https://www.bing.com/");
        await page.goBack;
        const title = await page.title();
        console.log("Title is: " + title);
    });

    test("Test 2", async () => {
        console.log("Check if bubble exists");
        await page.goto("https://www.google.com/");
        const word = "bubble";
        const text = await page.content();
        if (text.includes(word)) {
            console.log("Exist");
        } else {
            console.log("Not Exist");
        }
    });
});

test.describe("Browser Connection Exercise_3", () => {
    test("Chrome", async () => {
        const browser = await chromium.launch({ channel: "chrome" });
        const page = await browser.newPage();
        await page.goto("https://google.com");
        await browser.close();
    });
    test("Firefox", async () => {
        const browser = await firefox.launch();
        const page = await browser.newPage();
        await page.goto("https://google.com");
        await browser.close();
    });
    test("Edge", async () => {
        const browser = await chromium.launch({ channel: "msedge" });
        const page = await browser.newPage();
        await page.goto("https://google.com");
        await browser.close();
    });
});
