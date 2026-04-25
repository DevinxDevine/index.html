// src/__tests__/unit/pricing.test.ts
import { describe, it, expect } from "vitest";
import {
  calculatePrice,
  selectTierForSqft,
  calculateDurationMinutes,
  calculateJobWindow,
  calculateTipOptions,
  toCents,
  fromCents,
  validatePriceQuoteInput,
  PRICING_CONFIG,
} from "@/lib/pricing";

// ─── Tier selection ────────────────────────────────────────────────────────────

describe("selectTierForSqft", () => {
  it("selects standard for small homes", () => {
    expect(selectTierForSqft(500).slug).toBe("standard");
    expect(selectTierForSqft(1499).slug).toBe("standard");
  });

  it("selects deep for mid-range homes", () => {
    expect(selectTierForSqft(1500).slug).toBe("deep");
    expect(selectTierForSqft(2999).slug).toBe("deep");
  });

  it("selects premium for large homes", () => {
    expect(selectTierForSqft(3000).slug).toBe("premium");
    expect(selectTierForSqft(6000).slug).toBe("premium");
  });

  it("never auto-selects move-in tier", () => {
    // move-in is excluded from auto-selection at all sqft ranges
    const tier = selectTierForSqft(800);
    expect(tier.slug).not.toBe("move");
  });
});

// ─── Core price formula ────────────────────────────────────────────────────────

describe("calculatePrice", () => {
  it("computes correct total for standard tier, no upsells, one-time", () => {
    const result = calculatePrice({
      squareFootage: 1000,
      serviceTierSlug: "standard",
      upsellSlugs: [],
      frequency: "ONE_TIME",
    });

    // base=89, sqft=1000*0.08=80, subtotal=169
    // tax=169*0.0875=14.79, total=183.79
    expect(result.subtotal).toBe(169);
    expect(result.frequencyDiscount).toBe(0);
    expect(result.taxAmount).toBeCloseTo(14.79, 1);
    expect(result.totalAmount).toBeCloseTo(183.79, 1);
    expect(result.lineItems.some((l) => l.type === "base")).toBe(true);
    expect(result.lineItems.some((l) => l.type === "sqft")).toBe(true);
  });

  it("applies weekly discount correctly (20%)", () => {
    const result = calculatePrice({
      squareFootage: 1000,
      serviceTierSlug: "standard",
      upsellSlugs: [],
      frequency: "WEEKLY",
    });

    // subtotal before discount = 169, discount = 169*0.20 = 33.80
    expect(result.frequencyDiscount).toBeCloseTo(33.8, 1);
    expect(result.lineItems.some((l) => l.type === "discount")).toBe(true);
  });

  it("adds upsells to total correctly", () => {
    const result = calculatePrice({
      squareFootage: 1000,
      serviceTierSlug: "standard",
      upsellSlugs: ["inside-oven", "inside-fridge"], // 35+30=65
      frequency: "ONE_TIME",
    });

    expect(result.selectedUpsells).toHaveLength(2);
    const upsellSum = result.selectedUpsells.reduce((s, u) => s + u.price, 0);
    expect(upsellSum).toBe(65);
    expect(result.subtotal).toBe(169 + 65); // 234
  });

  it("enforces minimum booking amount", () => {
    const result = calculatePrice({
      squareFootage: 200,
      serviceTierSlug: "standard",
      upsellSlugs: [],
      frequency: "WEEKLY", // 20% off pushes it below minimum
    });

    // Even with discount, total must be >= minimumBookingAmount (89)
    expect(result.totalAmount).toBeGreaterThanOrEqual(PRICING_CONFIG.minimumBookingAmount);
  });

  it("throws on unknown tier slug", () => {
    expect(() =>
      calculatePrice({
        squareFootage: 1000,
        serviceTierSlug: "nonexistent",
        upsellSlugs: [],
        frequency: "ONE_TIME",
      })
    ).toThrow('Unknown service tier slug: "nonexistent"');
  });

  it("produces no floating point precision errors on financial values", () => {
    const result = calculatePrice({
      squareFootage: 1337,
      serviceTierSlug: "deep",
      upsellSlugs: ["inside-oven", "laundry"],
      frequency: "BIWEEKLY",
    });

    // All financial values must have at most 2 decimal places
    const values = [
      result.subtotal,
      result.frequencyDiscount,
      result.taxAmount,
      result.totalAmount,
    ];

    for (const val of values) {
      const decimalPart = (val.toString().split(".")[1] ?? "").length;
      expect(decimalPart).toBeLessThanOrEqual(2);
    }
  });
});

