import { trackEvent } from "@excalidraw/excalidraw/analytics";
import { copyTextToSystemClipboard } from "@excalidraw/excalidraw/clipboard";
import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import { FilledButton } from "@excalidraw/excalidraw/components/FilledButton";
import { TextField } from "@excalidraw/excalidraw/components/TextField";
import {
  copyIcon,
  LinkIcon,
  playerPlayIcon,
  playerStopFilledIcon,
} from "@excalidraw/excalidraw/components/icons";
import { useUIAppState } from "@excalidraw/excalidraw/context/ui-appState";
import { useCopyStatus } from "@excalidraw/excalidraw/hooks/useCopiedIndicator";
import { useI18n } from "@excalidraw/excalidraw/i18n";
import { KEYS, getFrame } from "@excalidraw/common";
import { useEffect, useRef, useState } from "react";

import { atom, useAtom, useAtomValue } from "../app-jotai";
import { activeRoomLinkAtom } from "../collab/Collab";
import { buildPublicShareUrl } from "../kindraw/api";

import "./ShareDialog.scss";
import { QRCode } from "./QRCode";

import type { CollabAPI } from "../collab/Collab";
import type { KindrawItem } from "../kindraw/types";

type ShareDialogType = "publicLink" | "collaborationOnly";

export const shareDialogStateAtom = atom<
  { isOpen: false } | { isOpen: true; type: ShareDialogType }
>({ isOpen: false });

export type ShareDialogProps = {
  collabAPI: CollabAPI | null;
  handleClose: () => void;
  publicShare: {
    busy?: boolean;
    currentItem: KindrawItem | null;
    onCreateShareLink: () => Promise<void> | void;
    onRevokeShareLink: (shareLinkId: string) => Promise<void> | void;
  };
  type: ShareDialogType;
};

const ActiveRoomDialog = ({
  collabAPI,
  activeRoomLink,
  handleClose,
}: {
  collabAPI: CollabAPI;
  activeRoomLink: string;
  handleClose: () => void;
}) => {
  const { t } = useI18n();
  const [, setJustCopied] = useState(false);
  const timerRef = useRef<number>(0);
  const ref = useRef<HTMLInputElement>(null);
  const { onCopy, copyStatus } = useCopyStatus();

  const copyRoomLink = async () => {
    try {
      await copyTextToSystemClipboard(activeRoomLink);
    } catch (e) {
      collabAPI.setCollabError(t("errors.copyToSystemClipboardFailed"));
    }

    setJustCopied(true);

    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }

    timerRef.current = window.setTimeout(() => {
      setJustCopied(false);
    }, 3000);

    ref.current?.select();
  };

  return (
    <>
      <h3 className="ShareDialog__active__header">
        {t("labels.liveCollaboration").replace(/\./g, "")}
      </h3>
      <TextField
        defaultValue={collabAPI.getUsername()}
        placeholder="Your name"
        label="Your name"
        onChange={collabAPI.setUsername}
        onKeyDown={(event) => event.key === KEYS.ENTER && handleClose()}
      />
      <div className="ShareDialog__active__linkRow">
        <TextField
          ref={ref}
          label="Link"
          readonly
          fullWidth
          value={activeRoomLink}
        />
        <FilledButton
          size="large"
          label={t("buttons.copyLink")}
          icon={copyIcon}
          status={copyStatus}
          onClick={() => {
            copyRoomLink();
            onCopy();
          }}
        />
      </div>
      <QRCode value={activeRoomLink} />
      <div className="ShareDialog__active__description">
        <p>
          <span
            role="img"
            aria-hidden="true"
            className="ShareDialog__active__description__emoji"
          >
            🔒{" "}
          </span>
          {t("roomDialog.desc_privacy")}
        </p>
        <p>{t("roomDialog.desc_exitSession")}</p>
      </div>

      <div className="ShareDialog__active__actions">
        <FilledButton
          size="large"
          variant="outlined"
          color="danger"
          label={t("roomDialog.button_stopSession")}
          icon={playerStopFilledIcon}
          onClick={() => {
            trackEvent("share", "room closed");
            collabAPI.stopCollaboration();
            if (!collabAPI.isCollaborating()) {
              handleClose();
            }
          }}
        />
      </div>
    </>
  );
};

