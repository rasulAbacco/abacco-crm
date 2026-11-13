import { describe, it, expect } from "vitest";
import {
  intervalMs,
  describeInterval,
  jitteredIntervalMs,
  isOpen,
  nextOpenTime,
  estimateDuration,
} from "../../src/utils/sendSchedule.js";
import {
  parseLeadCurrency,
  currencyFromPrice,
  resolveRowCurrency,
} from "../../src/utils/leadCurrency.js";

describe("send spacing", () => {
  it("turns emails per hour into an exact gap", () => {
    expect(intervalMs(60)).toBe(60000);
    expect(intervalMs(30)).toBe(120000);
    expect(intervalMs(15)).toBe(240000);
    expect(intervalMs(100)).toBe(36000);
    expect(intervalMs(50)).toBe(72000);
    expect(describeInterval(60)).toBe("1 email every 1 min");
    expect(describeInterval(30)).toBe("1 email every 2 min");
    expect(describeInterval(100)).toBe("1 email every 36 sec");
    expect(describeInterval(50)).toBe("1 email every 1 min 12 sec");
    expect(() => intervalMs(0)).toThrow();
  });

  it("keeps variation within the percentage and is exact at 0", () => {
    expect(jitteredIntervalMs(60, 0)).toBe(60000);
    expect(jitteredIntervalMs(60, 20, () => 0)).toBe(48000);
    expect(jitteredIntervalMs(60, 20, () => 1)).toBe(72000);
  });

  it("follows sending days and hours in the account timezone", () => {
    const w = {
      sendWindowStart: "09:00",
      sendWindowEnd: "18:00",
      sendDays: [1, 2, 3, 4, 5],
      sendTimezone: "Asia/Kolkata",
    };
    expect(isOpen(Date.UTC(2026, 10, 13, 4, 30), w)).toBe(true); // Fri 10:00 IST
    const fri7pm = Date.UTC(2026, 10, 13, 13, 30);
    expect(isOpen(fri7pm, w)).toBe(false);
    expect(nextOpenTime(fri7pm, w)).toBe(Date.UTC(2026, 10, 16, 3, 30)); // Mon 09:00 IST
    expect(isOpen(fri7pm, {})).toBe(true);
    const night = {
      sendWindowStart: "22:00",
      sendWindowEnd: "06:00",
      sendTimezone: "UTC",
    };
    expect(isOpen(Date.UTC(2026, 10, 13, 23, 0), night)).toBe(true);
    expect(isOpen(Date.UTC(2026, 10, 13, 3, 0), night)).toBe(true);
    expect(isOpen(Date.UTC(2026, 10, 13, 12, 0), night)).toBe(false);
  });

  it("estimates sending time", () => {
    expect(estimateDuration(61, 60)).toBe("1 h");
    expect(estimateDuration(500, 60)).toBe("8 h 19 min");
  });
});

describe("lead currency", () => {
  it("reads Currency column values", () => {
    for (const [input, out] of [
      ["USD", "USD"],
      [" usd ", "USD"],
      ["US$", "USD"],
      ["A$", "AUD"],
      ["AU$", "AUD"],
      ["Australian Dollar", "AUD"],
      ["cad", "CAD"],
      ["C$", "CAD"],
      ["Canadian dollars", "CAD"],
      ["€", "EUR"],
      ["Euro", "EUR"],
    ]) {
      expect(parseLeadCurrency(input)).toBe(out);
    }
    expect(parseLeadCurrency("")).toBe(null);
    expect(parseLeadCurrency("$")).toBe(undefined);
    expect(parseLeadCurrency("XYZ")).toBe(undefined);
    // Every ISO currency works, by code, English name or symbol.
    expect(parseLeadCurrency("inr")).toBe("INR");
    expect(parseLeadCurrency("₹")).toBe("INR");
    expect(parseLeadCurrency("Indian Rupee")).toBe("INR");
    expect(parseLeadCurrency("£")).toBe("GBP");
    expect(parseLeadCurrency("Japanese Yen")).toBe("JPY");
    expect(parseLeadCurrency("kwd")).toBe("KWD");
  });

  it("reads currency hints in price cells", () => {
    expect(currencyFromPrice("A$1,200")).toBe("AUD");
    expect(currencyFromPrice("€ 950")).toBe("EUR");
    expect(currencyFromPrice("AUD 1,200")).toBe("AUD");
    expect(currencyFromPrice("$1200")).toBe(null);
  });

  it("picks column, then price symbol, then import default, then USD", () => {
    expect(resolveRowCurrency({ column: "eur", prices: ["A$5"] })).toEqual({
      currency: "EUR",
    });
    expect(resolveRowCurrency({ column: "", prices: ["A$5", "900"] })).toEqual({
      currency: "AUD",
    });
    expect(
      resolveRowCurrency({ prices: ["900"], importDefault: "CAD" }),
    ).toEqual({ currency: "CAD" });
    expect(resolveRowCurrency({ prices: [], importDefault: "INR" })).toEqual({
      currency: "INR",
    });
    expect(resolveRowCurrency({ prices: [], importDefault: "XYZ" })).toEqual({
      currency: "USD",
    });
    expect(resolveRowCurrency({ prices: ["₹50,000"] })).toEqual({
      currency: "INR",
    });
    expect(resolveRowCurrency({ column: "XYZ" }).error).toBeTruthy();
    expect(resolveRowCurrency({ prices: ["A$5", "€6"] }).error).toBeTruthy();
  });
});
