import { useCallback, useEffect, useRef, useState } from "react";

import {
  createFolderInvite,
  listFolderInvites,
  listFolderShares,
  revokeFolderInvite,
  revokeFolderShare,
  searchKindrawUsers,
  updateFolderShareRole,
} from "./api";
import { KindrawIcon } from "./icons";
import { useKindrawI18n } from "./i18n";
import { userHandle, userSubtitle } from "./identity";
import { CreatedInviteBox, SharePendingInvites } from "./SharePendingInvites";
import { getErrorMessage } from "./utils";

import type { ChangeEvent } from "react";

import type {
  KindrawCreatedInvite,
  KindrawFolder,
  KindrawFolderShare,
  KindrawPendingInvite,
  KindrawShareRole,
  KindrawUser,
} from "./types";

const SEARCH_DEBOUNCE_MS = 250;

const KindrawPersonAvatar = ({ user }: { user: KindrawUser }) =>
  user.avatarUrl ? (
    <img alt="" className="kindraw-sharemodal__avatar" src={user.avatarUrl} />
  ) : (
    <span
      aria-hidden="true"
      className="kindraw-sharemodal__avatar kindraw-sharemodal__avatar--fallback"
    >
      {(user.name || userHandle(user)).charAt(0).toUpperCase()}
    </span>
  );

