import { useSyncExternalStore } from "react";

import ExcalidrawApp from "./App";
import {
  KindrawDocScreen,
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

  if (route.kind === "share") {
    return <KindrawPublicSharePage token={route.token} />;
  }

  return <ExcalidrawApp />;
};

export default RootApp;
