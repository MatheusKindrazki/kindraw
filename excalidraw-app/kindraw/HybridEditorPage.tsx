import {
  useCallback,
  useEffect,
  useMemo,
  useLayoutEffect,
  useRef,
  useState,
  startTransition,
} from "react";

import { Excalidraw, serializeAsJSON } from "@excalidraw/excalidraw";
import { newElementWith } from "@excalidraw/element";

import type {
  AppState,
  BinaryFiles,
  ExcalidrawProps,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import {
  createHybridShareLink,
  deleteHybridItem,
  getHybridItem,
  revokeShareLink,
  updateHybridItemMeta,
  updateItemContent,
  buildPublicShareUrl,
} from "./api";
import { parseDrawingContent } from "./content";
import { HybridMarkdownPane } from "./HybridMarkdownPane";
import {
  buildHybridPath,
  buildItemPath,
  buildFolderPath,
  navigateKindraw,
} from "./router";
import { ShareLinksPanel } from "./ShareLinksPanel";
import { getKindrawDraft, setKindrawDraft } from "./storage";
import { getErrorMessage, isDraftNewer } from "./utils";
import {
  buildKindrawSectionLink,
  parseKindrawSectionLink,
} from "./hybridSections";

import type { PointerEvent as ReactPointerEvent } from "react";
import type {
  KindrawHybridItemResponse,
  KindrawHybridView,
  KindrawItem,
} from "./types";

type HybridEditorPageProps = {
  hybridId: string;
  initialView: KindrawHybridView;
  initialSectionId: string | null;
  itemsById: Record<string, KindrawItem>;
  onTreeRefresh: () => Promise<void> | void;
};

const copyToClipboard = async (value: string) => {
  if (!navigator.clipboard) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch (error) {
    console.warn("Failed to copy Kindraw share link:", error);
    return false;
  }
};

const useNarrowLayout = () => {
  const [isNarrow, setIsNarrow] = useState(() =>
    typeof window === "undefined" ? false : window.innerWidth < 1100,
  );

  useEffect(() => {
    const onResize = () => {
      setIsNarrow(window.innerWidth < 1100);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return isNarrow;
};

const HYBRID_SPLIT_STORAGE_PREFIX = "kindraw:hybrid-split:";
const DEFAULT_SPLIT_RATIO = 0.42;
const clampSplitRatio = (value: number) =>
  Math.min(0.68, Math.max(0.32, value));

export const HybridEditorPage = ({
  hybridId,
  initialView,
  initialSectionId,
  itemsById,
  onTreeRefresh,
}: HybridEditorPageProps) => {
  const [response, setResponse] = useState<KindrawHybridItemResponse | null>(
    null,
  );
  const [title, setTitle] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [lastSavedMarkdown, setLastSavedMarkdown] = useState("");
  const [drawingSeedContent, setDrawingSeedContent] = useState<string | null>(
    null,
  );
  const [serializedDrawing, setSerializedDrawing] = useState("");
  const [lastSavedDrawing, setLastSavedDrawing] = useState("");
  const [statusMessage, setStatusMessage] = useState("Carregando hibrido...");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">(
    "idle",
  );
  const [mobilePane, setMobilePane] = useState<"document" | "canvas">(
    "document",
  );
  const [activeSectionId, setActiveSectionId] = useState<string | null>(
    initialSectionId,
  );
  const [selectedElementIds, setSelectedElementIds] = useState<
    Record<string, true>
  >({});
  const [sceneElements, setSceneElements] = useState<
    readonly ExcalidrawElement[]
  >([]);
  const [sceneAppState, setSceneAppState] = useState<AppState | null>(null);
  const [sceneFiles, setSceneFiles] = useState<BinaryFiles>({});
  const [splitRatio, setSplitRatio] = useState(() => {
    if (typeof window === "undefined") {
      return DEFAULT_SPLIT_RATIO;
    }

    const storedValue = window.localStorage.getItem(
      `${HYBRID_SPLIT_STORAGE_PREFIX}${hybridId}`,
    );
    const parsedValue = Number(storedValue);
    return Number.isFinite(parsedValue)
      ? clampSplitRatio(parsedValue)
      : DEFAULT_SPLIT_RATIO;
  });
  const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const splitBodyRef = useRef<HTMLDivElement | null>(null);
  const isNarrow = useNarrowLayout();

  const loadHybrid = useCallback(async () => {
    setErrorMessage(null);
    setStatusMessage("Carregando hibrido...");

    try {
      const nextResponse = await getHybridItem(hybridId);
      const [docDraft, drawingDraft] = await Promise.all([
        getKindrawDraft(nextResponse.document.item.id),
        getKindrawDraft(nextResponse.drawing.item.id),
      ]);

      const restoredMarkdown =
        docDraft &&
        isDraftNewer(docDraft.updatedAt, nextResponse.document.item.updatedAt)
          ? docDraft.content
          : nextResponse.document.content;

      const restoredDrawing =
        drawingDraft &&
        isDraftNewer(
          drawingDraft.updatedAt,
          nextResponse.drawing.item.updatedAt,
        )
          ? drawingDraft.content
          : nextResponse.drawing.content;

      startTransition(() => {
        setResponse({
          ...nextResponse,
          document: {
            ...nextResponse.document,
            content: restoredMarkdown,
          },
          drawing: {
            ...nextResponse.drawing,
            content: restoredDrawing,
          },
        });
        setTitle(nextResponse.hybrid.title);
        setMarkdown(restoredMarkdown);
        setLastSavedMarkdown(nextResponse.document.content);
        setDrawingSeedContent(restoredDrawing);
        setSerializedDrawing(restoredDrawing);
        setLastSavedDrawing(nextResponse.drawing.content);
        setStatusMessage("Hibrido sincronizado.");
      });
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Falha ao carregar o hibrido."));
    }
  }, [hybridId]);

  useEffect(() => {
    void loadHybrid();
  }, [loadHybrid]);

  useEffect(() => {
    setActiveSectionId(initialSectionId);
  }, [initialSectionId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      `${HYBRID_SPLIT_STORAGE_PREFIX}${hybridId}`,
      String(splitRatio),
    );
  }, [hybridId, splitRatio]);

  useLayoutEffect(() => {
    if (initialView === "canvas") {
      setMobilePane("canvas");
      return;
    }

    setMobilePane("document");
  }, [initialView]);

  const persistMarkdown = useCallback(
    async (content: string) => {
      if (!response) {
        return;
      }

      const timestamp = new Date().toISOString();
      setSaveState("saving");
      await setKindrawDraft(response.document.item.id, {
        content,
        updatedAt: timestamp,
      });

      try {
        await updateItemContent(response.document.item.id, content);
        setLastSavedMarkdown(content);
        setSaveState("idle");
        setStatusMessage("Documento salvo.");
        setResponse((current) =>
          current
            ? {
                ...current,
                document: {
                  ...current.document,
                  content,
                  item: {
                    ...current.document.item,
                    updatedAt: timestamp,
                  },
                },
              }
            : current,
        );
        await onTreeRefresh();
      } catch (error) {
        setSaveState("error");
        setStatusMessage(
          getErrorMessage(error, "Falha ao salvar o documento."),
        );
      }
    },
    [onTreeRefresh, response],
  );

  useEffect(() => {
    if (!response || markdown === lastSavedMarkdown) {
      return;
    }

    const timer = window.setTimeout(() => {
      void persistMarkdown(markdown);
    }, 900);

    return () => window.clearTimeout(timer);
  }, [lastSavedMarkdown, markdown, persistMarkdown, response]);

  const persistDrawing = useCallback(
    async (content: string) => {
      if (!response) {
        return;
      }

      const timestamp = new Date().toISOString();
      setSaveState("saving");
      await setKindrawDraft(response.drawing.item.id, {
        content,
        updatedAt: timestamp,
      });

      try {
        await updateItemContent(response.drawing.item.id, content);
        setLastSavedDrawing(content);
        setSaveState("idle");
        setStatusMessage("Canvas salvo.");
        setResponse((current) =>
          current
            ? {
                ...current,
                drawing: {
                  ...current.drawing,
                  content,
                  item: {
                    ...current.drawing.item,
                    updatedAt: timestamp,
                  },
                },
              }
            : current,
        );
        await onTreeRefresh();
      } catch (error) {
        setSaveState("error");
        setStatusMessage(getErrorMessage(error, "Falha ao salvar o canvas."));
      }
    },
    [onTreeRefresh, response],
  );

  useEffect(() => {
    if (!response || !drawingSeedContent) {
      return;
    }

    if (!serializedDrawing || serializedDrawing === lastSavedDrawing) {
      return;
    }

    const timer = window.setTimeout(() => {
      void persistDrawing(serializedDrawing);
    }, 900);

    return () => window.clearTimeout(timer);
  }, [
    drawingSeedContent,
    lastSavedDrawing,
    persistDrawing,
    response,
    serializedDrawing,
  ]);

  const commitTitle = useCallback(async () => {
    if (!response) {
      return;
    }

    const nextTitle = title.trim();
    if (!nextTitle) {
      setTitle(response.hybrid.title);
      return;
    }

    if (nextTitle === response.hybrid.title) {
      return;
    }

    try {
      await updateHybridItemMeta(hybridId, { title: nextTitle });
      setResponse((current) =>
        current
          ? {
              ...current,
              hybrid: {
                ...current.hybrid,
                title: nextTitle,
              },
              document: {
                ...current.document,
                item: {
                  ...current.document.item,
                  title: nextTitle,
                },
              },
              drawing: {
                ...current.drawing,
                item: {
                  ...current.drawing.item,
                  title: nextTitle,
                },
              },
            }
          : current,
      );
      setStatusMessage("Titulo atualizado.");
      await onTreeRefresh();
    } catch (error) {
      setStatusMessage(getErrorMessage(error, "Falha ao atualizar o titulo."));
      setTitle(response.hybrid.title);
    }
  }, [hybridId, onTreeRefresh, response, title]);

  const handleCreateShareLink = useCallback(async () => {
    try {
      const shareResponse = await createHybridShareLink(hybridId);
      const publicUrl = buildPublicShareUrl(shareResponse.shareLink.token, {
        view: "both",
      });
      const copied = await copyToClipboard(publicUrl);

      setResponse((current) =>
        current
          ? {
              ...current,
              hybrid: {
                ...current.hybrid,
                shareLinks: [shareResponse.shareLink],
              },
            }
          : current,
      );
      setStatusMessage(
        copied ? "Link publico criado e copiado." : "Link publico criado.",
      );
      await onTreeRefresh();
    } catch (error) {
      setStatusMessage(getErrorMessage(error, "Falha ao criar link publico."));
    }
  }, [hybridId, onTreeRefresh]);

  const handleRevokeShareLink = useCallback(
    async (shareLinkId: string) => {
      try {
        await revokeShareLink(shareLinkId);
        setResponse((current) =>
          current
            ? {
                ...current,
                hybrid: {
                  ...current.hybrid,
                  shareLinks: [],
                },
              }
            : current,
        );
        await onTreeRefresh();
      } catch (error) {
        setStatusMessage(
          getErrorMessage(error, "Falha ao revogar link publico."),
        );
      }
    },
    [onTreeRefresh],
  );

  const handleUnlink = useCallback(async () => {
    if (!response) {
      return;
    }

    if (!window.confirm("Desvincular documento e canvas deste hibrido?")) {
      return;
    }

    try {
      await deleteHybridItem(hybridId);
      await onTreeRefresh();
      navigateKindraw(buildItemPath(response.document.item));
    } catch (error) {
      setStatusMessage(
        getErrorMessage(error, "Falha ao desvincular o hibrido."),
      );
    }
  }, [hybridId, onTreeRefresh, response]);

  const setView = useCallback(
    async (view: KindrawHybridView, sectionId?: string | null) => {
      navigateKindraw(
        buildHybridPath(hybridId, {
          view,
          sectionId: sectionId ?? activeSectionId,
        }),
      );

      if (response && view !== response.hybrid.defaultView) {
        try {
          await updateHybridItemMeta(hybridId, { defaultView: view });
          setResponse((current) =>
            current
              ? {
                  ...current,
                  hybrid: {
                    ...current.hybrid,
                    defaultView: view,
                  },
                }
              : current,
          );
        } catch (error) {
          console.warn("Failed to persist hybrid default view", error);
        }
      }
    },
    [activeSectionId, hybridId, response],
  );

  const handleLinkSelection = useCallback(
    (sectionId: string) => {
      if (!sceneElements.length || !sceneAppState) {
        setStatusMessage("Canvas ainda nao esta pronto.");
        return;
      }

      const selectedIds = Object.keys(selectedElementIds);
      if (!selectedIds.length) {
        setStatusMessage("Selecione ao menos um elemento no canvas.");
        return;
      }

      const nextElements = sceneElements.map((element) =>
        selectedIds.includes(element.id)
          ? newElementWith(element, {
              link: buildKindrawSectionLink(hybridId, sectionId),
            })
          : element,
      );

      excalidrawAPIRef.current?.updateScene({
        elements: nextElements,
      });
      setSceneElements(nextElements);
      setSerializedDrawing(
        serializeAsJSON(nextElements, sceneAppState, sceneFiles, "local"),
      );
      setStatusMessage("Selecao vinculada a secao.");
    },
    [hybridId, sceneAppState, sceneElements, sceneFiles, selectedElementIds],
  );

  const handleCanvasLinkOpen = useCallback<
    NonNullable<ExcalidrawProps["onLinkOpen"]>
  >(
    (element, event) => {
      if (!element.link) {
        return;
      }

      const target = parseKindrawSectionLink(element.link);
      if (!target || target.hybridId !== hybridId) {
        return;
      }

      event.preventDefault();
      setActiveSectionId(target.sectionId);
      void setView("both", target.sectionId);
    },
    [hybridId, setView],
  );

  const handleSplitPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const body = splitBodyRef.current;
      if (!body) {
        return;
      }

      event.preventDefault();
      const pointerId = event.pointerId;
      event.currentTarget.setPointerCapture(pointerId);

      const updateFromClientX = (clientX: number) => {
        const bounds = body.getBoundingClientRect();
        if (!bounds.width) {
          return;
        }

        setSplitRatio(clampSplitRatio((clientX - bounds.left) / bounds.width));
      };

      updateFromClientX(event.clientX);

      const onPointerMove = (moveEvent: PointerEvent) => {
        updateFromClientX(moveEvent.clientX);
      };

      const onPointerUp = () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp, { once: true });
    },
    [],
  );

  const hybridItemsById = useMemo(
    () =>
      response
        ? {
            ...itemsById,
            [response.document.item.id]: response.document.item,
            [response.drawing.item.id]: response.drawing.item,
          }
        : itemsById,
    [itemsById, response],
  );

  const drawingInitialData = useMemo<ExcalidrawInitialDataState | null>(
    () => (drawingSeedContent ? parseDrawingContent(drawingSeedContent) : null),
    [drawingSeedContent],
  );

  if (errorMessage) {
    return (
      <div className="kindraw-empty-state">
        <h2>Hibrido indisponivel</h2>
        <p>{errorMessage}</p>
      </div>
    );
  }

  if (!response || !drawingInitialData) {
    return (
      <div className="kindraw-loading-shell">
        <p>{statusMessage}</p>
      </div>
    );
  }

  const showDocument = initialView === "document" || initialView === "both";
  const showCanvas = initialView === "canvas" || initialView === "both";
  const documentPane = (
    <div className="kindraw-hybrid-shell__document">
      <HybridMarkdownPane
        activeSectionId={activeSectionId}
        canLinkSelection={showCanvas}
        hybridId={hybridId}
        itemsById={hybridItemsById}
        markdown={markdown}
        onLinkSelection={handleLinkSelection}
        onMarkdownChange={setMarkdown}
        onNavigate={navigateKindraw}
        onOpenCanvas={(sectionId) => {
          setActiveSectionId(sectionId);
          void setView("canvas", sectionId);
        }}
        onStatusMessage={setStatusMessage}
      />
    </div>
  );
  const canvasPane = (
    <div className="kindraw-hybrid-shell__canvas kindraw-drawing-stage">
      <Excalidraw
        key={response.drawing.item.id}
        onExcalidrawAPI={(api) => {
          excalidrawAPIRef.current = api;
        }}
        initialData={drawingInitialData}
        onChange={(elements, appState, files) => {
          setSceneElements(elements);
          setSceneAppState(appState);
          setSceneFiles(files);
          setSelectedElementIds(appState.selectedElementIds);
          setSerializedDrawing(
            serializeAsJSON(elements, appState, files, "local"),
          );
        }}
        onLinkOpen={handleCanvasLinkOpen}
      />
    </div>
  );

  return (
    <div className="kindraw-editor-shell kindraw-hybrid-shell">
      <header className="kindraw-editor-header kindraw-hybrid-shell__header">
        <div className="kindraw-editor-header__leading">
          <button
            className="kindraw-link-button"
            onClick={() =>
              navigateKindraw(buildFolderPath(response.hybrid.folderId))
            }
            type="button"
          >
            Voltar
          </button>
          <input
            className="kindraw-title-input"
            onBlur={() => void commitTitle()}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
            type="text"
            value={title}
          />
        </div>
        <div className="kindraw-editor-header__status">
          <div className="kindraw-hybrid-shell__toggle">
            <button
              className={`kindraw-hybrid-shell__toggle-button${
                initialView === "document"
                  ? " kindraw-hybrid-shell__toggle-button--active"
                  : ""
              }`}
              onClick={() => void setView("document")}
              type="button"
            >
              Document
            </button>
            <button
              className={`kindraw-hybrid-shell__toggle-button${
                initialView === "both"
                  ? " kindraw-hybrid-shell__toggle-button--active"
                  : ""
              }`}
              onClick={() => void setView("both")}
              type="button"
            >
              Both
            </button>
            <button
              className={`kindraw-hybrid-shell__toggle-button${
                initialView === "canvas"
                  ? " kindraw-hybrid-shell__toggle-button--active"
                  : ""
              }`}
              onClick={() => void setView("canvas")}
              type="button"
            >
              Canvas
            </button>
          </div>
          <span
            className={`kindraw-status-pill kindraw-status-pill--${saveState}`}
          >
            {statusMessage}
          </span>
        </div>
      </header>

      {initialView === "both" && isNarrow ? (
        <>
          <div className="kindraw-hybrid-shell__mobile-tabs">
            <button
              className={`kindraw-hybrid-shell__mobile-tab${
                mobilePane === "document"
                  ? " kindraw-hybrid-shell__mobile-tab--active"
                  : ""
              }`}
              onClick={() => setMobilePane("document")}
              type="button"
            >
              Documento
            </button>
            <button
              className={`kindraw-hybrid-shell__mobile-tab${
                mobilePane === "canvas"
                  ? " kindraw-hybrid-shell__mobile-tab--active"
                  : ""
              }`}
              onClick={() => setMobilePane("canvas")}
              type="button"
            >
              Canvas
            </button>
          </div>
          {mobilePane === "document" ? documentPane : canvasPane}
        </>
      ) : (
        <div
          className={`kindraw-hybrid-shell__body${
            initialView === "both" ? " kindraw-hybrid-shell__body--both" : ""
          }`}
          ref={splitBodyRef}
          style={
            initialView === "both"
              ? {
                  gridTemplateColumns: `${splitRatio}fr 18px ${
                    1 - splitRatio
                  }fr`,
                }
              : undefined
          }
        >
          {showDocument ? documentPane : null}
          {initialView === "both" ? (
            <button
              aria-label="Redimensionar documento e canvas"
              className="kindraw-hybrid-shell__divider"
              onPointerDown={handleSplitPointerDown}
              type="button"
            />
          ) : null}
          {showCanvas ? canvasPane : null}
        </div>
      )}

      <div className="kindraw-inline-actions">
        <button
          className="kindraw-link-button kindraw-link-button--danger"
          onClick={() => void handleUnlink()}
          type="button"
        >
          Desvincular
        </button>
        <button
          className="kindraw-link-button"
          onClick={() => navigateKindraw(buildItemPath(response.document.item))}
          type="button"
        >
          Abrir doc legado
        </button>
        <button
          className="kindraw-link-button"
          onClick={() => navigateKindraw(buildItemPath(response.drawing.item))}
          type="button"
        >
          Abrir canvas legado
        </button>
      </div>

      <ShareLinksPanel
        busy={saveState === "saving"}
        buildShareUrl={(token) => buildPublicShareUrl(token, { view: "both" })}
        onCreateShareLink={handleCreateShareLink}
        onRevokeShareLink={handleRevokeShareLink}
        shareLinks={response.hybrid.shareLinks}
      />
    </div>
  );
};
