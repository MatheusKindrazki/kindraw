import { exportToSvg } from "@excalidraw/excalidraw";

import { getHybridItem, getItem } from "./api";
import { parseDrawingContent } from "./content";
import {
  pruneThumbnails,
  readCachedThumbnail,
  writeCachedThumbnail,
} from "./thumbnailStore";

import { isKindrawHybridItem } from "./types";

import type { KindrawTreeItem } from "./types";

// Preview de canvas renderizado no client (sem backend): busca o conteúdo do
// drawing, gera um SVG via exportToSvg e devolve um data-URI. Cacheado por
// item.id + updatedAt, então o preview invalida sozinho quando o canvas muda.
// Duas camadas: memória (L1, por sessão) + IndexedDB (L2, persiste entre
// visitas), pra próxima renderização ser instantânea.

export type KindrawThumbnail =
  | { status: "ready"; dataUri: string }
  | { status: "empty" }
  | { status: "error" };

const cache = new Map<string, KindrawThumbnail>();
const inflight = new Map<string, Promise<KindrawThumbnail>>();

const cacheKey = (item: KindrawTreeItem) => `${item.id}:${item.updatedAt}`;

// Só drawings e híbridos têm canvas; docs não (o card mostra o ícone do tipo).
const supportsThumbnail = (item: KindrawTreeItem) =>
  isKindrawHybridItem(item) || item.kind === "drawing";

// Remove do IndexedDB thumbnails de versões antigas/itens removidos, mantendo
// só as chaves dos itens vivos que suportam preview.
export const pruneKindrawThumbnails = (items: KindrawTreeItem[]) => {
  const valid = new Set<string>();
  for (const item of items) {
    if (supportsThumbnail(item)) {
      valid.add(cacheKey(item));
    }
  }
  void pruneThumbnails(valid);
};

const svgToDataUri = (svg: SVGSVGElement) => {
  const serialized = new XMLSerializer().serializeToString(svg);
  // encodeURIComponent + unescape evita problemas com caracteres unicode no
  // btoa; usamos o formato utf8 inline para não depender de base64 de bytes.
  return `data:image/svg+xml;utf8,${encodeURIComponent(serialized)}`;
};

const renderDrawingThumbnail = async (
  content: string,
): Promise<KindrawThumbnail> => {
  const { elements, files } = parseDrawingContent(content);

  if (!elements || elements.length === 0) {
    return { status: "empty" };
  }

  const svg = await exportToSvg({
    elements,
    appState: {
      exportBackground: true,
      viewBackgroundColor: "#ffffff",
      exportWithDarkMode: false,
    },
    files: files ?? {},
    exportPadding: 12,
    skipInliningFonts: true,
  });

  // remove dimensões fixas pra escalar dentro do thumb (object-fit cuida do resto)
  svg.removeAttribute("width");
  svg.removeAttribute("height");

  return { status: "ready", dataUri: svgToDataUri(svg) };
};

export const getKindrawThumbnail = async (
  item: KindrawTreeItem,
): Promise<KindrawThumbnail | null> => {
  if (!supportsThumbnail(item)) {
    return null;
  }

  const key = cacheKey(item);

  // L1: memória (mais rápido)
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }

  const existing = inflight.get(key);
  if (existing) {
    return existing;
  }

  const task = (async (): Promise<KindrawThumbnail> => {
    try {
      // L2: IndexedDB (persiste entre visitas) — evita re-renderizar
      const persisted = await readCachedThumbnail(key);
      if (persisted) {
        cache.set(key, persisted);
        return persisted;
      }

      const content = isKindrawHybridItem(item)
        ? (await getHybridItem(item.id)).drawing.content
        : (await getItem(item.id)).content;
      const thumbnail = await renderDrawingThumbnail(content);
      cache.set(key, thumbnail);
      // grava no IDB em background; não bloqueia o retorno
      void writeCachedThumbnail(key, item.id, thumbnail);
      return thumbnail;
    } catch (error) {
      // 404/erro de rede/parse: não trava o card em "loading" — cai no
      // fallback de ícone. Não cacheia, para tentar de novo numa próxima visita.
      console.warn("Falha ao gerar preview do Kindraw:", error);
      return { status: "error" };
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, task);
  return task;
};
