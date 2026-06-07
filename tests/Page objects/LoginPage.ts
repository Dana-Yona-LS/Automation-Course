import { Locator, Page } from "@playwright/test";

export class LoginPage {
    private page: Page;
    private username: Locator;
    private password: Locator;
    private submit: Locator;

    constructor(page: Page) {
        this.page = page;
        this.username = page.locator("[id=username2]");
        this.password = page.locator("[id=password2]");
        this.submit = page.locator("[id=submit]");
    }

    async login(username: string, password: string) {
        await this.username.fill(username);
        await this.password.fill(password);
        await this.submit.click();
    }
}