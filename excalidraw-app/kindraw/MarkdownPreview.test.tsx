import { fireEvent, render, screen } from "@testing-library/react";

import { MarkdownPreview, resolveKindrawHref } from "./MarkdownPreview";

import type { KindrawItem } from "./types";

const createItem = (overrides: Partial<KindrawItem> = {}): KindrawItem => ({
  id: "item-1",
  kind: "doc",
  title: "Doc",
  folderId: null,
  ownerId: "user-1",
  updatedAt: "2026-03-09T00:00:00.000Z",
  createdAt: "2026-03-09T00:00:00.000Z",
  archivedAt: null,
  shareLinks: [],
  collaborationRoomId: null,
  collaborationEnabledAt: null,
  ...overrides,
});

describe("MarkdownPreview", () => {
  it("should render a custom empty message", () => {
    render(
      <MarkdownPreview
        emptyMessage="Comece escrevendo para ver o preview."
        markdown=""
      />,
    );

    expect(
      screen.getByText("Comece escrevendo para ver o preview."),
    ).toBeInTheDocument();
  });

  it("should resolve and navigate internal Kindraw links", () => {
    const onNavigate = vi.fn();

    render(
      <MarkdownPreview
        itemsById={{
          "item-1": createItem(),
        }}
        markdown="[Abrir doc](kindraw://item/item-1)"
        onNavigate={onNavigate}
      />,
    );

    fireEvent.click(screen.getByRole("link", { name: "Abrir doc" }));

    expect(
      resolveKindrawHref("kindraw://item/item-1", {
        "item-1": createItem(),
      }),
    ).toBe("/doc/item-1");
    expect(onNavigate).toHaveBeenCalledWith("/doc/item-1");
  });

  it("should render fenced code blocks", () => {
    render(<MarkdownPreview markdown={"```ts\nconst value = 1;\n```"} />);

    expect(screen.getByText("const value = 1;")).toBeInTheDocument();
  });
});
