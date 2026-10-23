// Run against Vite on 127.0.0.1:5197. Uses an isolated account and blocks external requests.
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const outputs = JSON.parse(
  await fs.readFile(new URL("../../../amplify_outputs.json", import.meta.url)),
);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
});
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  await context.addInitScript(
    ({ client }) => {
      Object.defineProperty(navigator, "onLine", { get: () => false });
      localStorage.setItem(
        `geofield-account:${client}`,
        JSON.stringify({
          user: { id: "net-import", email: "fixture@example.invalid" },
        }),
      );
    },
    { client: outputs.auth.user_pool_client_id },
  );
  const page = await context.newPage();
  await page.route("**/*", (r) =>
    r.request().url().startsWith("http://127.0.0.1:5197")
      ? r.continue()
      : r.abort(),
  );
  await page.goto("http://127.0.0.1:5197/stereonets");
  await page
    .getByRole("button", { name: "New stereonet", exact: true })
    .click();
  await page.evaluate(async () => {
    const { saveMeasurements } =
      await import("/src/lib/strike-dip-measurements.ts");
    saveMeasurements([
      {
        id: "source-line",
        measurementType: "lineation",
        label: "Imported line",
        trendDegrees: 90,
        plungeDegrees: 45,
        northReference: "true",
        magneticDeclination: 12,
        featureType: "lineation",
        notes: "Original notes",
        date: "2026-10-22",
        strike: "",
        dip: "",
        dipDir: "",
        rockLayerType: "",
        location: "40,-110",
        latitude: 40,
        longitude: -110,
      },
    ]);
  });
  await page.getByRole("tab", { name: "Import", exact: true }).click();
  await page.getByLabel("Select all", { exact: true }).check();
  await page
    .getByRole("button", { name: "Import selected", exact: true })
    .click();
  await page.getByRole("tab", { name: "Plot", exact: true }).click();
  const circle = page.locator("[data-measurement] circle").first();
  await circle.tap();
  await page
    .getByRole("heading", { name: "Edit measurement", exact: true })
    .waitFor();
  await page.getByLabel("Name", { exact: true }).last().fill("Edited snapshot");
  await page
    .getByRole("button", { name: "Save measurement", exact: true })
    .click();
  const result = await page.evaluate(async () => {
    const { loadMeasurements } =
      await import("/src/lib/strike-dip-measurements.ts");
    const { loadStereonets } = await import("/src/lib/stereonet/storage.ts");
    return { source: loadMeasurements()[0], net: loadStereonets()[0] };
  });
  assert.equal(result.source.label, "Imported line");
  assert.equal(result.net.measurements[0].name, "Edited snapshot");
  assert.equal(result.net.measurements[0].raw.latitude, 40);
  await page.getByRole("tab", { name: "Plot", exact: true }).click();
  const svg = page.getByRole("img", { name: /lower hemisphere/ });
  await svg.scrollIntoViewIfNeeded();
  const box = await svg.boundingBox(),
    x = box.x + box.width / 2,
    y = box.y + box.width / 2;
  const cdp = await context.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: x - 25, y, id: 1 },
      { x: x + 25, y, id: 2 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: x - 50, y, id: 1 },
      { x: x + 50, y, id: 2 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page.waitForFunction(
    () =>
      !document
        .querySelector("[data-net-geometry]")
        .getAttribute("transform")
        .includes("scale(1)"),
  );
  console.log(
    "PASS import metadata, independent snapshot editing, touch selection, pinch zoom",
  );
} finally {
  await browser.close();
}
