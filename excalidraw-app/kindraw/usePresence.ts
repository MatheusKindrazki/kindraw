import { useEffect, useState } from "react";

import { colorForUser } from "./identity";

import type { PresenceUser } from "./identity";
import type { KindrawYjsProvider } from "./yjsProvider";

// Hook de presença reativo: lê o awareness do provider Yjs e devolve a lista de
// participantes (deduplicada por identidade), reordenando "você" por último.
// Fonte única de verdade p/ o facepile e qualquer indicador de "quem está aqui".
export const usePresence = (
  provider: KindrawYjsProvider | null,
): PresenceUser[] => {
  const [users, setUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    if (!provider) {
      setUsers([]);
      return undefined;
    }

    const recompute = () => {
      const raw = provider.getPresence();
      // dedupe por key (mesma pessoa em 2 abas conta 1x; mantém a ativa)
      const byKey = new Map<string, PresenceUser>();
      for (const p of raw) {
        const color = p.userId ? colorForUser(p.userId) : p.color;
        const existing = byKey.get(p.key);
        const next: PresenceUser = {
          key: p.key,
          name: p.name,
          color,
          avatarUrl: p.avatarUrl,
          githubLogin: p.githubLogin,
          isSelf: p.isSelf,
          idle: p.idle,
        };
        // prioriza a entrada NÃO-idle e a que é "self"
        if (!existing || (existing.idle && !next.idle) || next.isSelf) {
          byKey.set(p.key, next);
        }
      }
      const list = [...byKey.values()];
      // ativos primeiro, depois idle; "você" sempre ao fim p/ os outros saltarem à vista
      list.sort((a, b) => {
        if (a.isSelf !== b.isSelf) {
          return a.isSelf ? 1 : -1;
        }
        if (a.idle !== b.idle) {
          return a.idle ? 1 : -1;
        }
        return a.name.localeCompare(b.name);
      });
      setUsers(list);
    };

    recompute();
    const unsubscribe = provider.onPresenceChange(recompute);
    return unsubscribe;
  }, [provider]);

  return users;
};
