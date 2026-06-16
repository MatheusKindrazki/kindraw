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
