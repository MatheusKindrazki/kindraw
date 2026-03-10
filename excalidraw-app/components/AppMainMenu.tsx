import clsx from "clsx";
import React from "react";

import { useExcalidrawSetAppState } from "@excalidraw/excalidraw/components/App";
import { LibraryIcon } from "@excalidraw/excalidraw/components/icons";
import { useTunnels } from "@excalidraw/excalidraw/context/tunnels";
import { useUIAppState } from "@excalidraw/excalidraw/context/ui-appState";

export const AppMainMenu: React.FC = React.memo(() => {
  const { DefaultSidebarTriggerTunnel, MainMenuTunnel } = useTunnels();
  const appState = useUIAppState();
  const setAppState = useExcalidrawSetAppState();

  const isKindrawSidebarOpen = appState.openSidebar?.name === "kindraw";

  return (
    <>
      <DefaultSidebarTriggerTunnel.In>
        <span style={{ display: "none" }} />
      </DefaultSidebarTriggerTunnel.In>
      <MainMenuTunnel.In>
        <button
          type="button"
          data-testid="main-menu-trigger"
          className={clsx(
            "dropdown-menu-button",
            "main-menu-trigger",
            "kindraw-main-menu-trigger",
            "zen-mode-transition",
          )}
          aria-label="Abrir workspace"
          aria-expanded={isKindrawSidebarOpen}
          title="Workspace"
          onClick={() => {
            setAppState({
              openSidebar: isKindrawSidebarOpen ? null : { name: "kindraw" },
              openMenu: null,
              openPopup: null,
              openDialog: null,
            });
          }}
        >
          {LibraryIcon}
        </button>
      </MainMenuTunnel.In>
    </>
  );
});
