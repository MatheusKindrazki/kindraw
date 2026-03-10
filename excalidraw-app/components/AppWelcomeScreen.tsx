import { loginIcon, usersIcon } from "@excalidraw/excalidraw/components/icons";
import { useI18n } from "@excalidraw/excalidraw/i18n";
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
    const { t } = useI18n();
    const headingContent =
      routeKind === "drawing" && currentItemTitle ? (
        <>
          {t("kindraw.welcome.editingTitle", { title: currentItemTitle })}
          <br />
          {t("kindraw.welcome.editingSubtitle")}
        </>
      ) : kindrawSession ? (
        <>
          {t("kindraw.welcome.workspaceTitle")}
          <br />
          {t("kindraw.welcome.workspaceSubtitle")}
        </>
      ) : (
        <>
          {t("kindraw.welcome.guestTitle")}
          <br />
          {t("kindraw.welcome.guestSubtitle")}
        </>
      );

    return (
      <WelcomeScreen>
        <WelcomeScreen.Hints.MenuHint>
          {t("kindraw.welcome.menuHint")}
        </WelcomeScreen.Hints.MenuHint>
        <WelcomeScreen.Hints.ToolbarHint>
          {t("kindraw.welcome.toolbarHint")}
        </WelcomeScreen.Hints.ToolbarHint>
        <WelcomeScreen.Hints.HelpHint>
          {t("kindraw.welcome.helpHint")}
        </WelcomeScreen.Hints.HelpHint>
        <WelcomeScreen.Center>
          <WelcomeScreen.Center.Logo />
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
                {t("kindraw.actions.signInWithGitHub")}
              </WelcomeScreen.Center.MenuItem>
            ) : null}

            {isCollabEnabled ? (
              <WelcomeScreen.Center.MenuItem
                icon={usersIcon}
                onSelect={onCollabDialogOpen}
                shortcut={null}
              >
                {t("kindraw.actions.startRealtime")}
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
