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

// Typewriter placeholder timings (calm, unhurried).
const TYPE_CHAR_MS = 80;
const ERASE_CHAR_MS = 45;
const HOLD_FULL_MS = 1500;
const HOLD_EMPTY_MS = 450;

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
  const [isFocused, setIsFocused] = useState(false);
  const [typedHint, setTypedHint] = useState("");

  const searchAbortRef = useRef<AbortController | null>(null);

  const basePlaceholder = t("kindraw.iconLibrary.searchPlaceholder");
  const examples = t("kindraw.iconLibrary.searchExamples")
    .split(",")
    .map((word) => word.trim())
    .filter(Boolean);

  // Animate the placeholder with a typewriter cycle so users discover that the
  // field is searchable. Pauses whenever the user is engaged (focused or typing)
  // and is fully disabled under prefers-reduced-motion.
  const hasQueryText = query.trim().length > 0;
  const animateHint = !isFocused && !hasQueryText && examples.length > 0;

  useEffect(() => {
    if (!animateHint || prefersReducedMotion()) {
      setTypedHint("");
      return;
    }

    let wordIndex = 0;
    let charCount = 0;
    let phase: "typing" | "holding" | "erasing" = "typing";
    let timeoutId = 0;

    const tick = () => {
      const word = examples[wordIndex % examples.length];

      if (phase === "typing") {
        charCount += 1;
        setTypedHint(word.slice(0, charCount));
        if (charCount >= word.length) {
          phase = "holding";
          timeoutId = window.setTimeout(tick, HOLD_FULL_MS);
          return;
        }
        timeoutId = window.setTimeout(tick, TYPE_CHAR_MS);
        return;
      }

      if (phase === "holding") {
        phase = "erasing";
        timeoutId = window.setTimeout(tick, ERASE_CHAR_MS);
        return;
      }

      // erasing
      charCount -= 1;
      setTypedHint(word.slice(0, Math.max(charCount, 0)));
      if (charCount <= 0) {
        phase = "typing";
        wordIndex += 1;
        timeoutId = window.setTimeout(tick, HOLD_EMPTY_MS);
        return;
      }
      timeoutId = window.setTimeout(tick, ERASE_CHAR_MS);
    };

    timeoutId = window.setTimeout(tick, TYPE_CHAR_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
    // examples is derived from a stable i18n string; re-run only when animation
    // toggles or the example set changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animateHint, examples.join("|")]);

  const placeholder =
    animateHint && typedHint ? `${typedHint}…` : basePlaceholder;

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
          placeholder={placeholder}
          value={query}
          onChange={(value) => setQuery(value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
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
