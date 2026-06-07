import test, { expect } from "@playwright/test";

test ('get request', async ({ request }) => {
    const apiUrl = 'https://api.openweathermap.org/data/2.5/weather?appid=6107ed914bdfa056091e12cdd971b968&q=jerusalem&units=metric?';
    const response = await request.get(apiUrl);
    console.log(await response.status());
    console.log(await response.json);
    expect(response.status()).toBe(200);
});