const PublicLinkDialog = ({
  currentItem,
  busy,
  onCreateShareLink,
  onRevokeShareLink,
}: ShareDialogProps["publicShare"]) => {
  const { onCopy, copyStatus } = useCopyStatus();
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  const copyPublicLink = async (token: string, shareLinkId: string) => {
    await copyTextToSystemClipboard(buildPublicShareUrl(token));
    setCopiedLinkId(shareLinkId);
    onCopy();
  };

  if (!currentItem) {
    return (
      <>
        <div className="ShareDialog__picker__header">Link publico</div>
        <div className="ShareDialog__picker__description">
          Abra um drawing salvo do Kindraw para compartilhar pela nossa API.
        </div>
      </>
    );
  }

  return (
    <>
      <div className="ShareDialog__picker__header">Link publico</div>
      <div className="ShareDialog__picker__description">
        Compartilhe <strong>{currentItem.title}</strong> com um link read-only
        gerado pela API do Kindraw.
      </div>

      {!currentItem.shareLinks[0] ? (
        <div className="ShareDialog__picker__button">
          <FilledButton
            size="large"
            label="Gerar link publico"
            icon={LinkIcon}
            onClick={() => onCreateShareLink()}
            disabled={busy}
          />
        </div>
      ) : null}

      {currentItem.shareLinks[0] ? (
        <div className="ShareDialog__public">
          {(() => {
            const shareLink = currentItem.shareLinks[0]!;
            const publicUrl = buildPublicShareUrl(shareLink.token);
            return (
              <div className="ShareDialog__public__row" key={shareLink.id}>
                <TextField readonly fullWidth label="Link" value={publicUrl} />
                <div className="ShareDialog__public__actions">
                  <FilledButton
                    size="large"
                    label="Copiar"
                    icon={copyIcon}
                    status={
                      copiedLinkId === shareLink.id ? copyStatus : undefined
                    }
                    onClick={() =>
                      void copyPublicLink(shareLink.token, shareLink.id)
                    }
                  />
                  <FilledButton
                    size="large"
                    variant="outlined"
                    color="danger"
                    label="Revogar"
                    onClick={() => onRevokeShareLink(shareLink.id)}
                    disabled={busy}
                  />
                </div>
              </div>
            );
          })()}
        </div>
      ) : (
        <div className="ShareDialog__picker__description">
          Nenhum link ativo ainda.
        </div>
      )}
    </>
  );
};

const ShareDialogPicker = (props: ShareDialogProps) => {
  const { t } = useI18n();

  const { collabAPI } = props;

  const startCollabJSX = collabAPI ? (
    <>
      <div className="ShareDialog__picker__header">
        {t("labels.liveCollaboration").replace(/\./g, "")}
      </div>

      <div className="ShareDialog__picker__description">
        <div style={{ marginBottom: "1em" }}>{t("roomDialog.desc_intro")}</div>
        {t("roomDialog.desc_privacy")}
      </div>

      <div className="ShareDialog__picker__button">
        <FilledButton
          size="large"
          label={t("roomDialog.button_startSession")}
          icon={playerPlayIcon}
          onClick={() => {
            trackEvent("share", "room creation", `ui (${getFrame()})`);
            collabAPI.startCollaboration(null);
          }}
        />
      </div>
    </>
  ) : null;

  return <>{startCollabJSX}</>;
};

const ShareDialogInner = (props: ShareDialogProps) => {
  const activeRoomLink = useAtomValue(activeRoomLinkAtom);

  return (
    <Dialog size="small" onCloseRequest={props.handleClose} title={false}>
      <div className="ShareDialog">
        {props.type === "publicLink" ? (
          <PublicLinkDialog {...props.publicShare} />
        ) : props.collabAPI && activeRoomLink ? (
          <ActiveRoomDialog
            collabAPI={props.collabAPI}
            activeRoomLink={activeRoomLink}
            handleClose={props.handleClose}
          />
        ) : (
          <ShareDialogPicker {...props} />
        )}
      </div>
    </Dialog>
  );
};

export const ShareDialog = (props: {
  collabAPI: CollabAPI | null;
  publicShare: ShareDialogProps["publicShare"];
}) => {
  const [shareDialogState, setShareDialogState] = useAtom(shareDialogStateAtom);

  const { openDialog } = useUIAppState();

  useEffect(() => {
    if (openDialog) {
      setShareDialogState({ isOpen: false });
    }
  }, [openDialog, setShareDialogState]);

  if (!shareDialogState.isOpen) {
    return null;
  }

  return (
    <ShareDialogInner
      handleClose={() => setShareDialogState({ isOpen: false })}
      collabAPI={props.collabAPI}
      publicShare={props.publicShare}
      type={shareDialogState.type}
    />
  );
};
