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
    acceptDownloads: true,
  });
  await context.addInitScript(
    ({ client }) => {
      Object.defineProperty(navigator, "onLine", { get: () => false });
      localStorage.setItem(
        `geofield-account:${client}`,
        JSON.stringify({
          user: { id: "stereonet-fixture", email: "fixture@example.invalid" },
        }),
      );
    },
    { client: outputs.auth.user_pool_client_id },
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("PAGE ERROR", e.message));
  await page.route("**/*", (r) =>
    r.request().url().startsWith("http://127.0.0.1:5197")
      ? r.continue()
      : r.abort(),
  );
  await page.goto("http://127.0.0.1:5197/stereonets");
  await page
    .getByRole("button", { name: "New stereonet", exact: true })
    .click();
  await page.getByLabel("Name", { exact: true }).fill("Rock Canyon");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("tab", { name: "Measurements", exact: true }).click();
  for (const [strike, dip] of [
    [0, 20],
    [0, 50],
    [180, 70],
  ]) {
    await page.getByLabel("Strike (°)", { exact: true }).fill(String(strike));
    await page.getByLabel("Dip (°)", { exact: true }).fill(String(dip));
    await page
      .getByRole("button", { name: "Add measurement", exact: true })
      .click();
  }
  assert.equal(await page.locator("tbody tr").count(), 3);
  await page.getByRole("tab", { name: "Analysis", exact: true }).click();
  await page
    .getByRole("button", { name: "Fit bedding girdle", exact: true })
    .click();
  await page.getByText(/Best-fit bedding girdle pole.*trend/).waitFor();
  await page.screenshot({
    path: "/tmp/geofield-stereonet-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  for (const format of ["PNG", "PDF", "CSV"]) {
    const promise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: `Export ${format}`, exact: true })
      .click();
    const download = await promise;
    await download.saveAs(`/tmp/geofield-stereonet.${format.toLowerCase()}`);
  }
  const pdf = await fs.readFile("/tmp/geofield-stereonet.pdf");
  assert.equal(pdf.subarray(0, 8).toString(), "%PDF-1.4");
  const csv = await fs.readFile("/tmp/geofield-stereonet.csv", "utf8");
  assert.ok(csv.includes("raw_metadata"));
  assert.equal(csv.split("\r\n").length, 4);
  await page.reload();
  await page
    .getByLabel("Saved stereonet")
    .selectOption({ label: "Rock Canyon" });
  await page.getByRole("tab", { name: "Measurements", exact: true }).click();
  assert.equal(await page.locator("tbody tr").count(), 3);
  await page.getByRole("tab", { name: "Plot", exact: true }).click();
  await page.getByLabel("Plot reference").selectOption("true");
  await page.getByText(/3 measurement\(s\) excluded/).waitFor();
  await page.getByRole("tab", { name: "Datasets", exact: true }).click();
  await page.getByLabel("Dataset declination (° east positive)").fill("12");
  await page.getByRole("tab", { name: "Plot", exact: true }).click();
  assert.equal(await page.getByText(/measurement\(s\) excluded/).count(), 0);
  const storage = await page.evaluate(async () => {
    const { loadStereonets } = await import("/src/lib/stereonet/storage.ts");
    return loadStereonets();
  });
  assert.equal(storage[0].measurements[0].azimuth, 0);
  assert.equal(storage[0].groups[0].declination, 12);
  console.log(
    "PASS mobile: manual entry, girdle, PNG/PDF/CSV, offline reopen, explicit north conversion, no horizontal page overflow",
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({
    path: "/tmp/geofield-stereonet-desktop.png",
    fullPage: true,
  });
} finally {
  await browser.close();
}
