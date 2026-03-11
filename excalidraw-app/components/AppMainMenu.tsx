import clsx from "clsx";
import React from "react";

import { useExcalidrawSetAppState } from "@excalidraw/excalidraw/components/App";
import { LibraryIcon } from "@excalidraw/excalidraw/components/icons";
import { useTunnels } from "@excalidraw/excalidraw/context/tunnels";
import { useUIAppState } from "@excalidraw/excalidraw/context/ui-appState";
import { useI18n } from "@excalidraw/excalidraw/i18n";

type AppMainMenuProps = {
  currentCanvasTitle?: string | null;
  currentCanvasStatus?: string | null;
  workspaceShortcutLabel?: string;
  isLoadingCanvas?: boolean;
  isEditingCanvasTitle?: boolean;
  draftCanvasTitle?: string;
  onCanvasTitleDoubleClick?: () => void;
  onCanvasTitleChange?: (value: string) => void;
  onCanvasTitleCommit?: () => void;
  onCanvasTitleCancel?: () => void;
  canvasTitleInputRef?: React.RefObject<HTMLInputElement | null>;
};

export const AppMainMenu: React.FC<AppMainMenuProps> = React.memo(
  ({
    currentCanvasTitle,
    currentCanvasStatus,
    workspaceShortcutLabel,
    isLoadingCanvas = false,
    isEditingCanvasTitle = false,
    draftCanvasTitle = "",
    onCanvasTitleDoubleClick,
    onCanvasTitleChange,
    onCanvasTitleCommit,
    onCanvasTitleCancel,
    canvasTitleInputRef,
  }) => {
    const { DefaultSidebarTriggerTunnel, MainMenuTunnel } = useTunnels();
    const appState = useUIAppState();
    const setAppState = useExcalidrawSetAppState();
    const { t } = useI18n();

    const isKindrawSidebarOpen = appState.openSidebar?.name === "kindraw";

    return (
      <>
        <DefaultSidebarTriggerTunnel.In>
          <span style={{ display: "none" }} />
        </DefaultSidebarTriggerTunnel.In>
        <MainMenuTunnel.In>
          <div className="kindraw-main-menu-shell">
            <button
              type="button"
              data-testid="main-menu-trigger"
              className={clsx(
                "dropdown-menu-button",
                "main-menu-trigger",
                "kindraw-main-menu-trigger",
                "zen-mode-transition",
              )}
              aria-label={t("kindraw.actions.openWorkspace")}
              aria-expanded={isKindrawSidebarOpen}
              title={
                workspaceShortcutLabel
                  ? `${t(
                      "kindraw.sidebar.workspace",
                    )} • ${workspaceShortcutLabel}`
                  : t("kindraw.sidebar.workspace")
              }
              onClick={() => {
                setAppState({
                  openSidebar: isKindrawSidebarOpen
                    ? null
                    : { name: "kindraw" },
                  openMenu: null,
                  openPopup: null,
                  openDialog: null,
                });
              }}
            >
              {LibraryIcon}
            </button>
            {currentCanvasTitle ? (
              <div
                className={`kindraw-main-menu-shell__canvas${
                  isLoadingCanvas
                    ? " kindraw-main-menu-shell__canvas--loading"
                    : ""
                }${
                  isEditingCanvasTitle
                    ? " kindraw-main-menu-shell__canvas--editing"
                    : ""
                }`}
                onDoubleClick={onCanvasTitleDoubleClick}
                title={t("kindraw.actions.renameCanvasHint")}
              >
                {isEditingCanvasTitle ? (
                  <input
                    ref={canvasTitleInputRef}
                    className="kindraw-main-menu-shell__canvas-input"
                    onBlur={onCanvasTitleCommit}
                    onChange={(event) =>
                      onCanvasTitleChange?.(event.target.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        onCanvasTitleCommit?.();
                      }

                      if (event.key === "Escape") {
                        event.preventDefault();
                        onCanvasTitleCancel?.();
                      }
                    }}
                    type="text"
                    value={draftCanvasTitle}
                  />
                ) : (
                  <strong title={currentCanvasTitle}>
                    {currentCanvasTitle}
                  </strong>
                )}
                <span className="kindraw-main-menu-shell__canvas-status">
                  {isLoadingCanvas ? (
                    <>
                      <span className="kindraw-main-menu-shell__canvas-spinner" />
                      {t("kindraw.status.loadingCanvas")}
                    </>
                  ) : (
                    currentCanvasStatus || t("kindraw.status.drawingSynced")
                  )}
                </span>
              </div>
            ) : null}
          </div>
        </MainMenuTunnel.In>
      </>
    );
  },
);
