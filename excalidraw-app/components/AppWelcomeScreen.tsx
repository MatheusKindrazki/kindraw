import { loginIcon, usersIcon } from "@excalidraw/excalidraw/components/icons";
import { POINTER_EVENTS } from "@excalidraw/common";
import { WelcomeScreen } from "@excalidraw/excalidraw/index";
import React from "react";

import type { KindrawRoute } from "../kindraw/router";
import type { KindrawSession } from "../kindraw/types";

type AppWelcomeScreenProps = {
  currentItemTitle: string | null;
  isCollabEnabled: boolean;
  kindrawSession: KindrawSession | null | undefined;
  onCollabDialogOpen: () => any;
  onGithubLogin: () => void;
  routeKind: KindrawRoute["kind"];
};

export const AppWelcomeScreen: React.FC<AppWelcomeScreenProps> = React.memo(
  ({
    currentItemTitle,
    isCollabEnabled,
    kindrawSession,
    onCollabDialogOpen,
    onGithubLogin,
    routeKind,
  }) => {
    const headingContent =
      routeKind === "drawing" && currentItemTitle ? (
        <>
          Editando {currentItemTitle}
          <br />
          Realtime no topo. Workspace e links publicos na lateral.
        </>
      ) : kindrawSession ? (
        <>
          Canvas e workspace no mesmo fluxo.
          <br />
          Use a lateral para criar drawings e organizar subpastas.
        </>
      ) : (
        <>
          Excalidraw com workspace do Kindraw.
          <br />
          Salve drawings e compartilhe links publicos.
        </>
      );

    return (
      <WelcomeScreen>
        <WelcomeScreen.Hints.MenuHint>
          Workspace e arquivos
        </WelcomeScreen.Hints.MenuHint>
        <WelcomeScreen.Hints.ToolbarHint>
          Ferramentas do canvas
        </WelcomeScreen.Hints.ToolbarHint>
        <WelcomeScreen.Hints.HelpHint>
          Ajuda e atalhos
        </WelcomeScreen.Hints.HelpHint>
        <WelcomeScreen.Center>
          <WelcomeScreen.Center.Logo>
            <div style={{ pointerEvents: POINTER_EVENTS.inheritFromUI }}>
              Kindraw
            </div>
          </WelcomeScreen.Center.Logo>
          <WelcomeScreen.Center.Heading>
            {headingContent}
          </WelcomeScreen.Center.Heading>
          <WelcomeScreen.Center.Menu>
            {!kindrawSession ? (
              <WelcomeScreen.Center.MenuItem
                icon={loginIcon}
                onSelect={onGithubLogin}
                shortcut={null}
              >
                Entrar com GitHub
              </WelcomeScreen.Center.MenuItem>
            ) : null}

            {isCollabEnabled ? (
              <WelcomeScreen.Center.MenuItem
                icon={usersIcon}
                onSelect={onCollabDialogOpen}
                shortcut={null}
              >
                Abrir realtime
              </WelcomeScreen.Center.MenuItem>
            ) : null}

            <WelcomeScreen.Center.MenuItemLoadScene />
            <WelcomeScreen.Center.MenuItemHelp />
          </WelcomeScreen.Center.Menu>
        </WelcomeScreen.Center>
      </WelcomeScreen>
    );
  },
);
