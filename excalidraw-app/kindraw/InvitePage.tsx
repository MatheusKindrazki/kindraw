import { useCallback, useEffect, useState, startTransition } from "react";

import Trans from "@excalidraw/excalidraw/components/Trans";

import type { TranslationKeys } from "@excalidraw/excalidraw/i18n";

import {
  acceptInvite,
  getInvite,
  getSession,
  openGithubLogin,
  openGoogleLogin,
} from "./api";
import { GoogleGlyph, KindrawIcon } from "./icons";
import { useKindrawI18n } from "./i18n";
import { createKindrawItemPageMeta, syncKindrawPageMeta } from "./pageMeta";
import { buildFolderPath, buildHybridPath, navigateKindraw } from "./router";
import { getErrorMessage } from "./utils";
import "./kindraw.scss";

import type {
  KindrawInviteMetadata,
  KindrawSession,
  KindrawShareRole,
} from "./types";

const ROLE_LABEL_KEY: Record<KindrawShareRole, TranslationKeys> = {
  viewer: "kindraw.invite.role.viewer",
  editor: "kindraw.invite.role.editor",
};

const RESOURCE_LABEL_KEY: Record<
  KindrawInviteMetadata["resourceType"],
  TranslationKeys
> = {
  folder: "kindraw.invite.resource.folder",
  hybrid: "kindraw.invite.resource.hybrid",
};

// Para onde redirecionar após o aceite, conforme o tipo de recurso.
const resourcePathFor = (
  resourceType: KindrawInviteMetadata["resourceType"],
  resourceId: string,
) =>
  resourceType === "folder"
    ? buildFolderPath(resourceId)
    : buildHybridPath(resourceId);

type InvitePageProps = {
  token: string;
};

