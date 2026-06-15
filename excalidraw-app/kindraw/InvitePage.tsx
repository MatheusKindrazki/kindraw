import { useCallback, useEffect, useState, startTransition } from "react";

import {
  acceptInvite,
  getInvite,
  getSession,
  openGithubLogin,
  openGoogleLogin,
} from "./api";
import { GoogleGlyph, KindrawIcon } from "./icons";
import { createKindrawItemPageMeta, syncKindrawPageMeta } from "./pageMeta";
import { buildFolderPath, buildHybridPath, navigateKindraw } from "./router";
import { getErrorMessage } from "./utils";
import "./kindraw.scss";

import type {
  KindrawInviteMetadata,
  KindrawSession,
  KindrawShareRole,
} from "./types";

const ROLE_LABEL: Record<KindrawShareRole, string> = {
  viewer: "visualizador",
  editor: "editor",
};

const RESOURCE_LABEL: Record<KindrawInviteMetadata["resourceType"], string> = {
  folder: "a pasta",
  hybrid: "o documento",
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
            getErrorMessage(error, "Este convite não é válido ou expirou."),
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
        getErrorMessage(error, "Não foi possível aceitar o convite."),
      );
      setAccepting(false);
    }
  }, [token]);

  // ── Carregando (esperando sessão + metadados) ──────────────────────────────
  if (typeof session === "undefined" || (!invite && !loadError)) {
    return (
      <div className="kindraw-loading-shell">
        <p>Carregando convite…</p>
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
          <span className="kindraw-eyebrow">Kindraw</span>
          <h1>Convite indisponível</h1>
          <p>{loadError || "Este convite não é válido ou expirou."}</p>
          <a className="kindraw-link-button" href="/">
            Ir para o Kindraw
          </a>
        </div>
      </div>
    );
  }

  const resourceLabel = RESOURCE_LABEL[invite.resourceType];
  const roleLabel = ROLE_LABEL[invite.role];

  // ── Convite já utilizado (uso único) ───────────────────────────────────────
  if (invite.accepted) {
    return (
      <div className="kindraw-login-shell">
        <div className="kindraw-login-card">
          <span className="kindraw-logomark kindraw-logomark--lg">
            <KindrawIcon name="pen" size={22} strokeWidth={2.1} />
          </span>
          <span className="kindraw-eyebrow">Kindraw</span>
          <h1>Convite já utilizado</h1>
          <p>
            Este convite para {resourceLabel}{" "}
            <strong>{invite.resourceName}</strong> já foi aceito. Peça um novo
            link a quem te convidou.
          </p>
          <a className="kindraw-link-button" href="/">
            Ir para o Kindraw
          </a>
        </div>
      </div>
    );
  }

  // ── Sucesso (aceito agora, antes do redirect concluir) ─────────────────────
  if (accepted) {
    return (
      <div className="kindraw-loading-shell">
        <p>Acesso liberado! Abrindo {resourceLabel}…</p>
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
        <span className="kindraw-eyebrow">Convite Kindraw</span>
        <h1>
          {invite.invitedByName} convidou você para colaborar
        </h1>
        <p>
          Você foi convidado para {resourceLabel}{" "}
          <strong>{invite.resourceName}</strong> como{" "}
          <strong>{roleLabel}</strong>.
        </p>

        {session ? (
          <>
            <button
              className="kindraw-btn kindraw-btn--primary kindraw-btn--github"
              disabled={accepting}
              onClick={() => void handleAccept()}
              type="button"
            >
              {accepting ? "Aceitando…" : "Aceitar convite"}
            </button>
            <small>
              Aceitando como <strong>{session.user.name}</strong>.
            </small>
          </>
        ) : (
          <>
            <p className="kindraw-login-card__hint">
              Entre para aceitar o convite.
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
                GitHub
              </button>
              <button
                className="kindraw-btn kindraw-btn--primary kindraw-provider-btn"
                onClick={openGoogleLogin}
                type="button"
              >
                <span className="kindraw-provider-glyph kindraw-provider-glyph--google">
                  <GoogleGlyph size={16} />
                </span>
                Google
              </button>
            </div>
            <small>
              Voltamos a esta página após o login para você concluir o aceite.
            </small>
          </>
        )}

        {acceptError ? (
          <p className="kindraw-error-copy">{acceptError}</p>
        ) : null}
      </div>
    </div>
  );
};
