// Cache persistente de thumbnails no navegador (IndexedDB), para que os
// previews da biblioteca não precisem ser re-renderizados a cada visita.
// IndexedDB (não localStorage) porque os data-URIs de SVG podem ser grandes e
// o IDB é assíncrono + tem capacidade muito maior. Falhas degradam silenciosa-
// mente: se o IDB não estiver disponível, o cache em memória ainda funciona.

import type { KindrawThumbnail } from "./thumbnails";

const DB_NAME = "kindraw-thumbnails";
const STORE = "thumbnails";
const DB_VERSION = 1;

type StoredThumbnail = {
  // chave = `${itemId}:${updatedAt}` (invalida sozinho quando o item muda)
  key: string;
  itemId: string;
  thumbnail: KindrawThumbnail;
  cachedAt: number;
};

let dbPromise: Promise<IDBDatabase | null> | null = null;

const openDb = (): Promise<IDBDatabase | null> => {
  if (dbPromise) {
    return dbPromise;
  }
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "key" });
          store.createIndex("itemId", "itemId", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
};

const withStore = async <T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> => {
  const db = await openDb();
  if (!db) {
    return null;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const request = fn(tx.objectStore(STORE));
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
};

export const readCachedThumbnail = async (
  key: string,
): Promise<KindrawThumbnail | null> => {
  const row = await withStore<StoredThumbnail>("readonly", (store) =>
    store.get(key) as IDBRequest<StoredThumbnail>,
  );
  return row?.thumbnail ?? null;
};

export const writeCachedThumbnail = async (
  key: string,
  itemId: string,
  thumbnail: KindrawThumbnail,
): Promise<void> => {
  const row: StoredThumbnail = {
    key,
    itemId,
    thumbnail,
    cachedAt: Date.now(),
  };
  await withStore("readwrite", (store) => store.put(row));
};

// Remove entradas obsoletas: para cada item, mantém só a chave da updatedAt
// atual; descarta versões antigas (geradas antes de uma edição) e thumbnails de
// itens que não existem mais. `validKeys` é o conjunto de `${id}:${updatedAt}`
// dos itens vivos.
export const pruneThumbnails = async (
  validKeys: ReadonlySet<string>,
): Promise<void> => {
  const db = await openDb();
  if (!db) {
    return;
  }
  try {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const cursorRequest = store.openCursor();
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        return;
      }
      const row = cursor.value as StoredThumbnail;
      if (!validKeys.has(row.key)) {
        cursor.delete();
      }
      cursor.continue();
    };
  } catch {
    // ignora — limpeza é best-effort
  }
};
