import type { Page } from "@playwright/test";

export async function useFixedBrowserDate(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const fixedNow = Date.parse("2026-08-27T12:00:00.000Z");
    const RealDate = Date;
    function FixedDate(...args: Array<string | number | Date>): Date {
      return args.length === 0
        ? new RealDate(fixedNow)
        : (Reflect.construct(RealDate, args) as Date);
    }
    FixedDate.prototype = RealDate.prototype;
    Object.setPrototypeOf(FixedDate, RealDate);
    Object.defineProperties(FixedDate, {
      now: { value: () => fixedNow },
      parse: { value: RealDate.parse },
      UTC: { value: RealDate.UTC },
    });
    Object.defineProperty(window, "Date", { configurable: true, value: FixedDate });
  });
}
