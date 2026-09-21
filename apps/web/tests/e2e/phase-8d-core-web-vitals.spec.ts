import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

const BASE_URL = "http://127.0.0.1:3000";
const VIEWPORT = { height: 900, width: 1280 } as const;

const GOOD_LCP_MS = 2_500;
const GOOD_CLS = 0.1;
const GOOD_LAB_INTERACTION_MS = 200;

type LayoutShiftSample = Readonly<{
  startTime: number;
  value: number;
}>;

type InteractionSample = Readonly<{
  duration: number;
  interactionId: number;
  name: string;
  startTime: number;
}>;

type RuntimeVitalsCollector = {
  events: InteractionSample[];
  firstInputs: Array<Readonly<{ duration: number; startTime: number }>>;
  layoutShifts: LayoutShiftSample[];
  lcp: number;
  marker: number;
};

type RuntimeVitalsGlobal = typeof globalThis & {
  __luminaRuntimeVitals?: RuntimeVitalsCollector;
};

const REPRESENTATIVE_ROUTES = [
  ["home", "/"],
  ["explore", "/explore"],
  ["object", "/objects/k2-18"],
  ["observe", "/observe"],
  ["identify", "/identify"],
  ["scale explorer", "/lab/scale-explorer"],
  ["tonight", "/tonight"],
  ["deep-sky shell", "/explore/deep-sky?object=messier-31"],
] as const;

async function newMeasuredContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: VIEWPORT,
  });

  await context.addInitScript(() => {
    const target = globalThis as RuntimeVitalsGlobal;
    const state: RuntimeVitalsCollector = {
      events: [],
      firstInputs: [],
      layoutShifts: [],
      lcp: 0,
      marker: 0,
    };
    target.__luminaRuntimeVitals = state;

    if (PerformanceObserver.supportedEntryTypes.includes("largest-contentful-paint")) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) state.lcp = Math.max(state.lcp, entry.startTime);
      });
      observer.observe({ type: "largest-contentful-paint" });
    }

    if (PerformanceObserver.supportedEntryTypes.includes("layout-shift")) {
      const observer = new PerformanceObserver((list) => {
        for (const rawEntry of list.getEntries()) {
          const entry = rawEntry as PerformanceEntry & {
            hadRecentInput: boolean;
            value: number;
          };
          if (!entry.hadRecentInput) {
            state.layoutShifts.push({ startTime: entry.startTime, value: entry.value });
          }
        }
      });
      observer.observe({ type: "layout-shift" });
    }

    if (PerformanceObserver.supportedEntryTypes.includes("event")) {
      const observer = new PerformanceObserver((list) => {
        for (const rawEntry of list.getEntries()) {
          const entry = rawEntry as PerformanceEntry & {
            duration: number;
            interactionId: number;
          };
          if (entry.interactionId > 0) {
            state.events.push({
              duration: entry.duration,
              interactionId: entry.interactionId,
              name: entry.name,
              startTime: entry.startTime,
            });
          }
        }
      });
      observer.observe({
        type: "event",
        durationThreshold: 16,
      } as PerformanceObserverInit & { durationThreshold: number });
    }

    if (PerformanceObserver.supportedEntryTypes.includes("first-input")) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          state.firstInputs.push({ duration: entry.duration, startTime: entry.startTime });
        }
      });
      observer.observe({ type: "first-input" });
    }
  });

  return context;
}

async function assertRuntimeVitalsSupport(page: Page): Promise<void> {
  const supported = await page.evaluate(() => PerformanceObserver.supportedEntryTypes);
  expect(supported).toEqual(
    expect.arrayContaining(["largest-contentful-paint", "layout-shift", "event"]),
  );
}

async function settleRoute(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page.waitForTimeout(250);
}

function cumulativeLayoutShift(samples: ReadonlyArray<LayoutShiftSample>): number {
  if (samples.length === 0) return 0;

  const ordered = [...samples].sort((left, right) => left.startTime - right.startTime);
  let maximum = 0;
  let windowScore = 0;
  let windowStart = ordered[0]!.startTime;
  let previous = ordered[0]!.startTime;

  for (const sample of ordered) {
    if (sample.startTime - previous > 1_000 || sample.startTime - windowStart > 5_000) {
      windowScore = 0;
      windowStart = sample.startTime;
    }
    windowScore += sample.value;
    maximum = Math.max(maximum, windowScore);
    previous = sample.startTime;
  }

  return maximum;
}

