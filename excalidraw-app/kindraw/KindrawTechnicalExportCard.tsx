import { useMemo, useState } from "react";

import { Card } from "@excalidraw/excalidraw/components/Card";
import { useExcalidrawSetAppState } from "@excalidraw/excalidraw/components/App";
import {
  LinkIcon,
  clipboard,
  exportToFileIcon,
} from "@excalidraw/excalidraw/components/icons";
import { useI18n } from "@excalidraw/excalidraw/i18n";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import {
  buildDrawIoMermaidUrl,
  copyText,
  downloadTextFile,
  exportSceneToMermaid,
  getMermaidExportSize,
  getTechnicalExportBaseName,
} from "./technicalExport";

type KindrawTechnicalExportCardProps = {
  elements: readonly NonDeletedExcalidrawElement[];
  title?: string | null;
};

export const KindrawTechnicalExportCard = ({
  elements,
  title,
}: KindrawTechnicalExportCardProps) => {
  const { t } = useI18n();
  const setAppState = useExcalidrawSetAppState();
  const [isCopying, setIsCopying] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const mermaid = useMemo(() => exportSceneToMermaid(elements), [elements]);
  const drawIoUrl = mermaid ? buildDrawIoMermaidUrl(mermaid, title) : null;

  const handleCopy = async () => {
    if (!mermaid) {
      return;
    }

    setIsCopying(true);
    try {
      await copyText(mermaid);
      setAppState({
        toast: {
          message: t("kindraw.technicalExport.copied"),
        },
      });
    } catch (error) {
      setAppState({
        errorMessage:
          error instanceof Error
            ? error.message
            : t("kindraw.technicalExport.copyFailed"),
      });
    } finally {
      setIsCopying(false);
    }
  };

  const handleDownload = async () => {
    if (!mermaid) {
      return;
    }

    setIsDownloading(true);
    try {
      downloadTextFile(mermaid, `${getTechnicalExportBaseName(title)}.mmd`);
    } catch (error) {
      setAppState({
        errorMessage:
          error instanceof Error
            ? error.message
            : t("kindraw.technicalExport.downloadFailed"),
      });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Card color="pink">
      <div className="Card-icon">{LinkIcon}</div>
      <h2>{t("kindraw.technicalExport.title")}</h2>
      <div className="Card-details kindraw-technical-export__details">
        <p>{t("kindraw.technicalExport.description")}</p>
        <p className="kindraw-technical-export__hint">
          {mermaid
            ? t("kindraw.technicalExport.size", {
                size: getMermaidExportSize(mermaid),
              })
            : t("kindraw.technicalExport.empty")}
        </p>
        <p className="kindraw-technical-export__hint">
          {t("kindraw.technicalExport.hint")}
        </p>
      </div>
      <div className="kindraw-technical-export__actions">
        <button
          className="Card-button kindraw-technical-export__action"
          data-testid="kindraw-technical-export-copy"
          disabled={!mermaid || isCopying || isDownloading}
          onClick={() => void handleCopy()}
          type="button"
        >
          <span>{clipboard}</span>
          {isCopying
            ? t("kindraw.technicalExport.copying")
            : t("kindraw.technicalExport.copy")}
        </button>
        <button
          className="Card-button kindraw-technical-export__action"
          data-testid="kindraw-technical-export-download"
          disabled={!mermaid || isCopying || isDownloading}
          onClick={() => void handleDownload()}
          type="button"
        >
          <span>{exportToFileIcon}</span>
          {isDownloading
            ? t("kindraw.technicalExport.downloading")
            : t("kindraw.technicalExport.download")}
        </button>
        <button
          className="Card-button kindraw-technical-export__action"
          data-testid="kindraw-technical-export-drawio"
          disabled={!drawIoUrl}
          onClick={() => {
            if (!drawIoUrl) {
              return;
            }
            window.open(drawIoUrl, "_blank", "noopener,noreferrer");
          }}
          type="button"
        >
          <span>{LinkIcon}</span>
          {t("kindraw.technicalExport.drawIo")}
        </button>
      </div>
    </Card>
  );
};