// ─── Duration calculation ──────────────────────────────────────────────────────

describe("calculateDurationMinutes", () => {
  it("returns base hours at minimum sqft", () => {
    const tier = PRICING_CONFIG.serviceTiers.find((t) => t.slug === "standard")!;
    const mins = calculateDurationMinutes(tier, tier.minSqft, []);
    expect(mins).toBe(Math.ceil(tier.estimatedHoursBase * 60));
  });

  it("adds upsell durations", () => {
    const tier = PRICING_CONFIG.serviceTiers.find((t) => t.slug === "standard")!;
    const oven = PRICING_CONFIG.upsells.find((u) => u.slug === "inside-oven")!;
    const base = calculateDurationMinutes(tier, 1000, []);
    const withUpsell = calculateDurationMinutes(tier, 1000, [oven]);
    expect(withUpsell).toBe(base + oven.durationMins);
  });
});

// ─── Job window ────────────────────────────────────────────────────────────────

describe("calculateJobWindow", () => {
  it("bufferEnd is exactly bufferMinutes after jobEnd", () => {
    const start = new Date("2024-06-15T09:00:00Z");
    const { jobEnd, bufferEnd } = calculateJobWindow(start, 120, 30);

    expect(jobEnd.getTime()).toBe(start.getTime() + 120 * 60_000);
    expect(bufferEnd.getTime()).toBe(jobEnd.getTime() + 30 * 60_000);
    expect(bufferEnd.getTime() - start.getTime()).toBe(150 * 60_000);
  });
});

// ─── Tip options ───────────────────────────────────────────────────────────────

describe("calculateTipOptions", () => {
  it("returns correct tip amounts for standard percentages", () => {
    const tips = calculateTipOptions(200);
    const tip20 = tips.find((t) => t.percent === 0.2);
    expect(tip20?.amount).toBe(40);
  });

  it("rounds tip amounts to 2 decimal places", () => {
    const tips = calculateTipOptions(99.99);
    for (const tip of tips) {
      const decimals = (tip.amount.toString().split(".")[1] ?? "").length;
      expect(decimals).toBeLessThanOrEqual(2);
    }
  });
});

// ─── Stripe conversion helpers ─────────────────────────────────────────────────

describe("toCents / fromCents", () => {
  it("converts dollars to cents without floating point errors", () => {
    expect(toCents(183.79)).toBe(18379);
    expect(toCents(0.01)).toBe(1);
    expect(toCents(999.99)).toBe(99999);
  });

  it("round-trips correctly", () => {
    const original = 249.5;
    expect(fromCents(toCents(original))).toBe(original);
  });
});

// ─── Input validation ──────────────────────────────────────────────────────────

describe("validatePriceQuoteInput", () => {
  it("passes valid input", () => {
    const { valid } = validatePriceQuoteInput({
      squareFootage: 1500,
      serviceTierSlug: "standard",
      upsellSlugs: ["inside-oven"],
      frequency: "WEEKLY",
    });
    expect(valid).toBe(true);
  });

  it("rejects sqft below minimum", () => {
    const { valid, errors } = validatePriceQuoteInput({
      squareFootage: 100,
      serviceTierSlug: "standard",
      upsellSlugs: [],
      frequency: "ONE_TIME",
    });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes("positive integer"))).toBe(true);
  });

  it("rejects unknown tier slug", () => {
    const { valid, errors } = validatePriceQuoteInput({
      squareFootage: 1000,
      serviceTierSlug: "mystery-tier",
      upsellSlugs: [],
      frequency: "ONE_TIME",
    });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes("Invalid service tier"))).toBe(true);
  });

  it("rejects unknown upsell slugs", () => {
    const { valid, errors } = validatePriceQuoteInput({
      squareFootage: 1000,
      serviceTierSlug: "standard",
      upsellSlugs: ["fake-upsell"],
      frequency: "ONE_TIME",
    });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes("fake-upsell"))).toBe(true);
  });

  it("rejects invalid frequency", () => {
    const { valid } = validatePriceQuoteInput({
      squareFootage: 1000,
      serviceTierSlug: "standard",
      upsellSlugs: [],
      frequency: "QUARTERLY" as any,
    });
    expect(valid).toBe(false);
  });

  it("rejects sqft above maximum", () => {
    const { valid } = validatePriceQuoteInput({
      squareFootage: 60_000,
      serviceTierSlug: "premium",
      upsellSlugs: [],
      frequency: "ONE_TIME",
    });
    expect(valid).toBe(false);
  });
});
