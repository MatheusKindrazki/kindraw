import { useCallback, useEffect, useRef, useState } from "react";

import {
  grantHybridShare,
  listHybridShares,
  revokeHybridShare,
  searchKindrawUsers,
  updateHybridShareRole,
} from "./api";
import { KindrawIcon } from "./icons";
import { getErrorMessage } from "./utils";

import type { ChangeEvent } from "react";

import type {
  KindrawHybridShare,
  KindrawShareRole,
  KindrawUser,
} from "./types";

const SEARCH_DEBOUNCE_MS = 250;

const ROLE_LABEL: Record<KindrawShareRole, string> = {
  viewer: "Visualizador",
  editor: "Editor",
};

const KindrawPersonAvatar = ({ user }: { user: KindrawUser }) =>
  user.avatarUrl ? (
    <img alt="" className="kindraw-sharemodal__avatar" src={user.avatarUrl} />
  ) : (
    <span
      aria-hidden="true"
      className="kindraw-sharemodal__avatar kindraw-sharemodal__avatar--fallback"
    >
      {(user.name || user.githubLogin).charAt(0).toUpperCase()}
    </span>
  );

export const ShareHybridModal = ({
  hybrid,
  onClose,
  onChange,
}: {
  hybrid: { id: string; title: string };
  onClose: () => void;
  /** Disparado após qualquer mutação bem-sucedida (ex.: refreshTree). */
  onChange?: () => void;
}) => {
  const [shares, setShares] = useState<KindrawHybridShare[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<KindrawUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<KindrawUser | null>(null);
  const [role, setRole] = useState<KindrawShareRole>("editor");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [busyShareId, setBusyShareId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const inviteRef = useRef<HTMLDivElement>(null);

  const loadShares = useCallback(async () => {
    setListError(null);
    try {
      const response = await listHybridShares(hybrid.id);
      setShares(response.shares);
    } catch (error) {
      setListError(getErrorMessage(error, "Falha ao carregar acessos."));
      setShares([]);
    }
  }, [hybrid.id]);

  useEffect(() => {
    void loadShares();
  }, [loadShares]);

  useEffect(() => {
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!resultsOpen) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (
        inviteRef.current &&
        !inviteRef.current.contains(event.target as Node)
      ) {
        setResultsOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [resultsOpen]);

  useEffect(() => {
    const trimmed = query.trim().replace(/^@/, "");
    if (selectedUser || trimmed.length === 0) {
      setResults([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void searchKindrawUsers(trimmed)
        .then((response) => {
          if (cancelled) {
            return;
          }
          setResults(response.users);
          setResultsOpen(true);
        })
        .catch(() => {
          if (!cancelled) {
            setResults([]);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setSearching(false);
          }
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, selectedUser]);

  const existingLogins = new Set(
    (shares || []).map((share) => share.user.githubLogin.toLowerCase()),
  );

  const handleSelectUser = useCallback((user: KindrawUser) => {
    setSelectedUser(user);
    setQuery(`@${user.githubLogin}`);
    setResultsOpen(false);
    setInviteError(null);
  }, []);

  const handleQueryChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setQuery(event.target.value);
      setSelectedUser(null);
      setInviteError(null);
    },
    [],
  );

  const handleInvite = useCallback(async () => {
    const login = (
      selectedUser?.githubLogin || query.trim().replace(/^@/, "")
    ).trim();
    if (!login) {
      return;
    }
    setInviting(true);
    setInviteError(null);
    try {
      await grantHybridShare(hybrid.id, login, role);
      setQuery("");
      setSelectedUser(null);
      setResults([]);
      setResultsOpen(false);
      await loadShares();
      onChange?.();
    } catch (error) {
      setInviteError(getErrorMessage(error, "Não foi possível convidar."));
    } finally {
      setInviting(false);
    }
  }, [selectedUser, query, hybrid.id, role, loadShares, onChange]);

  const handleRoleChange = useCallback(
    async (share: KindrawHybridShare, nextRole: KindrawShareRole) => {
      if (nextRole === share.role) {
        return;
      }
      setBusyShareId(share.id);
      setListError(null);
      try {
        await updateHybridShareRole(hybrid.id, share.id, nextRole);
        await loadShares();
        onChange?.();
      } catch (error) {
        setListError(getErrorMessage(error, "Falha ao alterar o papel."));
      } finally {
        setBusyShareId(null);
      }
    },
    [hybrid.id, loadShares, onChange],
  );

  const handleRevoke = useCallback(
    async (share: KindrawHybridShare) => {
      setBusyShareId(share.id);
      setListError(null);
      try {
        await revokeHybridShare(hybrid.id, share.id);
        await loadShares();
        onChange?.();
      } catch (error) {
        setListError(getErrorMessage(error, "Falha ao remover o acesso."));
      } finally {
        setBusyShareId(null);
      }
    },
    [hybrid.id, loadShares, onChange],
  );

  const canInvite = !inviting && query.trim().replace(/^@/, "").length > 0;

  return (
    <div
      className="kindraw-modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        aria-labelledby="kindraw-sharehybrid-title"
        aria-modal="true"
        className="kindraw-modal kindraw-sharemodal"
        role="dialog"
      >
        <div className="kindraw-sharemodal__head">
          <h2 id="kindraw-sharehybrid-title">Compartilhar “{hybrid.title}”</h2>
          <button
            aria-label="Fechar"
            className="kindraw-sharemodal__close"
            onClick={onClose}
            type="button"
          >
            <KindrawIcon name="close" size={16} />
          </button>
        </div>

        <p className="kindraw-sharemodal__hint">
          Editores podem editar o documento e o canvas em tempo real junto com
          você. Visualizadores só leem.
        </p>

        <div className="kindraw-sharemodal__invite" ref={inviteRef}>
          <div className="kindraw-sharemodal__invite-row">
            <div className="kindraw-sharemodal__field">
              <span aria-hidden="true" className="kindraw-sharemodal__at">
                @
              </span>
              <input
                aria-label="Convidar por login do GitHub"
                autoComplete="off"
                className="kindraw-sharemodal__input"
                onChange={handleQueryChange}
                onFocus={() => {
                  if (results.length) {
                    setResultsOpen(true);
                  }
                }}
                placeholder="login do GitHub"
                ref={inputRef}
                type="text"
                value={query.replace(/^@/, "")}
              />
            </div>
            <select
              aria-label="Papel do convidado"
              className="kindraw-sharemodal__roleselect"
              onChange={(event) =>
                setRole(event.target.value as KindrawShareRole)
              }
              value={role}
            >
              <option value="editor">{ROLE_LABEL.editor}</option>
              <option value="viewer">{ROLE_LABEL.viewer}</option>
            </select>
            <button
              className="kindraw-btn kindraw-btn--primary kindraw-btn--sm"
              disabled={!canInvite}
              onClick={() => void handleInvite()}
              type="button"
            >
              Convidar
            </button>
          </div>

          {resultsOpen && (results.length > 0 || searching) ? (
            <ul className="kindraw-sharemodal__results" role="listbox">
              {searching && results.length === 0 ? (
                <li className="kindraw-sharemodal__result-empty">Buscando…</li>
              ) : null}
              {results.map((user) => {
                const already = existingLogins.has(
                  user.githubLogin.toLowerCase(),
                );
                return (
                  <li key={user.id}>
                    <button
                      className="kindraw-sharemodal__result"
                      disabled={already}
                      onClick={() => handleSelectUser(user)}
                      role="option"
                      aria-selected={false}
                      type="button"
                    >
                      <KindrawPersonAvatar user={user} />
                      <span className="kindraw-sharemodal__result-text">
                        <strong>{user.name || user.githubLogin}</strong>
                        <span>@{user.githubLogin}</span>
                      </span>
                      {already ? (
                        <span className="kindraw-sharemodal__result-tag">
                          já tem acesso
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {inviteError ? (
            <p className="kindraw-sharemodal__error">{inviteError}</p>
          ) : null}
        </div>

        <div className="kindraw-sharemodal__people">
          <span className="kindraw-sharemodal__people-label">
            Pessoas com acesso
          </span>
          {shares === null ? (
            <p className="kindraw-sharemodal__hint">Carregando…</p>
          ) : shares.length === 0 ? (
            <p className="kindraw-sharemodal__hint">
              Ninguém tem acesso ainda além de você.
            </p>
          ) : (
            <ul className="kindraw-sharemodal__list">
              {shares.map((share) => {
                const busy = busyShareId === share.id;
                return (
                  <li className="kindraw-sharemodal__person" key={share.id}>
                    <KindrawPersonAvatar user={share.user} />
                    <span className="kindraw-sharemodal__person-text">
                      <strong>
                        {share.user.name || share.user.githubLogin}
                      </strong>
                      <span>@{share.user.githubLogin}</span>
                    </span>
                    <select
                      aria-label={`Papel de @${share.user.githubLogin}`}
                      className="kindraw-sharemodal__roleselect kindraw-sharemodal__roleselect--inline"
                      disabled={busy}
                      onChange={(event) =>
                        void handleRoleChange(
                          share,
                          event.target.value as KindrawShareRole,
                        )
                      }
                      value={share.role}
                    >
                      <option value="editor">{ROLE_LABEL.editor}</option>
                      <option value="viewer">{ROLE_LABEL.viewer}</option>
                    </select>
                    <button
                      aria-label={`Remover @${share.user.githubLogin}`}
                      className="kindraw-sharemodal__remove"
                      disabled={busy}
                      onClick={() => void handleRevoke(share)}
                      type="button"
                    >
                      <KindrawIcon name="trash" size={15} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {listError ? (
            <p className="kindraw-sharemodal__error">{listError}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
};
