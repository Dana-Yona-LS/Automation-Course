import test from "@playwright/test";
import { LoginPage } from "./Page objects/LoginPage";
import { FormPage } from "./Page objects/FormPage";
import { ClickPage } from "./Page objects/ClickPage";

test.describe("Page Objects", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("https://atidcollege.co.il/Xamples/webdriveradvance.html");
    });

    test("login", async ({ page }) => {
        const loginPage = new LoginPage(page);
        const formPage = new FormPage(page);
        const clickPage = new ClickPage(page);
        
        await loginPage.login("selenium", "webdriver");
        await formPage.fillForm("QA", "38", "Ramat gan");
        await clickPage.clickButton();
    });
});
