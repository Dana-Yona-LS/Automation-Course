import { test, Page, BrowserContext } from "@playwright/test";

test.describe.serial("Testing Framework Exercise", () => {
    test.beforeAll(async () => {
        console.log("Before All Tests");
    });

    test.beforeEach(async () => {
        console.log("Before Each Test");
    });

    test.afterEach(async () => {
        console.log("After Each Test");
    });

    test.afterAll(async () => {
        console.log("After All Tests");
    });

    test("Test 1", async () => {
        console.log("Test 1");
    });

    test("Test 2", async () => {
        console.log("Test 2");
    });
});
