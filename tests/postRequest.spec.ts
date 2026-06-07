import test, { APIRequestContext, expect } from "@playwright/test";

test.describe("post request", () => {
    let apicontext: APIRequestContext;
    const baseUrl = "http://localhost:3000";

    test.beforeAll(async ({ playwright }) => {
        apicontext = await playwright.request.newContext({
            baseURL: baseUrl,
        });
    });
    test.afterAll(async () => {
        await apicontext.dispose();
    });

    test("post request", async () => {
        const payload = {
            id: 'FYgFfpBsn_A',
            title: 'dana"s title',
            views: 100000000,
        };
        const response = await apicontext.post(`${baseUrl}/posts`, { data: payload });
        const res = await response.json();
        console.log(res);
        expect(response.status()).toBe(201);
    });

    test("delete request", async () => {
        const response = await apicontext.delete(`${baseUrl}/posts/CMKuhs9iulE`);
        const res = await response.json();
        console.log(res);
        expect(response.status()).toBe(200);
    });

    test("put request", async () => {
        const payload = {
            id: '100',
            title: 'dana"s newtitle',
            views: 'blat',
        };
        const response = await apicontext.put(`${baseUrl}/posts/QSCAentB8HA`, { data: payload });
        const res = await response.json();
        console.log(res);
        expect(response.status()).toBe(200);
    });


});
