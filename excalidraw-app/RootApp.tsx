import { useSyncExternalStore } from "react";

import ExcalidrawApp from "./App";
import { useKindrawLangBootstrap } from "./kindraw/i18n";
import { InvitePage } from "./kindraw/InvitePage";
import { KindrawApp } from "./kindraw/KindrawApp";
import {
  KindrawDocScreen,
  KindrawHybridScreen,
  KindrawPublicSharePage,
} from "./kindraw/KindrawStandalone";
import {
  getLocationPathname,
  matchKindrawRoute,
  subscribeToLocation,
} from "./kindraw/router";

const RootApp = () => {
  const pathname = useSyncExternalStore(
    subscribeToLocation,
    getLocationPathname,
    getLocationPathname,
  );
  const route = matchKindrawRoute(pathname);

  // Carrega os dados de tradução do idioma preferido (detectado do navegador
  // ou escolhido pelo usuário) para todas as telas do shell Kindraw, que
  // renderizam fora do `<Excalidraw>` e não passam pelo `<InitializeApp>`.
  // O `<ExcalidrawApp>` (rota default) faz isso por conta própria.
  useKindrawLangBootstrap();

  if (route.kind === "workspace") {
    return <KindrawApp />;
  }

  if (route.kind === "doc") {
    return <KindrawDocScreen itemId={route.itemId} />;
  }

  if (route.kind === "hybrid") {
    return (
      <KindrawHybridScreen
        hybridId={route.hybridId}
        sectionId={route.sectionId}
        view={route.view}
      />
    );
  }

  if (route.kind === "share") {
    return (
      <KindrawPublicSharePage token={route.token} view={route.view || "both"} />
    );
  }

  if (route.kind === "invite") {
    return <InvitePage token={route.token} />;
  }

  return <ExcalidrawApp />;
};

export default RootApp;
