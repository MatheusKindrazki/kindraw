import { useCallback, useEffect, useRef, useState } from "react";

import { TextField } from "@excalidraw/excalidraw/components/TextField";
import { useI18n } from "@excalidraw/excalidraw/i18n";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { searchIcons, iconSvgUrl } from "../kindraw/iconsApi";
import { insertIconAsImage } from "../kindraw/insertIcon";

import "./IconLibraryPanel.scss";

import type { KindrawIcon } from "../kindraw/iconsApi";

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_LIMIT = 48;

type Status = "idle" | "loading" | "loaded" | "error";

type IconLibraryPanelProps = {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
};

export const IconLibraryPanel = ({ excalidrawAPI }: IconLibraryPanelProps) => {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [icons, setIcons] = useState<KindrawIcon[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [insertingId, setInsertingId] = useState<string | null>(null);

  const searchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = query.trim();

    if (!trimmed) {
      searchAbortRef.current?.abort();
      setIcons([]);
      setStatus("idle");
      return;
    }

    const timeout = window.setTimeout(() => {
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;

      setStatus("loading");
      searchIcons(trimmed, { limit: SEARCH_LIMIT, signal: controller.signal })
        .then((results) => {
          if (controller.signal.aborted) {
            return;
          }
          setIcons(results);
          setStatus("loaded");
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) {
            return;
          }
          console.error("Kindraw icon search failed", error);
          setIcons([]);
          setStatus("error");
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [query]);

  useEffect(() => {
    return () => {
      searchAbortRef.current?.abort();
    };
  }, []);

  const handleInsert = useCallback(
    async (iconId: string) => {
      if (!excalidrawAPI || insertingId) {
        return;
      }

      setInsertingId(iconId);
      try {
        await insertIconAsImage(excalidrawAPI, iconId);
      } catch (error: unknown) {
        console.error("Kindraw icon insertion failed", error);
        excalidrawAPI.setToast({
          message: t("kindraw.iconLibrary.insertError"),
        });
      } finally {
        setInsertingId(null);
      }
    },
    [excalidrawAPI, insertingId, t],
  );

  const handleDragStart = useCallback(
    (event: React.DragEvent<HTMLButtonElement>, icon: KindrawIcon) => {
      // Allow dropping the SVG onto the canvas via the browser's native
      // image-url drop handling.
      const url = iconSvgUrl(icon.id);
      event.dataTransfer.setData("text/uri-list", url);
      event.dataTransfer.setData("text/plain", url);
      event.dataTransfer.effectAllowed = "copy";
    },
    [],
  );

  const hasQuery = query.trim().length > 0;

  return (
    <div className="kindraw-icon-library">
      <div className="kindraw-icon-library__header">
        <TextField
          type="search"
          className="kindraw-icon-library__search"
          placeholder={t("kindraw.iconLibrary.searchPlaceholder")}
          value={query}
          onChange={(value) => setQuery(value)}
        />
      </div>

      <div className="kindraw-icon-library__body">
        {status === "loading" && (
          <p className="kindraw-icon-library__hint">
            {t("kindraw.iconLibrary.loading")}
          </p>
        )}

        {status === "error" && (
          <p className="kindraw-icon-library__hint kindraw-icon-library__hint--error">
            {t("kindraw.iconLibrary.error")}
          </p>
        )}

        {status === "idle" && !hasQuery && (
          <p className="kindraw-icon-library__hint">
            {t("kindraw.iconLibrary.empty")}
          </p>
        )}

        {status === "loaded" && icons.length === 0 && (
          <p className="kindraw-icon-library__hint">
            {t("kindraw.iconLibrary.noResults")}
          </p>
        )}

        {icons.length > 0 && (
          <div className="kindraw-icon-library__grid">
            {icons.map((icon) => (
              <button
                key={icon.id}
                type="button"
                className="kindraw-icon-library__item"
                title={icon.name}
                aria-label={icon.name}
                disabled={!excalidrawAPI || insertingId === icon.id}
                draggable={Boolean(excalidrawAPI)}
                onDragStart={(event) => handleDragStart(event, icon)}
                onClick={() => void handleInsert(icon.id)}
              >
                <img
                  className="kindraw-icon-library__preview"
                  src={iconSvgUrl(icon.id)}
                  alt={icon.name}
                  loading="lazy"
                  draggable={false}
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
