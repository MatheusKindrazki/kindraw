import { useEffect, useRef } from "react";

import { DefaultSidebar, Sidebar } from "@excalidraw/excalidraw";
import { ExcalidrawLogo } from "@excalidraw/excalidraw/components/ExcalidrawLogo";
import {
  useEditorInterface,
  useExcalidrawSetAppState,
} from "@excalidraw/excalidraw/components/App";
import {
  ImageIcon,
  LibraryIcon,
  gridIcon,
} from "@excalidraw/excalidraw/components/icons";
import { useI18n } from "@excalidraw/excalidraw/i18n";
import { useUIAppState } from "@excalidraw/excalidraw/context/ui-appState";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { navigateKindraw } from "../kindraw/router";

import { IconLibraryPanel } from "./IconLibraryPanel";
import { TemplateLibraryPanel } from "./TemplateLibraryPanel";

import "./AppSidebar.scss";

import type { KindrawRoute } from "../kindraw/router";

// The in-canvas sidebar now only hosts the "Insert" tooling (icons + templates).
// Browsing / managing canvases lives entirely in the Kindraw home (the Ateliê
// workspace at `/`), so the old "Workspace" tab was removed and replaced by a
// single button that takes the user back there. The workspace-only props that
// App.tsx still passes are accepted-but-ignored here so the call site stays
// untouched; only `excalidrawAPI` and `route` are actually used.
type AppSidebarProps = {
  excalidrawAPI?: ExcalidrawImperativeAPI | null;
  route: KindrawRoute;
  currentDrawingStatus?: string | null;
  currentItem?: unknown;
  drawingSaveState?: "idle" | "saving" | "error";
  errorMessage?: string | null;
  isMutating?: boolean;
  onAssignTag?: unknown;
  onArchiveItem?: unknown;
  onCreateItem?: unknown;
  onCreateTag?: unknown;
  onDeleteItem?: unknown;
  onLogout?: unknown;
  session?: unknown;
  tree?: unknown;
};

export const AppSidebar = ({ excalidrawAPI, route }: AppSidebarProps) => {
  const { t } = useI18n();
  const { openSidebar } = useUIAppState();
  const editorInterface = useEditorInterface();
  const setAppState = useExcalidrawSetAppState();
  const didAutoOpenRef = useRef(false);

  useEffect(() => {
    if (
      didAutoOpenRef.current ||
      !editorInterface.canFitSidebar ||
      route.kind === "public" ||
      route.kind === "share" ||
      openSidebar
    ) {
      return;
    }

    didAutoOpenRef.current = true;
    setAppState({
      openSidebar: { name: "kindraw" },
      openMenu: null,
      openPopup: null,
      openDialog: null,
    });
  }, [editorInterface.canFitSidebar, openSidebar, route.kind, setAppState]);

  useEffect(() => {
    const root = document.querySelector(".excalidraw");
    const isDockedLeft =
      openSidebar?.name === "kindraw" && editorInterface.canFitSidebar;

    root?.classList.toggle("kindraw-sidebar-open-left", isDockedLeft);

    return () => {
      root?.classList.remove("kindraw-sidebar-open-left");
    };
  }, [editorInterface.canFitSidebar, openSidebar?.name]);

  return (
    <>
      <DefaultSidebar className="kindraw-app-sidebar__fallback-suppress" />
      <Sidebar
        className="kindraw-app-sidebar-root"
        docked={editorInterface.canFitSidebar}
        name="kindraw"
      >
        <Sidebar.Header className="kindraw-app-sidebar__shell-header">
          <div className="kindraw-app-sidebar__brand">
            <ExcalidrawLogo size="xs" withText />
          </div>
          <button
            aria-label={t("kindraw.sidebar.backToLibraryAria")}
            className="kindraw-app-sidebar__home-button"
            onClick={() => navigateKindraw("/")}
            type="button"
          >
            <span className="kindraw-app-sidebar__home-button-icon">
              {LibraryIcon}
            </span>
            <span>{t("kindraw.sidebar.backToLibrary")}</span>
          </button>
        </Sidebar.Header>

        <div className="kindraw-app-sidebar__panel">
          <section className="kindraw-app-sidebar__section">
            <div className="kindraw-app-sidebar__section-header">
              <span className="kindraw-app-sidebar__section-label">
                <span className="kindraw-app-sidebar__section-mark">
                  {ImageIcon}
                </span>
                {t("kindraw.iconLibrary.sectionTitle")}
              </span>
            </div>
            <IconLibraryPanel excalidrawAPI={excalidrawAPI ?? null} />
          </section>

          <section className="kindraw-app-sidebar__section">
            <div className="kindraw-app-sidebar__section-header">
              <span className="kindraw-app-sidebar__section-label">
                <span className="kindraw-app-sidebar__section-mark">
                  {gridIcon}
                </span>
                {t("kindraw.templateLibrary.sectionTitle")}
              </span>
            </div>
            <TemplateLibraryPanel excalidrawAPI={excalidrawAPI ?? null} />
          </section>
        </div>
      </Sidebar>
    </>
  );
};
