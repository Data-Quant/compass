import { test, expect, type Page } from "@playwright/test";
const base = process.env.PILOT_TEST_URL || "http://127.0.0.1:3219";
test.use({ baseURL: base });
test.setTimeout(60000);
test("mapped assignments are automatic and read-only on desktop and mobile", async ({ page }) => {
  await login(page, "hr");
  await page.route("**/api/admin/ai-evaluations", route => route.fulfill({ json: {
    cycles: [], people: [
      { id: "subject", name: "Finance employee", position: "Analyst", department: "Finance" },
      { id: "peer", name: "Engineering colleague", position: "Engineer", department: "Engineering" },
    ], mappings: [{ evaluatorId: "peer", evaluateeId: "subject", relationshipType: "PEER" }],
    rubricDrafts: [], observations: [], artifacts: [], jobs: [], themes: [], checkIns: [], inferenceConfigured: true,
  } }));
  await page.goto("/admin/ai-evaluations");
  await page.getByRole("checkbox", { name: "Finance employee" }).check();
  await expect(page.getByText("Engineering colleague evaluates Finance employee", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add relationship", exact: true })).toHaveCount(0);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("heading", { name: "Mapped interdepartment relationships" })).toBeVisible();
    await page.getByRole("heading", { name: "Mapped interdepartment relationships" }).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `.pilot-screens/mappings-${width}.png`, fullPage: true });
  }
  await page.getByRole("checkbox", { name: "Engineering colleague" }).check();
  await expect(page.getByText("Employee Engineering colleague has no eligible interdepartment evaluator mapping.", { exact: true })).toBeVisible();
});
test.skip(
  process.env.PILOT_BROWSER_TEST !== "true",
  "Explicit isolated pilot browser run only",
);
async function login(page: Page, role: string) {
  const token = await (await page.request.get("/api/auth/csrf")).json();
  const result = await page.request.post("/api/auth/login", {
    headers: { "x-csrf-token": token.token },
    data: {
      email: `pilot-${role}@example.test`,
      password: process.env.PILOT_FIXTURE_PASSWORD,
    },
  });
  expect(result.status()).toBe(200);
}
test("employee check-in layout and access boundaries", async ({ page }) => {
  await login(page, "peer");
  expect((await page.request.get("/api/admin/ai-evaluations")).status()).toBe(
    403,
  );
  expect(
    (
      await page.request.post("/api/ai-evaluations", {
        data: {
          action: "correct",
          id: "pilot-demo-theme",
          text: "Attempt to modify another employee theme",
        },
      })
    ).status(),
  ).toBe(404);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/ai-evaluations");
  await expect(
    page.getByRole("heading", { name: "Weekly observations" }),
  ).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByRole("button", { name: "Submit observation" }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: ".pilot-screens/employee-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Submit observation" }).first(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".pilot-screens/employee-mobile.png",
    fullPage: true,
  });
  const textarea = page.locator("textarea").first();
  await textarea.fill(
    "Synthetic UI draft: the Monday report arrived before our agreed meeting.",
  );
  await page.getByRole("button", { name: "Save draft" }).first().click();
  await expect(
    page.getByRole("button", { name: "Save draft" }).first(),
  ).toBeEnabled();
  await page.reload();
  await expect(page.locator("textarea").first()).toHaveValue(
    "Synthetic UI draft: the Monday report arrived before our agreed meeting.",
  );
});
test("HR review shows source evidence and records approval", async ({
  page,
}) => {
  await login(page, "hr");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin/ai-evaluations");
  await expect(
    page.getByRole("heading", { name: "AI evaluation pilot" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Cycle", exact: true })
    .selectOption("pilot-demo-quarter");
  await page
    .getByRole("button", { name: "Quarterly review", exact: true })
    .click();
  await expect(
    page.getByText("Supporting evidence", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: ".pilot-screens/hr-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".pilot-screens/hr-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Development themes", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Reviewed development themes" }),
  ).toBeVisible();
  expect(
    (
      await page.request.post("/api/admin/ai-evaluations", {
        data: {
          action: "theme",
          cycleId: "pilot-demo-quarter",
          evaluateeId: "pilot-subject",
          text: "Unsupported theme",
          sourceIds: ["fabricated"],
          release: true,
        },
      })
    ).status(),
  ).toBe(400);
  const detail = await (
    await page.request.get(
      "/api/admin/ai-evaluations?cycleId=pilot-demo-quarter",
    )
  ).json();
  expect(
    (
      await page.request.post("/api/admin/ai-evaluations", {
        data: {
          action: "theme",
          cycleId: "pilot-demo-quarter",
          evaluateeId: "pilot-subject",
          id: "pilot-demo-theme",
          text: detail.themes[0].text,
          sourceIds: detail.themes[0].sourceIds,
          release: false,
        },
      })
    ).status(),
  ).toBe(400);
  const artifact = detail.artifacts.find(
    (a: { id: string }) => a.id === "pilot-demo-assessment",
  );
  if (artifact.status === "DRAFT") {
    expect(
      (
        await page.request.post("/api/admin/ai-evaluations", {
          data: {
            action: "review",
            id: artifact.id,
            decision: "APPROVED",
            reason:
              "Synthetic review: both independent handoffs support the reliable delivery anchor.",
          },
        })
      ).status(),
    ).toBe(200);
  }
  expect(
    (
      await page.request.post("/api/admin/ai-evaluations", {
        data: {
          action: "review",
          id: artifact.id,
          decision: "APPROVED",
          reason: "Duplicate approval attempt",
        },
      })
    ).status(),
  ).toBe(409);
  const reviewed = await (
    await page.request.get(
      "/api/admin/ai-evaluations?cycleId=pilot-demo-quarter",
    )
  ).json();
  expect(
    reviewed.artifacts.find((a: { id: string }) => a.id === artifact.id)
      .reviews,
  ).toHaveLength(1);
});

test("cycle switching hides old evidence and approved overrides remain visible", async ({
  page,
}) => {
  await login(page, "hr");
  await page.route(
    "**/api/admin/ai-evaluations?cycleId=pilot-demo-quarter",
    async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      const artifact = body.artifacts.find(
        (a: { id: string }) => a.id === "pilot-demo-assessment",
      );
      artifact.status = "APPROVED";
      artifact.reviews = [
        {
          action: "APPROVED",
          reason: "Synthetic UI regression: an explicit reviewed override.",
          ratings: artifact.content.ratings.map((r: object) => ({
            ...r,
            rating: 4,
          })),
        },
      ];
      await route.fulfill({ response, json: body });
    },
  );
  await page.goto("/admin/ai-evaluations");
  await page
    .getByRole("combobox", { name: "Cycle", exact: true })
    .selectOption("pilot-demo-quarter");
  await page
    .getByRole("button", { name: "Quarterly review", exact: true })
    .click();
  await expect(
    page.getByText("Reviewed overall: 4.00 / 4", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: /Reviewed rating/ }),
  ).toHaveValue("4");
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByText("Supporting evidence", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: ".pilot-screens/hr-mobile-evidence.png" });
  await page.route(
    "**/api/admin/ai-evaluations?cycleId=pilot-synthetic-cycle",
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    },
  );
  await page
    .getByRole("combobox", { name: "Cycle", exact: true })
    .selectOption("pilot-synthetic-cycle");
  await expect(
    page.getByText("Reviewed overall: 4.00 / 4", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Cycle", exact: true }),
  ).toHaveValue("pilot-synthetic-cycle");
  await expect(
    page.getByText("Supporting evidence", { exact: true }),
  ).toHaveCount(0);
});
test("employee sees only released themes and can add context", async ({
  page,
}) => {
  await login(page, "subject");
  const response = await (await page.request.get("/api/ai-evaluations")).json();
  expect(response.checkIns).toHaveLength(0);
  expect(response.themes[0]).not.toHaveProperty("sourceIds");
  await page.goto("/ai-evaluations");
  await expect(
    page.getByText(/Synthetic example: Continue documenting/),
  ).toBeVisible();
  await page
    .getByLabel("Add context for HR")
    .fill(
      "Synthetic context: I will propose a checklist for the next handoff.",
    );
  await page.getByRole("button", { name: "Send context to HR" }).click();
  await expect(
    page.getByText(/Your context: Synthetic context/).first(),
  ).toBeVisible();
  expect((await page.request.get("/api/ai-evaluations/cron")).status()).toBe(
    401,
  );
});
