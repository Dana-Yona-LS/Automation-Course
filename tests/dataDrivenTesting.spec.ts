import { expect, test } from "@playwright/test";

export const data = [
    {
        search: "israel",
        expected: "Israel",
    },
    {
        search: "english",
        expected: "English",
    },
    {
        search: "BlahBlah",
        expected: "Search results",
    },
];

test.describe("Data driven testing", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("https://www.wikipedia.org/");
    });

    data.forEach((search) => {
        test(`Search for ${search.search}`, async ({ page }) => {
            await page.locator("[id='searchInput']").fill(search.search);
            await page.locator("[id='searchInput']").press("Enter");
            await expect(page.locator("#firstHeading")).toHaveText(search.expected);
        });
    });
});

export const loginData = [
    {
        username: "user_basic",
        password: "secret",
    },
    {
        username: "user_locked",
        password: "secret",
    },
    {
        username: "user_network_delay",
        password: "secret",
    },
    {
        username: "user_a11y",
        password: "secret",
    },
    {
        username: "user_buggy",
        password: "secret",
    },
];

test.describe("Data driven testing - passwords", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("https://playground.atidcollege.co.il/");
    });

    loginData.forEach((row) => {
        test(`login with ${row.username}`, async ({ page }) => {
            await page.locator("[id='username']").fill(row.username);
            await page.locator("[id='password']").fill(row.password);
            await page.locator("[id='login']").click();
        });
    });
});
