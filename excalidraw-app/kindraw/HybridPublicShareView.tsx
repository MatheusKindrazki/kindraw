import { Excalidraw } from "@excalidraw/excalidraw";
import { t } from "@excalidraw/excalidraw/i18n";
import { useCallback } from "react";

import type { ExcalidrawProps } from "@excalidraw/excalidraw/types";

import { createPublicDrawingInitialData } from "./content";
import { HybridReadonlyMarkdownPane } from "./HybridReadonlyMarkdownPane";
import { MarkdownPreview } from "./MarkdownPreview";
import { parseKindrawSectionLink } from "./hybridSections";
import { buildSharePath, navigateKindraw } from "./router";

import type { KindrawHybridView, KindrawPublicItemResponse } from "./types";

type HybridPublicShareViewProps = {
  itemResponse: KindrawPublicItemResponse;
  view: KindrawHybridView;
  shareToken?: string;
  sectionId?: string | null;
};

const ReadonlyCanvas = ({
  content,
  onLinkOpen,
}: {
  content: string;
  onLinkOpen?: ExcalidrawProps["onLinkOpen"];
}) => (
  <Excalidraw
    initialData={createPublicDrawingInitialData(content)}
    UIOptions={{
      canvasActions: {
        clearCanvas: false,
        export: false,
        loadScene: false,
        saveAsImage: false,
        saveToActiveFile: false,
        toggleTheme: false,
      },
    }}
    onLinkOpen={onLinkOpen}
    renderTopLeftUI={() => null}
    renderTopRightUI={() => null}
    viewModeEnabled={true}
    zenModeEnabled={true}
  />
);

export const HybridPublicShareView = ({
  itemResponse,
  view,
  shareToken,
  sectionId = null,
}: HybridPublicShareViewProps) => {
  const hybridView =
    itemResponse.hybrid && view === "canvas"
      ? "canvas"
      : itemResponse.hybrid && view === "document"
      ? "document"
      : itemResponse.hybrid
      ? "both"
      : itemResponse.item.kind === "drawing"
      ? "canvas"
      : "document";

  const resolveShareHref = useCallback(
    (href: string, resolvedHref: string | null) => {
      if (!shareToken) {
        return resolvedHref;
      }

      const sectionTarget = parseKindrawSectionLink(href);
      if (!sectionTarget) {
        return resolvedHref;
      }

      return buildSharePath(shareToken, {
        view: "both",
        sectionId: sectionTarget.sectionId,
      });
    },
    [shareToken],
  );

  const handleCanvasLinkOpen = useCallback<
    NonNullable<ExcalidrawProps["onLinkOpen"]>
  >(
    (element, event) => {
      if (!element.link || !shareToken) {
        return;
      }

      const sectionTarget = parseKindrawSectionLink(element.link);
      if (!sectionTarget) {
        return;
      }

      event.preventDefault();
      navigateKindraw(
        buildSharePath(shareToken, {
          view: "both",
          sectionId: sectionTarget.sectionId,
        }),
      );
    },
    [shareToken],
  );

  return (
    <div
      className={`kindraw-share-shell${
        hybridView === "canvas" && !itemResponse.hybrid
          ? " kindraw-share-shell--public-canvas"
          : ""
      }`}
    >
      <header
        className={`kindraw-public-view__header${
          hybridView === "canvas" && !itemResponse.hybrid
            ? " kindraw-public-view__header--overlay"
            : ""
        }`}
      >
        <div>
          <span className="kindraw-eyebrow">
            {t("kindraw.publicView.eyebrow")}
          </span>
          <h1>{itemResponse.item.title}</h1>
          <p>{t("kindraw.publicView.description")}</p>
        </div>
      </header>

      {hybridView === "document" ? (
        <section className="kindraw-share-shell__content">
          {itemResponse.hybrid ? (
            <HybridReadonlyMarkdownPane
              activeSectionId={sectionId}
              markdown={itemResponse.content}
              onNavigate={navigateKindraw}
              resolveInternalHref={resolveShareHref}
            />
          ) : (
            <MarkdownPreview markdown={itemResponse.content} />
          )}
        </section>
      ) : hybridView === "canvas" ? (
        <section className="kindraw-public-view__canvas">
          <div className="kindraw-public-view__canvas-backdrop" />
          <div className="kindraw-public-view__canvas-stage">
            <ReadonlyCanvas
              content={
                itemResponse.hybrid?.drawing.content || itemResponse.content
              }
              onLinkOpen={
                itemResponse.hybrid ? handleCanvasLinkOpen : undefined
              }
            />
          </div>
        </section>
      ) : (
        <section className="kindraw-hybrid-public-view">
          <div className="kindraw-hybrid-public-view__document">
            <HybridReadonlyMarkdownPane
              activeSectionId={sectionId}
              markdown={itemResponse.content}
              onNavigate={navigateKindraw}
              resolveInternalHref={resolveShareHref}
            />
          </div>
          <div className="kindraw-hybrid-public-view__canvas kindraw-public-view__canvas">
            <div className="kindraw-public-view__canvas-backdrop" />
            <div className="kindraw-public-view__canvas-stage">
              <ReadonlyCanvas
                content={itemResponse.hybrid?.drawing.content || ""}
                onLinkOpen={handleCanvasLinkOpen}
              />
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