export const InvitePage = ({ token }: InvitePageProps) => {
  const { t } = useKindrawI18n();
  const [session, setSession] = useState<KindrawSession | null | undefined>(
    undefined,
  );
  const [invite, setInvite] = useState<KindrawInviteMetadata | null>(null);
  // Erro de resolução do convite (inválido / expirado / recurso sumiu).
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  // Carrega sessão (não-bloqueante para o usuário deslogado) e metadados do
  // convite em paralelo.
  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      try {
        const nextSession = await getSession();
        if (!cancelled) {
          startTransition(() => setSession(nextSession));
        }
      } catch {
        if (!cancelled) {
          setSession(null);
        }
      }
    };

    const loadInvite = async () => {
      setLoadError(null);
      try {
        const response = await getInvite(token);
        if (!cancelled) {
          startTransition(() => setInvite(response.invite));
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            getErrorMessage(error, t("kindraw.invite.invalidOrExpired")),
          );
        }
      }
    };

    void loadSession();
    void loadInvite();

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    syncKindrawPageMeta(
      createKindrawItemPageMeta({
        title: invite?.resourceName,
        kind: "doc",
        surface: "share",
        url: window.location.href,
      }) || {
        url: window.location.href,
      },
    );
  }, [invite?.resourceName]);

  const handleAccept = useCallback(async () => {
    setAccepting(true);
    setAcceptError(null);
    try {
      const result = await acceptInvite(token);
      setAccepted(true);
      navigateKindraw(
        resourcePathFor(result.resourceType, result.resourceId),
        { replace: true },
      );
    } catch (error) {
      setAcceptError(
        getErrorMessage(error, t("kindraw.invite.acceptFailed")),
      );
      setAccepting(false);
    }
  }, [token]);

  // ── Carregando (esperando sessão + metadados) ──────────────────────────────
  if (typeof session === "undefined" || (!invite && !loadError)) {
    return (
      <div className="kindraw-loading-shell">
        <p>{t("kindraw.invite.loading")}</p>
      </div>
    );
  }

  // ── Convite inválido / expirado / recurso sumiu ────────────────────────────
  if (loadError || !invite) {
    return (
      <div className="kindraw-login-shell">
        <div className="kindraw-login-card">
          <span className="kindraw-logomark kindraw-logomark--lg">
            <KindrawIcon name="pen" size={22} strokeWidth={2.1} />
          </span>
          <span className="kindraw-eyebrow">
            {t("kindraw.invite.brandEyebrow")}
          </span>
          <h1>{t("kindraw.invite.unavailableTitle")}</h1>
          <p>{loadError || t("kindraw.invite.invalidOrExpired")}</p>
          <a className="kindraw-link-button" href="/">
            {t("kindraw.invite.goToKindraw")}
          </a>
        </div>
      </div>
    );
  }

  const resourceLabel = t(RESOURCE_LABEL_KEY[invite.resourceType]);
  const roleLabel = t(ROLE_LABEL_KEY[invite.role]);

  // ── Convite já utilizado (uso único) ───────────────────────────────────────
  if (invite.accepted) {
    return (
      <div className="kindraw-login-shell">
        <div className="kindraw-login-card">
          <span className="kindraw-logomark kindraw-logomark--lg">
            <KindrawIcon name="pen" size={22} strokeWidth={2.1} />
          </span>
          <span className="kindraw-eyebrow">
            {t("kindraw.invite.brandEyebrow")}
          </span>
          <h1>{t("kindraw.invite.alreadyUsedTitle")}</h1>
          <p>
            <Trans
              i18nKey="kindraw.invite.alreadyUsedBody"
              resource={resourceLabel}
              name={invite.resourceName}
              strong={(el) => <strong>{el}</strong>}
            />
          </p>
          <a className="kindraw-link-button" href="/">
            {t("kindraw.invite.goToKindraw")}
          </a>
        </div>
      </div>
    );
  }

  // ── Sucesso (aceito agora, antes do redirect concluir) ─────────────────────
  if (accepted) {
    return (
      <div className="kindraw-loading-shell">
        <p>{t("kindraw.invite.opening", { resource: resourceLabel })}</p>
      </div>
    );
  }

  // ── Convite válido ─────────────────────────────────────────────────────────
  return (
    <div className="kindraw-login-shell">
      <div className="kindraw-login-card">
        <span className="kindraw-logomark kindraw-logomark--lg">
          <KindrawIcon name="pen" size={22} strokeWidth={2.1} />
        </span>
        <span className="kindraw-eyebrow">{t("kindraw.invite.eyebrow")}</span>
        <h1>
          {t("kindraw.invite.title", { name: invite.invitedByName })}
        </h1>
        <p>
          <Trans
            i18nKey="kindraw.invite.validBody"
            resource={resourceLabel}
            name={invite.resourceName}
            role={roleLabel}
            strong={(el) => <strong>{el}</strong>}
          />
        </p>

        {session ? (
          <>
            <button
              className="kindraw-btn kindraw-btn--primary kindraw-btn--github"
              disabled={accepting}
              onClick={() => void handleAccept()}
              type="button"
            >
              {accepting
                ? t("kindraw.invite.accepting")
                : t("kindraw.invite.accept")}
            </button>
            <small>
              <Trans
                i18nKey="kindraw.invite.acceptingAs"
                name={session.user.name}
                strong={(el) => <strong>{el}</strong>}
              />
            </small>
          </>
        ) : (
          <>
            <p className="kindraw-login-card__hint">
              {t("kindraw.invite.signInToAccept")}
            </p>
            <div className="kindraw-login-providers">
              <button
                className="kindraw-btn kindraw-btn--primary kindraw-provider-btn"
                onClick={openGithubLogin}
                type="button"
              >
                <span className="kindraw-provider-glyph kindraw-provider-glyph--github">
                  <KindrawIcon name="github" size={18} />
                </span>
                {t("kindraw.commandPalette.github")}
              </button>
              <button
                className="kindraw-btn kindraw-btn--primary kindraw-provider-btn"
                onClick={openGoogleLogin}
                type="button"
              >
                <span className="kindraw-provider-glyph kindraw-provider-glyph--google">
                  <GoogleGlyph size={16} />
                </span>
                {t("kindraw.invite.providerGoogle")}
              </button>
            </div>
            <small>{t("kindraw.invite.returnAfterLogin")}</small>
          </>
        )}

        {acceptError ? (
          <p className="kindraw-error-copy">{acceptError}</p>
        ) : null}
      </div>
    </div>
  );
};