export const ShareFolderModal = ({
  folder,
  onClose,
  onChange,
}: {
  folder: Pick<KindrawFolder, "id" | "name">;
  onClose: () => void;
  /** Disparado após qualquer mutação bem-sucedida (ex.: refreshTree). */
  onChange?: () => void;
}) => {
  const { t } = useKindrawI18n();
  const [shares, setShares] = useState<KindrawFolderShare[] | null>(null);
  const [invites, setInvites] = useState<KindrawPendingInvite[]>([]);
  const [createdInvite, setCreatedInvite] =
    useState<KindrawCreatedInvite | null>(null);
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
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const inviteRef = useRef<HTMLDivElement>(null);

  const loadShares = useCallback(async () => {
    setListError(null);
    try {
      const [sharesResponse, invitesResponse] = await Promise.all([
        listFolderShares(folder.id),
        listFolderInvites(folder.id),
      ]);
      setShares(sharesResponse.shares);
      setInvites(invitesResponse.invites);
    } catch (error) {
      setListError(
        getErrorMessage(error, t("kindraw.shareFolder.loadSharesFailed")),
      );
      setShares([]);
    }
  }, [folder.id, t]);

  useEffect(() => {
    void loadShares();
  }, [loadShares]);

  // Foca o input ao abrir e fecha com Esc.
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

  // Fecha o dropdown de resultados ao clicar fora do campo de convite.
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

  // Busca de usuários com debounce. Não busca enquanto há um usuário escolhido.
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
    (shares || []).map((share) => userHandle(share.user).toLowerCase()),
  );

  const handleSelectUser = useCallback((user: KindrawUser) => {
    setSelectedUser(user);
    setQuery(userHandle(user));
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

  // Sempre gera um LINK de convite (fluxo único), mesmo selecionando um usuário
  // existente. O e-mail/identificador é só informativo; o link é a credencial.
  const handleInvite = useCallback(async () => {
    const identifier = (
      (selectedUser ? selectedUser.email || userHandle(selectedUser) : "") ||
      query.trim().replace(/^@/, "")
    ).trim();
    if (!identifier) {
      return;
    }
    setInviting(true);
    setInviteError(null);
    try {
      const response = await createFolderInvite(folder.id, identifier, role);
      setCreatedInvite(response.invite);
      setQuery("");
      setSelectedUser(null);
      setResults([]);
      setResultsOpen(false);
      await loadShares();
      onChange?.();
    } catch (error) {
      setInviteError(
        getErrorMessage(error, t("kindraw.shareFolder.inviteFailed")),
      );
    } finally {
      setInviting(false);
    }
  }, [selectedUser, query, folder.id, role, loadShares, onChange, t]);

  const handleRevokeInvite = useCallback(
    async (invite: KindrawPendingInvite) => {
      setBusyInviteId(invite.id);
      setListError(null);
      try {
        await revokeFolderInvite(folder.id, invite.id);
        if (createdInvite?.id === invite.id) {
          setCreatedInvite(null);
        }
        await loadShares();
        onChange?.();
      } catch (error) {
        setListError(
          getErrorMessage(error, t("kindraw.shareFolder.revokeInviteFailed")),
        );
      } finally {
        setBusyInviteId(null);
      }
    },
    [folder.id, createdInvite, loadShares, onChange, t],
  );

  const handleRoleChange = useCallback(
    async (share: KindrawFolderShare, nextRole: KindrawShareRole) => {
      if (nextRole === share.role) {
        return;
      }
      setBusyShareId(share.id);
      setListError(null);
      try {
        await updateFolderShareRole(folder.id, share.id, nextRole);
        await loadShares();
        onChange?.();
      } catch (error) {
        setListError(
          getErrorMessage(error, t("kindraw.shareFolder.roleChangeFailed")),
        );
      } finally {
        setBusyShareId(null);
      }
    },
    [folder.id, loadShares, onChange, t],
  );

  const handleRevoke = useCallback(
    async (share: KindrawFolderShare) => {
      setBusyShareId(share.id);
      setListError(null);
      try {
        await revokeFolderShare(folder.id, share.id);
        await loadShares();
        onChange?.();
      } catch (error) {
        setListError(
          getErrorMessage(error, t("kindraw.shareFolder.revokeShareFailed")),
        );
      } finally {
        setBusyShareId(null);
      }
    },
    [folder.id, loadShares, onChange, t],
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
        aria-labelledby="kindraw-sharemodal-title"
        aria-modal="true"
        className="kindraw-modal kindraw-sharemodal"
        role="dialog"
      >
        <div className="kindraw-sharemodal__head">
          <h2 id="kindraw-sharemodal-title">
            {t("kindraw.shareFolder.title", { name: folder.name })}
          </h2>
          <button
            aria-label={t("kindraw.shareFolder.closeAria")}
            className="kindraw-sharemodal__close"
            onClick={onClose}
            type="button"
          >
            <KindrawIcon name="close" size={16} />
          </button>
        </div>

        <div className="kindraw-sharemodal__invite" ref={inviteRef}>
          <div className="kindraw-sharemodal__invite-row">
            <div className="kindraw-sharemodal__field">
              <input
                aria-label={t("kindraw.shareFolder.inviteInputAria")}
                autoComplete="off"
                className="kindraw-sharemodal__input"
                onChange={handleQueryChange}
                onFocus={() => {
                  if (results.length) {
                    setResultsOpen(true);
                  }
                }}
                placeholder={t("kindraw.shareFolder.invitePlaceholder")}
                ref={inputRef}
                type="text"
                value={query}
              />
            </div>
            <select
              aria-label={t("kindraw.shareFolder.inviteRoleAria")}
              className="kindraw-sharemodal__roleselect"
              onChange={(event) =>
                setRole(event.target.value as KindrawShareRole)
              }
              value={role}
            >
              <option value="editor">
                {t("kindraw.shareFolder.roleEditor")}
              </option>
              <option value="viewer">
                {t("kindraw.shareFolder.roleViewer")}
              </option>
            </select>
            <button
              className="kindraw-btn kindraw-btn--primary kindraw-btn--sm"
              disabled={!canInvite}
              onClick={() => void handleInvite()}
              type="button"
            >
              {inviting
                ? t("kindraw.shareFolder.inviting")
                : t("kindraw.shareFolder.invite")}
            </button>
          </div>

          <p className="kindraw-sharemodal__invite-help">
            {t("kindraw.shareFolder.inviteHelp")}
          </p>

          {resultsOpen && (results.length > 0 || searching) ? (
            <ul className="kindraw-sharemodal__results" role="listbox">
              {searching && results.length === 0 ? (
                <li className="kindraw-sharemodal__result-empty">
                  {t("kindraw.shareFolder.searching")}
                </li>
              ) : null}
              {results.map((user) => {
                const already = existingLogins.has(
                  userHandle(user).toLowerCase(),
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
                        <strong>{user.name || userHandle(user)}</strong>
                        <span>{userSubtitle(user)}</span>
                      </span>
                      {already ? (
                        <span className="kindraw-sharemodal__result-tag">
                          {t("kindraw.shareFolder.alreadyHasAccess")}
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

        {createdInvite ? <CreatedInviteBox invite={createdInvite} /> : null}

        <div className="kindraw-sharemodal__people">
          <span className="kindraw-sharemodal__people-label">
            {t("kindraw.shareFolder.peopleLabel")}
          </span>
          {shares === null ? (
            <p className="kindraw-sharemodal__hint">
              {t("kindraw.status.loadingCanvas")}
            </p>
          ) : shares.length === 0 && invites.length === 0 ? (
            <p className="kindraw-sharemodal__hint">
              {t("kindraw.shareFolder.empty")}
            </p>
          ) : (
            <ul className="kindraw-sharemodal__list">
              <SharePendingInvites
                busyInviteId={busyInviteId}
                invites={invites}
                onRevoke={(invite) => void handleRevokeInvite(invite)}
              />
              {shares.map((share) => {
                const busy = busyShareId === share.id;
                return (
                  <li className="kindraw-sharemodal__person" key={share.id}>
                    <KindrawPersonAvatar user={share.user} />
                    <span className="kindraw-sharemodal__person-text">
                      <strong>
                        {share.user.name || userHandle(share.user)}
                      </strong>
                      <span>{userSubtitle(share.user)}</span>
                    </span>
                    <select
                      aria-label={t("kindraw.shareFolder.personRoleAria", {
                        handle: userHandle(share.user),
                      })}
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
                      <option value="editor">
                        {t("kindraw.shareFolder.roleEditor")}
                      </option>
                      <option value="viewer">
                        {t("kindraw.shareFolder.roleViewer")}
                      </option>
                    </select>
                    <button
                      aria-label={t("kindraw.shareFolder.removePersonAria", {
                        handle: userHandle(share.user),
                      })}
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
