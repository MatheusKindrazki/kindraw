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
  enableCollaborationRoom,
  getHybridItem,
  revokeShareLink,
  updateHybridItemMeta,
  updateItemContent,
  buildPublicShareUrl,
} from "./api";
import { LibraryIcon } from "@excalidraw/excalidraw/components/icons";

import { AppSidebar } from "../components/AppSidebar";

import { parseDrawingContent } from "./content";
import { colorForUser } from "./identity";
import { HybridMarkdownPane } from "./HybridMarkdownPane";
import { KindrawIcon } from "./icons";
import { PresenceFacepile } from "./PresenceFacepile";
import { useCanvasCollab } from "./useCanvasCollab";
import {
  buildHybridPath,
  buildItemPath,
  buildFolderPath,
  navigateKindraw,
} from "./router";
import { ShareHybridModal } from "./ShareHybridModal";
import { ShareLinksPanel } from "./ShareLinksPanel";
import { getKindrawDraft, setKindrawDraft } from "./storage";
import { usePresence } from "./usePresence";
import { getErrorMessage, isDraftNewer } from "./utils";
import {
  appendHybridSection,
  buildKindrawSectionLink,
  parseHybridMarkdownSections,
  parseKindrawSectionLink,
} from "./hybridSections";

import { KindrawYjsProvider } from "./yjsProvider";

import type { PointerEvent as ReactPointerEvent } from "react";
import type {
  KindrawFolder,
  KindrawHybridItemResponse,
  KindrawHybridView,
  KindrawItem,
  KindrawUser,
} from "./types";

type HybridEditorPageProps = {
  hybridId: string;
  initialView: KindrawHybridView;
  initialSectionId: string | null;
  itemsById: Record<string, KindrawItem>;
  onTreeRefresh: () => Promise<void> | void;
  folders?: KindrawFolder[];
  currentUser?: KindrawUser | null;
};

