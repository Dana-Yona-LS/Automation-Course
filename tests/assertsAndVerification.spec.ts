import { test, expect } from "@playwright/test";

test.describe("BMI Calculator", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("https://atidcollege.co.il/Xamples/bmi/");
    });

    test("calculate BMI", async ({ page }) => {
        await page.locator("[id='weight']").fill("60");
        await page.locator("[name='height']").fill("175");
        await page.locator("[id='calculate_data']").click();

        const actual_result = await page.locator("[id='bmi_result']").inputValue();
        expect(actual_result).toEqual("20");
    });

    test("verify button", async ({ page }) => {
        const buttonShape = await page.locator("[id='calculate_data']").boundingBox();

        const width = buttonShape?.width;
        const height = buttonShape?.height;
        const x_coordinate = buttonShape?.x;
        const y_coordinate = buttonShape?.y;

        console.log("Width: " + width);
        console.log("Height: " + height);
        console.log("X Coordinate: " + x_coordinate);
        console.log("Y Coordinate: " + y_coordinate);

        const button = await page.locator("[id='calculate_data']");
        await expect(button).toBeVisible();
        await expect(button).toBeEnabled();
        await expect(button).toHaveText("Calculate BMI");
        await expect(page.locator("[id='validation']")).toBeHidden();
    });
});
