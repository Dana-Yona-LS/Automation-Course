import { test, Page, BrowserContext, Locator } from "@playwright/test";

test.describe("Locators Advanced - Ex", () => {
    let page: Page;
    let context: BrowserContext;

    test.beforeAll(async ({ browser }) => {
        context = await browser.newContext();
        page = await context.newPage();
        await page.goto("https://atidcollege.co.il/Xamples/ex_locators.html");
    });

    test.afterAll(async () => {
        await context.close();
        await page.close();
    });

    test("Verify Locators Advanced", async () => {
        // Locators
        const locator_by_id: Locator = page.locator("#locator_id");
        const locator_by_name: Locator = page.locator("[name='locator_name']");
        const locator_by_class_name: Locator = page.locator(".locator_class");
        const locator_by_tag: Locator = page.locator("p").first();
        const locator_by_text: Locator = page.locator("text=myLocator(5)");
        const locator_by_index: Locator = page.locator("a").nth(2);
        const locator_by_css_selector: Locator = page.locator("input[myname='selenium']");
        const locator_by_xpath: Locator = page.locator("//*[@id='contact_info_left']/button");

        // Part 1: Print Locator objects
        console.log(locator_by_id);
        console.log(locator_by_name);
        console.log(locator_by_class_name);
        console.log(locator_by_tag);
        console.log(locator_by_text);
        console.log(locator_by_index);
        console.log(locator_by_css_selector);
        console.log(locator_by_xpath);

        // Part 2: Print Element's Content
        console.log("\nElements Content");
        console.log(await locator_by_id.innerText());
        console.log(await locator_by_name.innerText());
        console.log(await locator_by_class_name.innerText());
        console.log(await locator_by_tag.innerText());
        console.log(await locator_by_text.innerText());
        console.log(await locator_by_index.innerText());
        console.log(await locator_by_css_selector.inputValue());
        console.log(await locator_by_xpath.innerText());
    });
});