const HYBRID_VIEW_LABELS: { view: KindrawHybridView; label: string }[] = [
  { view: "document", label: "Documento" },
  { view: "both", label: "Ambos" },
  { view: "canvas", label: "Canvas" },
];

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
  folders,
  currentUser,
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
  const [linkingSectionId, setLinkingSectionId] = useState<string | null>(null);
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
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [unlinkConfirmOpen, setUnlinkConfirmOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  // Sessão de colaboração ao vivo do DOCUMENTO (Yjs) — SEMPRE ativa p/ editores.
  // O painel de documento usa o editor colaborativo full-doc enquanto há provider.
  const [liveProvider, setLiveProvider] = useState<KindrawYjsProvider | null>(
    null,
  );
  const liveProviderRef = useRef<KindrawYjsProvider | null>(null);
  // Chave de cifra do canal de canvas (vem da collab room do drawing item).
  const [canvasRoomKey, setCanvasRoomKey] = useState<string | null>(null);
  const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null);
  // state (além da ref) p/ o AppSidebar (menu de ícones/templates) reagir quando
  // a API do Excalidraw fica pronta.
  const [excalidrawAPI, setExcalidrawAPI] =
    useState<ExcalidrawImperativeAPI | null>(null);
  const splitBodyRef = useRef<HTMLDivElement | null>(null);
  const headerMenuRef = useRef<HTMLDivElement | null>(null);
  const isNarrow = useNarrowLayout();

  useEffect(() => {
    if (!headerMenuOpen) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (
        headerMenuRef.current &&
        !headerMenuRef.current.contains(event.target as Node)
      ) {
        setHeaderMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setHeaderMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [headerMenuOpen]);

  useEffect(() => {
    if (!unlinkConfirmOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setUnlinkConfirmOpen(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [unlinkConfirmOpen]);

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

  const handleCreateShareLink = useCallback(
    async (access: "read" | "live-edit" = "read") => {
      try {
        const shareResponse = await createHybridShareLink(hybridId, access);

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
          access === "live-edit"
            ? "Link de edição ao vivo criado."
            : "Link publico criado.",
        );
        await onTreeRefresh();
      } catch (error) {
        setStatusMessage(
          getErrorMessage(error, "Falha ao criar link publico."),
        );
      }
    },
    [hybridId, onTreeRefresh],
  );

  // SEMPRE-AO-VIVO: assim que o híbrido carrega e há um editor (usuário logado),
  // a sessão de colaboração do documento conecta sozinha — sem toggle "Iniciar".
  // Igual Eraser/Figma/tldraw: colaboração é implícita em ter acesso de edição.
  useEffect(() => {
    // só editores logados abrem provider aqui; viewer/anônimo via share view.
    if (!response || !currentUser) {
      return undefined;
    }
    // viewer (compartilhamento read-only) não entra em modo de escrita ao vivo.
    if (response.hybrid.sharedRole === "viewer") {
      return undefined;
    }

    const provider = new KindrawYjsProvider({
      roomId: `hdoc:${hybridId}`,
      user: {
        name: currentUser.name || currentUser.githubLogin,
        color: colorForUser(currentUser.id),
        avatarUrl: currentUser.avatarUrl,
        githubLogin: currentUser.githubLogin,
        userId: currentUser.id,
      },
    });
    liveProviderRef.current = provider;
    setLiveProvider(provider);

    return () => {
      provider.destroy();
      liveProviderRef.current = null;
      setLiveProvider(null);
    };
  }, [currentUser, hybridId, response?.hybrid.sharedRole, response]);

  // Presença ao vivo (facepile + base p/ cursores) derivada do awareness.
  const presence = usePresence(liveProvider);

  // Garante a collab room do drawing (chave de cifra do canal de canvas).
  // Editores logados: habilita a room se ainda não houver e guarda a roomKey.
  useEffect(() => {
    if (!response || !currentUser) {
      return;
    }
    if (response.hybrid.sharedRole === "viewer") {
      return;
    }
    const existing = response.drawing.collaborationRoom?.roomKey;
    if (existing) {
      setCanvasRoomKey(existing);
      return;
    }
    let cancelled = false;
    void enableCollaborationRoom(response.drawing.item.id)
      .then((res) => {
        if (!cancelled) {
          setCanvasRoomKey(res.collaborationRoom.roomKey);
        }
      })
      .catch(() => {
        /* canvas ao vivo é best-effort; doc segue ao vivo de qualquer forma */
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser, response]);

  // Cliente de colaboração de canvas (enxuto). Conecta ao canal hcanvas:<id>
  // com a roomKey do drawing; renderiza cursores/seleção nativamente.
  const canvasCollab = useCanvasCollab({
    enabled: Boolean(currentUser) && Boolean(canvasRoomKey),
    roomId: `hcanvas:${hybridId}`,
    roomKey: canvasRoomKey,
    profile: {
      name: currentUser?.name || currentUser?.githubLogin || "Você",
      userId: currentUser?.id ?? null,
      avatarUrl: currentUser?.avatarUrl ?? null,
      githubLogin: currentUser?.githubLogin ?? null,
    },
    excalidrawAPIRef,
  });

  // Repassa os colaboradores do canvas (cursores/seleção) p/ o Excalidraw, que
  // os renderiza nativamente.
  useEffect(() => {
    excalidrawAPIRef.current?.updateScene({
      collaborators: canvasCollab.collaborators,
    });
  }, [canvasCollab.collaborators]);

  // Idle/grace: marca o usuário como ausente após inatividade (dim no facepile,
  // base p/ fade do cursor antes da remoção). Atividade volta a "ativo".
  useEffect(() => {
    if (!liveProvider) {
      return undefined;
    }
    let idleTimer: number | null = null;
    const IDLE_MS = 60_000;
    const goActive = () => {
      liveProvider.setIdle(false);
      if (idleTimer !== null) {
        window.clearTimeout(idleTimer);
      }
      idleTimer = window.setTimeout(() => liveProvider.setIdle(true), IDLE_MS);
    };
    const onHidden = () => {
      if (document.visibilityState === "hidden") {
        liveProvider.setIdle(true);
      } else {
        goActive();
      }
    };
    goActive();
    window.addEventListener("pointermove", goActive, { passive: true });
    window.addEventListener("keydown", goActive);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      if (idleTimer !== null) {
        window.clearTimeout(idleTimer);
      }
      window.removeEventListener("pointermove", goActive);
      window.removeEventListener("keydown", goActive);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, [liveProvider]);

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

  /**
   * Aplica o link kindraw aos elementos cujos ids estão em `selectedIds`.
   * Retorna `true` se ao menos um elemento foi vinculado.
   */
  const linkElementsToSection = useCallback(
    (sectionId: string, selectedIds: string[]) => {
      if (!sceneElements.length || !sceneAppState) {
        setStatusMessage("Canvas ainda nao esta pronto.");
        return false;
      }

      if (!selectedIds.length) {
        setStatusMessage("Selecione ao menos um elemento no canvas.");
        return false;
      }

      const selectedSet = new Set(selectedIds);
      const nextElements = sceneElements.map((element) =>
        selectedSet.has(element.id)
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
      return true;
    },
    [hybridId, sceneAppState, sceneElements, sceneFiles],
  );

  /**
   * Ação "Vincular" da seção. Se já há seleção no canvas, vincula na hora;
   * caso contrário entra no "modo vincular" e espera a próxima seleção.
   */
  const handleLinkSelection = useCallback(
    (sectionId: string) => {
      // Toggle: clicar de novo na seção que já está aguardando cancela o modo.
      if (linkingSectionId === sectionId) {
        setLinkingSectionId(null);
        return;
      }

      const selectedIds = Object.keys(selectedElementIds);
      if (selectedIds.length > 0) {
        if (linkElementsToSection(sectionId, selectedIds)) {
          setLinkingSectionId(null);
          setStatusMessage("Selecao vinculada a secao.");
        }
        return;
      }

      // Sem seleção: entra no modo vincular e garante canvas visível.
      setLinkingSectionId(sectionId);
      setActiveSectionId(sectionId);
      void setView("both", sectionId);
      setStatusMessage("Selecione elementos no canvas para vincular.");
    },
    [linkElementsToSection, linkingSectionId, selectedElementIds, setView],
  );

  const handleAddSection = useCallback(() => {
    const { markdown: nextMarkdown, sectionId } = appendHybridSection(
      markdown,
      "Nova seção",
    );
    setMarkdown(nextMarkdown);
    setActiveSectionId(sectionId);
    setStatusMessage("Nova secao criada.");
    return sectionId;
  }, [markdown]);

  const handleFocusSectionOnCanvas = useCallback(
    (sectionId: string) => {
      setActiveSectionId(sectionId);
      void setView("both", sectionId);

      const linked = sceneElements.filter((element) => {
        if (!element.link) {
          return false;
        }
        const target = parseKindrawSectionLink(element.link);
        return target?.hybridId === hybridId && target.sectionId === sectionId;
      });

      if (!linked.length) {
        return;
      }

      const linkedIds = linked.map((element) => element.id);

      // O setView pode trocar o layout (mostrar o canvas) e remontar o canvas
      // antes do zoom rodar; damos um tempo para a API estar pronta e usamos os
      // elementos ATUAIS da cena (por id) para garantir referências válidas.
      window.setTimeout(() => {
        const api = excalidrawAPIRef.current;
        if (!api) {
          return;
        }
        const targets = api
          .getSceneElements()
          .filter((element: ExcalidrawElement) =>
            linkedIds.includes(element.id),
          );
        if (!targets.length) {
          return;
        }
        api.updateScene({
          appState: {
            selectedElementIds: Object.fromEntries(
              targets.map((element: ExcalidrawElement) => [element.id, true]),
            ),
          },
        });
        // o zoom precisa rodar depois da seleção assentar, senão o
        // scrollToContent é engolido pelo updateScene do mesmo tick.
        window.setTimeout(() => {
          api.scrollToContent(targets, {
            fitToContent: true,
            animate: true,
            duration: 500,
          });
        }, 60);
      }, 80);
    },
    [hybridId, sceneElements, setView],
  );

  // Esc cancela o modo vincular.
  useEffect(() => {
    if (!linkingSectionId) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLinkingSectionId(null);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [linkingSectionId]);

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

  const sections = useMemo(
    () => parseHybridMarkdownSections(markdown),
    [markdown],
  );

  /** Seções com pelo menos um elemento do canvas vinculado (element.link). */
  const linkedSectionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const element of sceneElements) {
      if (!element.link) {
        continue;
      }

      const target = parseKindrawSectionLink(element.link);
      if (target && target.hybridId === hybridId) {
        ids.add(target.sectionId);
      }
    }
    return ids;
  }, [hybridId, sceneElements]);

  const linkingSection = useMemo(
    () =>
      linkingSectionId
        ? sections.find((section) => section.id === linkingSectionId) || null
        : null,
    [linkingSectionId, sections],
  );

  // Modo vincular: assim que o usuário seleciona ≥1 elemento no canvas, vincula
  // automaticamente à seção aguardando. Como só entramos no modo quando NÃO havia
  // seleção (ver handleLinkSelection), qualquer seleção observada aqui é nova.
  useEffect(() => {
    if (!linkingSectionId) {
      return;
    }

    const selectedIds = Object.keys(selectedElementIds);
    if (!selectedIds.length) {
      return;
    }

    const sectionTitle = linkingSection?.title || "secao";
    if (linkElementsToSection(linkingSectionId, selectedIds)) {
      setLinkingSectionId(null);
      setStatusMessage(`Selecao vinculada a ${sectionTitle}.`);
    }
  }, [
    linkElementsToSection,
    linkingSection,
    linkingSectionId,
    selectedElementIds,
  ]);

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
  const folderName =
    folders?.find((folder) => folder.id === response.hybrid.folderId)?.name ||
    "Biblioteca";

  const documentPane = (
    <section className="kindraw-hybrid-shell__document">
      <HybridMarkdownPane
        activeSectionId={activeSectionId}
        canLinkSelection={showCanvas}
        collabProvider={liveProvider}
        hybridId={hybridId}
        itemsById={hybridItemsById}
        linkedSectionIds={linkedSectionIds}
        linkingSectionId={linkingSectionId}
        markdown={markdown}
        onAddSection={handleAddSection}
        onFocusSectionOnCanvas={handleFocusSectionOnCanvas}
        onLinkSelection={handleLinkSelection}
        onMarkdownChange={setMarkdown}
        onNavigate={navigateKindraw}
        onOpenCanvas={(sectionId) => {
          setActiveSectionId(sectionId);
          void setView("canvas", sectionId);
        }}
        onStatusMessage={setStatusMessage}
      />
    </section>
  );
  const canvasPane = (
    <section className="kindraw-hybrid-shell__canvas">
      {linkingSection ? (
        <div className="kindraw-linkbar" role="status">
          <span className="kindraw-linkbar__text">
            <KindrawIcon name="link" size={13} /> Selecione elementos no canvas
            para vincular à <strong>{linkingSection.title}</strong>
          </span>
          <button
            className="kindraw-linkbar__cancel"
            onClick={() => setLinkingSectionId(null)}
            type="button"
          >
            Cancelar
          </button>
        </div>
      ) : null}
      <Excalidraw
        key={response.drawing.item.id}
        onExcalidrawAPI={(api) => {
          excalidrawAPIRef.current = api;
          setExcalidrawAPI(api);
        }}
        initialData={drawingInitialData}
        isCollaborating={canvasCollab.isConnected}
        onChange={(elements, appState, files) => {
          setSceneElements(elements);
          setSceneAppState(appState);
          setSceneFiles(files);
          setSelectedElementIds(appState.selectedElementIds);
          setSerializedDrawing(
            serializeAsJSON(elements, appState, files, "local"),
          );
          // propaga a cena aos outros participantes do canvas (no-op se eco).
          canvasCollab.broadcastScene(elements);
        }}
        onPointerUpdate={canvasCollab.onPointerUpdate}
        onLinkOpen={handleCanvasLinkOpen}
        renderTopRightUI={(isMobile) =>
          isMobile ? null : (
            <button
              aria-label="Inserir ícones e templates"
              className="kindraw-insert-trigger"
              onClick={() =>
                excalidrawAPIRef.current?.toggleSidebar({ name: "kindraw" })
              }
              title="Inserir ícones e templates"
              type="button"
            >
              {LibraryIcon}
            </button>
          )
        }
      >
        {/* Menu "Inserir" (ícones + templates/fluxogramas) — mesmo do editor de
            canvas. Desacoplado: só usa excalidrawAPI + route. */}
        <AppSidebar
          excalidrawAPI={excalidrawAPI}
          route={{
            kind: "hybrid",
            hybridId,
            view: initialView,
            sectionId: activeSectionId,
          }}
        />
      </Excalidraw>
    </section>
  );

  return (
    <div className="kindraw-editor-shell kindraw-hybrid-shell">
      <header className="kindraw-editor-header">
        <div className="kindraw-editor-header__leading">
          <button
            aria-label="Voltar para a pasta"
            className="kindraw-iconbtn"
            onClick={() =>
              navigateKindraw(buildFolderPath(response.hybrid.folderId))
            }
            type="button"
          >
            <KindrawIcon name="back" size={17} />
          </button>
          <span className="kindraw-editor-crumb">{folderName} /</span>
          <div className="kindraw-editor-title">
            <input
              aria-label="Titulo do híbrido"
              className="kindraw-editor-title__input"
              onBlur={() => void commitTitle()}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
              size={Math.min(Math.max(title.length, 4), 48)}
              type="text"
              value={title}
            />
            <KindrawIcon name="pen" size={13} />
          </div>
        </div>
        <div className="kindraw-segment kindraw-editor-header__segment">
          {HYBRID_VIEW_LABELS.map(({ view, label }) => (
            <button
              className={`kindraw-segment__btn${
                initialView === view ? " kindraw-segment__btn--active" : ""
              }`}
              key={view}
              onClick={() => void setView(view)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="kindraw-editor-header__trailing">
          <PresenceFacepile users={presence} />
          <span
            className={`kindraw-pill kindraw-pill--${
              saveState === "idle" ? "ok" : saveState
            }`}
            title={statusMessage}
          >
            <i />
            <span>{statusMessage}</span>
          </span>
          <button
            className="kindraw-btn kindraw-btn--soft kindraw-btn--sm"
            onClick={() => setShareModalOpen(true)}
            type="button"
          >
            <KindrawIcon name="users" size={14} /> Compartilhar
          </button>
          <div className="kindraw-menuwrap" ref={headerMenuRef}>
            <button
              aria-expanded={headerMenuOpen}
              aria-label="Mais ações do híbrido"
              className="kindraw-dots kindraw-dots--visible"
              onClick={() => setHeaderMenuOpen(!headerMenuOpen)}
              type="button"
            >
              <KindrawIcon name="dots" size={16} />
            </button>
            {headerMenuOpen ? (
              <div className="kindraw-popover kindraw-popover--menu">
                <div className="kindraw-menu" role="menu">
                  <button
                    className="kindraw-menu__item kindraw-menu__item--danger"
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      setUnlinkConfirmOpen(true);
                    }}
                    role="menuitem"
                    type="button"
                  >
                    Desvincular
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <ShareLinksPanel
            busy={saveState === "saving"}
            buildShareUrl={(token) =>
              buildPublicShareUrl(token, { view: "both" })
            }
            onCreateShareLink={handleCreateShareLink}
            onRevokeShareLink={handleRevokeShareLink}
            shareLinks={response.hybrid.shareLinks}
            supportsLiveEdit
          />
        </div>
      </header>

      {initialView === "both" && isNarrow ? (
        <>
          <div className="kindraw-segment kindraw-segment--tabs">
            <button
              className={`kindraw-segment__btn${
                mobilePane === "document" ? " kindraw-segment__btn--active" : ""
              }`}
              onClick={() => setMobilePane("document")}
              type="button"
            >
              Documento
            </button>
            <button
              className={`kindraw-segment__btn${
                mobilePane === "canvas" ? " kindraw-segment__btn--active" : ""
              }`}
              onClick={() => setMobilePane("canvas")}
              type="button"
            >
              Canvas
            </button>
          </div>
          <div className="kindraw-hybrid-shell__body">
            {mobilePane === "document" ? documentPane : canvasPane}
          </div>
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
                  gridTemplateColumns: `${splitRatio}fr 14px ${
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
            >
              <i />
              <i />
              <i />
            </button>
          ) : null}
          {showCanvas ? canvasPane : null}
        </div>
      )}

      {unlinkConfirmOpen ? (
        <div
          className="kindraw-modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setUnlinkConfirmOpen(false);
            }
          }}
        >
          <div aria-modal="true" className="kindraw-modal" role="dialog">
            <h2>Desvincular híbrido</h2>
            <p>
              Desvincular documento e canvas deste híbrido? Os dois itens
              continuam existindo separadamente.
            </p>
            <div className="kindraw-modal__actions">
              <button
                className="kindraw-btn kindraw-btn--soft"
                onClick={() => setUnlinkConfirmOpen(false)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="kindraw-btn kindraw-btn--danger"
                onClick={() => {
                  setUnlinkConfirmOpen(false);
                  void handleUnlink();
                }}
                type="button"
              >
                Desvincular
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {shareModalOpen ? (
        <ShareHybridModal
          hybrid={{ id: hybridId, title: response.hybrid.title }}
          onChange={() => void onTreeRefresh()}
          onClose={() => setShareModalOpen(false)}
        />
      ) : null}
    </div>
  );
};
