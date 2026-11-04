// Browser smoke test: signs in, creates a lead, opens every page and checks for errors.
// Usage: BASE_URL=http://localhost:4173 E2E_EMAIL=you@x.com E2E_PASSWORD=... node e2e/smoke.cjs
// Needs: npm i -D playwright (and the API + web app running).
// Never point it at production.

const { chromium, devices } = require("playwright");

const OUT = process.env.SHOTS_DIR ?? require("os").tmpdir() + "/";
const BASE = process.env.BASE_URL ?? "http://localhost:4173";
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

(async () => {
  if (!EMAIL || !PASSWORD) {
    throw new Error(
      "E2E_EMAIL and E2E_PASSWORD environment variables are required.",
    );
  }

  const browser = await chromium.launch();

  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });

    const errors = [];

    page.on("console", (m) => {
      if (m.type() === "error") {
        errors.push(
          `CONSOLE ERROR: ${page.url()} :: ${m.text()} :: ${m.location().url}`,
        );
      }
    });

    page.on("pageerror", (e) => {
      errors.push(`PAGE ERROR: ${page.url()} :: ${e.message}`);
    });

    page.on("response", (r) => {
      const status = r.status();
      const url = r.url();
      const method = r.request().method();

      if (status === 401) {
        errors.push(`401 UNAUTHORIZED: ${method} ${url}`);
      } else if (status >= 500 || status === 404) {
        errors.push(`HTTP ${status}: ${method} ${url}`);
      }
    });

    // Login
    console.log("Opening login page...");

    await page.goto(`${BASE}/login`);
    await page.fill("input[type=email]", EMAIL);
    await page.fill("input[type=password]", PASSWORD);
    await page.click('button:has-text("Sign in")');

    await page.waitForURL(`${BASE}/`, { timeout: 20000 });
    await page.waitForSelector("text=Pipeline value", { timeout: 20000 });

    console.log("Login successful.");

    await page.screenshot({
      path: OUT + "dashboard.png",
      fullPage: true,
    });

    // Create a lead
    console.log("Creating test lead...");

    await page.goto(`${BASE}/leads/new`);

    const sel = page.locator('main label:has-text("Sales ID") select');

    await page.waitForFunction(
      () => document.querySelectorAll("main label select option").length > 1,
    );

    await sel.selectOption({ index: 1 });

    await page.fill("input >> nth=0", "Smoke");

    await page.locator('label:has-text("Last name") input').fill("Tester");

    await page
      .locator('label:has-text("Email") input')
      .fill(`smoke${Date.now()}@example.com`);

    await page.locator('label:has-text("Phone") input').fill("+1 212 555 0101");

    await page.click('button:has-text("Create lead")');

    await page.waitForSelector("text=Contact information", {
      timeout: 10000,
    });

    await page.screenshot({
      path: OUT + "lead.png",
      fullPage: true,
    });

    // Visit application routes
    const routes = [
      "/leads",
      "/contacts",
      "/companies",
      "/deals",
      "/deals/list",
      "/tasks",
      "/campaigns",
      "/campaigns/new",
      "/email-lists",
      "/templates",
      "/templates/new",
      "/automations",
      "/automations/new",
      "/smtp-accounts",
      "/reports",
      "/sales-ids",
      "/settings",
      "/settings?tab=countries",
      "/settings?tab=suppressions",
      "/settings?tab=audit",
    ];

    for (const route of routes) {
      console.log(`Checking ${route}...`);

      await page.goto(`${BASE}${route}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(300);

      const text = await page
        .locator("main")
        .innerText()
        .catch(() => "");

      if (
        /Something went wrong|not found/i.test(text) &&
        !/No .*found|matches/i.test(text)
      ) {
        errors.push(`${route} shows an error state`);
      }

      await page.screenshot({
        path: OUT + route.replace(/[/?=]/g, "_") + ".png",
      });
    }

    // Mobile dashboard test
    console.log("Checking mobile dashboard...");

    const mobile = await browser.newPage({
      ...devices["iPhone 13"],
    });

    await mobile.context().addCookies(await page.context().cookies());

    await mobile.goto(`${BASE}/`);
    await mobile.waitForSelector("text=Pipeline value", {
      timeout: 15000,
    });

    await mobile.screenshot({
      path: OUT + "mobile_dashboard.png",
    });

    const overflow = await mobile.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );

    if (overflow) {
      errors.push("Mobile: horizontal overflow on dashboard");
    }

    // Final results
    console.log("\n========== SMOKE TEST RESULTS ==========");

    console.log(errors.length ? errors.join("\n") : "NO ERRORS");

    console.log("========================================");
    console.log(`Screenshots saved in: ${OUT}`);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
