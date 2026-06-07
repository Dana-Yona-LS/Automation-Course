import test, { BrowserContext, expect, Page } from "@playwright/test";

test.describe("Switch and Navigation", () => {
    let page: Page;
    let context: BrowserContext;

    test.beforeAll(async ({ browser }) => {
        context = await browser.newContext();
        page = await context.newPage();
    });

    test.beforeEach(async ({ page }) => {
        await page.goto("https://atidcollege.co.il/Xamples/ex_switch_navigation.html");
    });

    test("test1", async ({ page }) => {
        page.once("dialog", async (dialog) => {
            console.log("Alert message: " + dialog.message());
            await dialog.accept();
        });
        await page.locator("[id='btnAlert']").click();
        expect(await page.locator("[id='output']")).toBeVisible();

        page.once("dialog", async (dialog) => {
            let message: string = "Dana";
            console.log("Alert message: " + dialog.message());
            await dialog.accept(message);
        });
        await page.locator("[id='btnPrompt']").click();
        expect(await page.locator("[id='output']")).toBeVisible();
        expect(await page.locator("[id='output']")).toHaveText("Dana");
        console.log(await page.locator("[id='output']").textContent());
    });

    test("IFrame", async ({ page }) => {
        const iframe = await page
            .frameLocator("iframe[src='ex_switch_newFrame.html']")
            .locator("[id='iframe_container']")
            .innerText();
        const iframetext = "This is an IFrame !";

        await expect(iframe).toContain(iframetext);
    });

    test("Verify Tabs", async () => {
        const newTabPromise = await page.waitForEvent("page");
        await page.locator("[id='btnNewTab']").click();
        const newTab = await newTabPromise;
        await newTab.waitForLoadState();

        const newTabText = await newTab.locator("[id='new_tab_container']").innerText();
        await newTab.close();

        const cleanedText = newTabText.replaceAll("\n", "");
        console.log(cleanedText);

        const output = "This is a new tab"; // You need to set the expected output
        expect(cleanedText).toEqual(output);
    });

    test("Verify Window", async () => {
        // Start waiting for new page before clicking
        const newWindowPromise = context.waitForEvent("page");
        await page.locator("a[href='ex_switch_newWindow.html']").click();
        const newWindow = await newWindowPromise; // The promise resolves with the new Page object
        await newWindow.waitForLoadState(); // Wait for the new window to finish loading

        const newWindowText = await newWindow.locator("[id='new_window_container']").innerText();
        await newWindow.close();

        const cleanedWindowText = newWindowText.replaceAll("\n", "");
        console.log(cleanedWindowText);

        const output = "This is a new window";
        expect(cleanedWindowText).toEqual(output);
    });
});
