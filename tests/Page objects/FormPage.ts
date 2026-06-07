import { Locator, Page } from "@playwright/test";

export class FormPage {
    private page: Page;
    private occupation: Locator;
    private age: Locator;
    private location: Locator;
    private clickMe: Locator;

    constructor(page: Page) {
        this.page = page;
        this.occupation = page.locator("[id=occupation]");
        this.age = page.locator("[id=age]");
        this.location = page.locator("[id=location]");
        this.clickMe = page.locator("button[type='button']");
    }

    async fillForm(occupation: string, age: string, location: string) {
        await this.occupation.fill(occupation);
        await this.age.fill(age);
        await this.location.fill(location);
        await this.clickMe.click();
    }
}