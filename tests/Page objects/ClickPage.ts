import { Locator, Page } from "@playwright/test";

export class ClickPage {
    private page: Page;
    private clickMe: Locator;

    constructor(page: Page) {
        this.page = page;
        this.clickMe = page.locator("button[type='button']");
    }

    async clickButton() {
        await this.clickMe.click();
    }
}
