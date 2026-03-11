import { describe, expect, it } from "vitest";

import { generateKindrawCanvasTitle } from "./naming";

describe("generateKindrawCanvasTitle", () => {
  it("gera um nome criativo com base no horario", () => {
    expect(
      generateKindrawCanvasTitle({
        date: new Date(2026, 2, 10, 9, 15, 0),
      }),
    ).toBe("Soft Board");
  });

  it("prioriza a tag quando ela existe", () => {
    expect(
      generateKindrawCanvasTitle({
        date: new Date(2026, 2, 10, 9, 15, 0),
        tagName: "Priority",
      }),
    ).toBe("Priority Map");
  });
});
