import test, { expect, Locator } from "@playwright/test";

test.describe("Actions", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("https://atidcollege.co.il/Xamples/ex_actions.html");
    });

    test("Drag and drop", async ({ page }) => {
        const draggable = page.locator("[id='draggable']");
        const droppable = page.locator("[id='droppable']");
        const text = "Dropped!";
        await draggable.dragTo(droppable);
        await expect(droppable).toHaveText(text);
    });

    test("multiple selection", async ({ page }) => {
        const list: Locator[] = await page.locator("[id='select_items'] li").all();
        await list[1].click();
        await page.keyboard.down("Control");
        await list[2].click();
        await page.keyboard.up("Control");
    });

    test("Double Click", async ({ page }) => {
        await page.dblclick("[id='dbl_click']");
        const expectedText = "Hello World";
        const dbText = await page.locator("[id='demo']").innerText();
        expect(expectedText).toEqual(dbText);
    });

    test("Hover", async ({ page }) => {
        await page.hover("[id='mouse_hover']");
        const newColor = await page.locator("[id='mouse_hover']").getAttribute("style");
        expect(newColor).toEqual("background-color: rgb(255, 255, 0);");
    });

    test("Scroll", async ({ page }) => {
        await page.locator("[id='scrolled_element']").scrollIntoViewIfNeeded();
        const scrollText = await page.locator("[id='scrolled_element']").innerText();
        expect(scrollText).toEqual("This Element is Shown When Scrolled");
    });
});
