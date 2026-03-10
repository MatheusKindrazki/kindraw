import type { KindrawFolder, KindrawItem } from "./types";

import type { KindrawRoute } from "./router";

export const getFolderChildren = (
  folders: KindrawFolder[],
  parentId: string | null,
) => folders.filter((folder) => folder.parentId === parentId);

export const getFolderTrail = (
  folders: KindrawFolder[],
  folderId: string | null,
): KindrawFolder[] => {
  if (!folderId) {
    return [];
  }

  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const trail: KindrawFolder[] = [];
  let current = byId.get(folderId) || null;

  while (current) {
    trail.unshift(current);
    current = current.parentId ? byId.get(current.parentId) || null : null;
  }

  return trail;
};

export const resolveRouteFolderId = (
  route: KindrawRoute,
  currentItem: KindrawItem | null,
) => {
  if (route.kind === "workspace") {
    return route.folderId;
  }

  if (route.kind === "drawing" || route.kind === "doc") {
    return currentItem?.folderId || null;
  }

  return null;
};
