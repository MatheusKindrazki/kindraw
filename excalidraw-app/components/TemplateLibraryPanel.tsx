import { useCallback, useEffect, useRef, useState } from "react";

import { useI18n } from "@excalidraw/excalidraw/i18n";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { listTemplates } from "../kindraw/templatesApi";
import { insertTemplate } from "../kindraw/insertTemplate";

import "./TemplateLibraryPanel.scss";

import type { KindrawTemplateMeta } from "../kindraw/templatesApi";

type Status = "loading" | "loaded" | "error";

type TemplateLibraryPanelProps = {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
};

export const TemplateLibraryPanel = ({
  excalidrawAPI,
}: TemplateLibraryPanelProps) => {
  const { t } = useI18n();
  const [templates, setTemplates] = useState<KindrawTemplateMeta[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [insertingId, setInsertingId] = useState<string | null>(null);

  const listAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    listAbortRef.current = controller;

    setStatus("loading");
    listTemplates({ signal: controller.signal })
      .then((results) => {
        if (controller.signal.aborted) {
          return;
        }
        setTemplates(results);
        setStatus("loaded");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        console.error("Kindraw template list failed", error);
        setTemplates([]);
        setStatus("error");
      });

    return () => {
      controller.abort();
    };
  }, []);

  const handleInsert = useCallback(
    async (templateId: string) => {
      if (!excalidrawAPI || insertingId) {
        return;
      }

      setInsertingId(templateId);
      try {
        await insertTemplate(excalidrawAPI, templateId);
      } catch (error: unknown) {
        console.error("Kindraw template insertion failed", error);
        excalidrawAPI.setToast({
          message: t("kindraw.templateLibrary.insertError"),
        });
      } finally {
        setInsertingId(null);
      }
    },
    [excalidrawAPI, insertingId, t],
  );

  return (
    <div className="kindraw-template-library">
      <div className="kindraw-template-library__body">
        {status === "loading" && (
          <p className="kindraw-template-library__hint">
            {t("kindraw.templateLibrary.loading")}
          </p>
        )}

        {status === "error" && (
          <p className="kindraw-template-library__hint kindraw-template-library__hint--error">
            {t("kindraw.templateLibrary.error")}
          </p>
        )}

        {status === "loaded" && templates.length === 0 && (
          <p className="kindraw-template-library__hint">
            {t("kindraw.templateLibrary.empty")}
          </p>
        )}

        {templates.length > 0 && (
          <ul className="kindraw-template-library__list">
            {templates.map((template) => (
              <li key={template.id}>
                <button
                  type="button"
                  className="kindraw-template-library__item"
                  title={t("kindraw.templateLibrary.insert")}
                  aria-label={template.title}
                  disabled={!excalidrawAPI || insertingId === template.id}
                  onClick={() => void handleInsert(template.id)}
                >
                  <span className="kindraw-template-library__item-head">
                    <strong className="kindraw-template-library__item-title">
                      {template.title}
                    </strong>
                    {template.category ? (
                      <span className="kindraw-template-library__item-chip">
                        {template.category}
                      </span>
                    ) : null}
                  </span>
                  {template.description ? (
                    <span className="kindraw-template-library__item-description">
                      {template.description}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
