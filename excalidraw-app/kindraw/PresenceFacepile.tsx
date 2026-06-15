import { initialsForName } from "./identity";
import { useKindrawI18n } from "./i18n";

import type { PresenceUser } from "./identity";

// Facepile de presença ao vivo (estilo Eraser/Figma): avatares sobrepostos no
// canto, cada um com a cor estável do usuário, anel ativo vs. esmaecido p/ idle,
// "+N" quando lota, e tooltip com o nome no hover. Só aparece quando há gente.

const MAX_VISIBLE = 4;

const Avatar = ({ user }: { user: PresenceUser }) => {
  const { t } = useKindrawI18n();
  const title = user.isSelf
    ? t("kindraw.presence.selfLabel", { name: user.name })
    : user.name;
  return (
    <span
      className={`kindraw-facepile__avatar${
        user.idle ? " kindraw-facepile__avatar--idle" : ""
      }`}
      style={{ borderColor: user.color }}
      title={title}
    >
      {user.avatarUrl ? (
        <img alt="" src={user.avatarUrl} />
      ) : (
        <span
          className="kindraw-facepile__initials"
          style={{ background: user.color }}
        >
          {initialsForName(user.name)}
        </span>
      )}
    </span>
  );
};

export const PresenceFacepile = ({ users }: { users: PresenceUser[] }) => {
  const { t } = useKindrawI18n();
  // só mostra quando há mais de uma pessoa (sozinho não precisa de facepile)
  const others = users.filter((u) => !u.isSelf);
  if (others.length === 0) {
    return null;
  }

  const visible = users.slice(0, MAX_VISIBLE);
  const overflow = users.length - visible.length;
  const activeCount = users.filter((u) => !u.idle).length;

  return (
    <div
      aria-label={t("kindraw.presence.sessionPeopleAria", {
        count: users.length,
      })}
      className="kindraw-facepile"
      role="group"
    >
      <span
        className="kindraw-facepile__live"
        title={t("kindraw.presence.liveEditing")}
      >
        <span className="kindraw-facepile__dot" />
        {activeCount}
      </span>
      <div className="kindraw-facepile__stack">
        {visible.map((user) => (
          <Avatar key={user.key} user={user} />
        ))}
        {overflow > 0 ? (
          <span
            className="kindraw-facepile__avatar kindraw-facepile__more"
            title={t("kindraw.presence.overflowMore", { count: overflow })}
          >
            <span className="kindraw-facepile__initials kindraw-facepile__initials--more">
              +{overflow}
            </span>
          </span>
        ) : null}
      </div>
    </div>
  );
};
