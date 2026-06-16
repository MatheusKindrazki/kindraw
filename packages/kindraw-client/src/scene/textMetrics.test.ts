import { describe, expect, it } from "vitest";

import { NodeTextMetricsProvider, measureLabel } from "./textMetrics";

describe("NodeTextMetricsProvider", () => {
  it("returns a positive width proportional to text length", () => {
    const provider = new NodeTextMetricsProvider();
    const font = "20px Virgil, Segoe UI Emoji";
    const short = provider.getLineWidth("Hi", font);
    const long = provider.getLineWidth("Hello world, this is long", font);
    expect(short).toBeGreaterThan(0);
    expect(long).toBeGreaterThan(short);
  });

  it("is deterministic for identical input", () => {
    const provider = new NodeTextMetricsProvider();
    const font = "20px Virgil";
    expect(provider.getLineWidth("Service", font)).toBe(
      provider.getLineWidth("Service", font),
    );
  });

  // FIX 6 (Security M1) — anchored parseFontSize regex; behavior unchanged for
  // valid font strings. Width must stay sane (positive, font-size proportional).
  it("returns a sane width for a standard '20px Virgil' font string", () => {
    const provider = new NodeTextMetricsProvider();
    const width = provider.getLineWidth("Service", "20px Virgil");
    expect(width).toBeGreaterThan(0);
    expect(Number.isFinite(width)).toBe(true);
  });
});

describe("measureLabel", () => {
  it("sizes a node big enough to contain its label with padding", () => {
    const { width, height } = measureLabel("Authentication Service", 20);
    // Multi-character label → comfortably wider than tall, with padding.
    expect(width).toBeGreaterThan(100);
    expect(height).toBeGreaterThanOrEqual(40);
  });

  it("enforces a sensible minimum size for short labels", () => {
    const { width, height } = measureLabel("X", 20);
    expect(width).toBeGreaterThanOrEqual(60);
    expect(height).toBeGreaterThanOrEqual(40);
  });
});