async function readLoadingVitals(page: Page): Promise<{ cls: number; lcp: number }> {
  const result = await page.evaluate(async () => {
    const target = globalThis as RuntimeVitalsGlobal;
    const state = target.__luminaRuntimeVitals;
    if (state === undefined) throw new Error("runtime vitals collector missing");

    let bufferedLcp = state.lcp;
    if (PerformanceObserver.supportedEntryTypes.includes("largest-contentful-paint")) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          bufferedLcp = Math.max(bufferedLcp, entry.startTime);
        }
      });
      observer.observe({ type: "largest-contentful-paint", buffered: true });
      await new Promise((resolve) => setTimeout(resolve, 50));
      observer.disconnect();
    }

    return {
      layoutShifts: state.layoutShifts,
      lcp: bufferedLcp,
    };
  });

  return {
    cls: cumulativeLayoutShift(result.layoutShifts),
    lcp: result.lcp,
  };
}

async function markInteractionWindow(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = globalThis as RuntimeVitalsGlobal;
    const state = target.__luminaRuntimeVitals;
    if (state === undefined) throw new Error("runtime vitals collector missing");
    state.events.length = 0;
    state.firstInputs.length = 0;
    state.marker = performance.now();
  });
}

async function readInteractionLatency(page: Page): Promise<number> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.waitForTimeout(50);

  return page.evaluate(() => {
    const target = globalThis as RuntimeVitalsGlobal;
    const state = target.__luminaRuntimeVitals;
    if (state === undefined) throw new Error("runtime vitals collector missing");

    const grouped = new Map<number, number>();
    for (const entry of state.events) {
      if (entry.startTime < state.marker) continue;
      grouped.set(
        entry.interactionId,
        Math.max(grouped.get(entry.interactionId) ?? 0, entry.duration),
      );
    }
    const groupedMaximum = Math.max(0, ...grouped.values());
    if (groupedMaximum > 0) return groupedMaximum;

    return Math.max(
      0,
      ...state.firstInputs
        .filter((entry) => entry.startTime >= state.marker)
        .map((entry) => entry.duration),
    );
  });
}

test.describe("Phase 8D — Core Web Vitals lab guards", () => {
  test("representative cold routes stay within LCP and CLS regression ceilings", async ({
    browser,
  }) => {
    for (const [name, route] of REPRESENTATIVE_ROUTES) {
      await test.step(name, async () => {
        const context = await newMeasuredContext(browser);
        const page = await context.newPage();
        try {
          await page.goto(route, { waitUntil: "load" });
          await assertRuntimeVitalsSupport(page);
          await settleRoute(page);
          const { cls, lcp } = await readLoadingVitals(page);

          expect(lcp, `${name} lab LCP should be observable`).toBeGreaterThan(0);
          expect(lcp, `${name} lab LCP`).toBeLessThanOrEqual(GOOD_LCP_MS);
          expect(cls, `${name} lab CLS`).toBeLessThanOrEqual(GOOD_CLS);
        } finally {
          await context.close();
        }
      });
    }
  });

  test("named scripted interactions stay within the lab responsiveness ceiling", async ({
    browser,
  }) => {
    const scenarios = [
      {
        name: "Explore next page",
        route: "/explore",
        run: async (page: Page) => {
          await page.getByRole("link", { name: "Next page" }).click();
          await expect(page).toHaveURL(/cursor=/u);
        },
      },
      {
        name: "Scale Explorer next node",
        route: "/lab/scale-explorer",
        run: async (page: Page) => {
          await page.getByRole("button", { name: "Next node" }).click();
          await expect(page.getByRole("heading", { level: 2, name: "Neptune" })).toBeVisible();
        },
      },
    ] as const;

    for (const scenario of scenarios) {
      await test.step(scenario.name, async () => {
        const context = await newMeasuredContext(browser);
        const page = await context.newPage();
        try {
          await page.goto(scenario.route, { waitUntil: "load" });
          await assertRuntimeVitalsSupport(page);
          await settleRoute(page);
          await markInteractionWindow(page);
          await scenario.run(page);
          const latency = await readInteractionLatency(page);

          expect(
            latency,
            `${scenario.name} lab interaction latency should be observable`,
          ).toBeGreaterThan(0);
          expect(latency, `${scenario.name} lab interaction latency`).toBeLessThanOrEqual(
            GOOD_LAB_INTERACTION_MS,
          );
        } finally {
          await context.close();
        }
      });
    }
  });
});
