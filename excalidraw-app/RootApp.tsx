import { useSyncExternalStore } from "react";

import ExcalidrawApp from "./App";
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

  return <ExcalidrawApp />;
};

export default RootApp;
