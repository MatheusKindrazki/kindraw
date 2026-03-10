import { createStore, del, get, set } from "idb-keyval";

import type { KindrawDraft } from "./types";

const draftStore = createStore("kindraw-drafts-db", "kindraw-drafts-store");

const getDraftKey = (itemId: string) => `item-draft:${itemId}`;

export const getKindrawDraft = async (itemId: string) =>
  (await get<KindrawDraft>(getDraftKey(itemId), draftStore)) || null;

export const setKindrawDraft = async (itemId: string, draft: KindrawDraft) =>
  set(getDraftKey(itemId), draft, draftStore);

export const clearKindrawDraft = async (itemId: string) =>
  del(getDraftKey(itemId), draftStore);
