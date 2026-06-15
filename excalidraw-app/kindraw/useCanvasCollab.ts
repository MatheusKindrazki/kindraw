import { useEffect, useMemo, useRef, useState } from "react";

import {
  getSceneVersion,
  reconcileElements,
  restoreElements,
  CaptureUpdateAction,
} from "@excalidraw/excalidraw";
import { encryptData, decryptData } from "@excalidraw/excalidraw/data/encryption";
import throttle from "lodash.throttle";

import { KindrawCollabSocket } from "../collab/KindrawCollabSocket";
import { WS_EVENTS, WS_SUBTYPES, CURSOR_SYNC_TIMEOUT } from "../app_constants";

import { colorForUser } from "./identity";

import type {
  ExcalidrawImperativeAPI,
  ExcalidrawProps,
  SocketId,
  Collaborator,
} from "@excalidraw/excalidraw/types";
import type {
  ExcalidrawElement,
  OrderedExcalidrawElement,
} from "@excalidraw/element/types";

// Cliente ENXUTO de colaboração de canvas para o híbrido. Reusa o transporte
// (KindrawCollabSocket) e a cripto/merge do Excalidraw, SEM a bagagem do App
// (firebase, FileManager, jotai, follow-mode, idle-as-firebase). Sincroniza a
// cena (INIT/UPDATE) e cursores (MOUSE_LOCATION), e renderiza colaboradores
// nativamente via excalidrawAPI.updateScene({ collaborators }).

type CanvasCollabProfile = {
  name: string;
  userId: string | null;
  avatarUrl: string | null;
  githubLogin: string | null;
};

type ScenePayload = {
  type: WS_SUBTYPES.INIT | WS_SUBTYPES.UPDATE;
  payload: { elements: readonly OrderedExcalidrawElement[] };
};

type MousePayload = {
  type: WS_SUBTYPES.MOUSE_LOCATION;
  payload: {
    socketId: SocketId;
    pointer: { x: number; y: number; tool: "pointer" | "laser" };
    button: "down" | "up";
    selectedElementIds: Record<string, true>;
    username: string;
    userId?: string;
    avatarUrl?: string;
  };
};

type Decrypted = ScenePayload | MousePayload | { type: string };

const getApiBaseUrl = () => {
  const configured = import.meta.env.VITE_APP_KINDRAW_API_BASE_URL?.trim();
  return configured ? configured.replace(/\/+$/, "") : window.location.origin;
};

export type CanvasCollab = {
  collaborators: Map<SocketId, Collaborator>;
  onPointerUpdate: NonNullable<ExcalidrawProps["onPointerUpdate"]>;
  broadcastScene: (elements: readonly OrderedExcalidrawElement[]) => void;
  isConnected: boolean;
};

export const useCanvasCollab = (opts: {
  enabled: boolean;
  roomId: string; // ex.: hcanvas:<hybridId>
  roomKey: string | null; // chave AES (base64/JWK.k) do drawing item
  profile: CanvasCollabProfile;
  excalidrawAPIRef: React.MutableRefObject<ExcalidrawImperativeAPI | null>;
}): CanvasCollab => {
  const { enabled, roomId, roomKey, profile, excalidrawAPIRef } = opts;
  const socketRef = useRef<KindrawCollabSocket | null>(null);
  const [collaborators, setCollaborators] = useState<
    Map<SocketId, Collaborator>
  >(new Map());
  const [isConnected, setIsConnected] = useState(false);
  // versão da cena já vista/enviada — evita re-broadcast em eco.
  const lastSceneVersionRef = useRef(-1);
  // ref estável para o broadcast (preenchida dentro do effect de conexão)
  const broadcastRef = useRef<
    ((elements: readonly OrderedExcalidrawElement[]) => void) | null
  >(null);

  // ---- conexão ----
  useEffect(() => {
    if (!enabled || !roomKey) {
      return undefined;
    }

    const socket = new KindrawCollabSocket({
      roomId,
      baseUrl: getApiBaseUrl(),
      profile: {
        username: profile.name,
        avatarUrl: profile.avatarUrl,
        userId: profile.userId,
        githubLogin: profile.githubLogin,
      },
    });
    socketRef.current = socket;

    const decryptPayload = async (
      data: ArrayBuffer,
      iv: Uint8Array<ArrayBuffer>,
    ): Promise<Decrypted | null> => {
      try {
        const decrypted = await decryptData(iv, data, roomKey);
        return JSON.parse(
          new TextDecoder("utf-8").decode(new Uint8Array(decrypted)),
        );
      } catch {
        return null;
      }
    };

    const applyRemoteElements = (
      remote: readonly OrderedExcalidrawElement[],
    ) => {
      const api = excalidrawAPIRef.current;
      if (!api) {
        return;
      }
      const local = api.getSceneElementsIncludingDeleted();
      const restored = restoreElements(remote, null);
      const reconciled = reconcileElements(
        local,
        restored as never,
        api.getAppState(),
      );
      lastSceneVersionRef.current = getSceneVersion(reconciled);
      api.updateScene({
        elements: reconciled,
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    };

    const updateCollaborator = (
      socketId: SocketId,
      updates: Partial<Collaborator>,
    ) => {
      setCollaborators((prev) => {
        const next = new Map(prev);
        const merged = {
          ...next.get(socketId),
          ...updates,
          isCurrentUser: socketId === socket.id,
        } as Collaborator;
        next.set(socketId, merged);
        return next;
      });
    };

    const handleDecrypted = (message: Decrypted) => {
      switch (message.type) {
        case WS_SUBTYPES.INIT:
        case WS_SUBTYPES.UPDATE: {
          applyRemoteElements((message as ScenePayload).payload.elements);
          return;
        }
        case WS_SUBTYPES.MOUSE_LOCATION: {
          const p = (message as MousePayload).payload;
          updateCollaborator(p.socketId, {
            pointer: p.pointer,
            button: p.button,
            selectedElementIds: p.selectedElementIds,
            username: p.username,
            avatarUrl: p.avatarUrl,
            id: p.userId,
            color: p.userId
              ? { background: colorForUser(p.userId), stroke: "#fff" }
              : undefined,
          } as Partial<Collaborator>);
          return;
        }
        default:
      }
    };

    const onBroadcast = async (
      data: ArrayBuffer,
      iv: Uint8Array<ArrayBuffer>,
    ) => {
      const message = await decryptPayload(data, iv);
      if (message) {
        handleDecrypted(message);
      }
    };

    socket.on("init-room", () => {
      socket.emit("join-room", roomId);
    });
    socket.on("client-broadcast", onBroadcast);
    socket.on("snapshot", onBroadcast);
    socket.on("new-user", () => {
      // novo participante: manda a cena completa (INIT) para sincronizá-lo.
      const api = excalidrawAPIRef.current;
      if (api) {
        void broadcast(
          WS_SUBTYPES.INIT,
          api.getSceneElementsIncludingDeleted(),
        );
      }
    });
    socket.on("room-user-change", (socketIds: SocketId[]) => {
      // remove cursores de quem saiu (mantém só os presentes).
      setCollaborators((prev) => {
        const next = new Map<SocketId, Collaborator>();
        for (const id of socketIds) {
          const existing = prev.get(id);
          if (existing) {
            next.set(id, existing);
          }
        }
        return next;
      });
    });

    const checkConnected = window.setInterval(() => {
      setIsConnected(socket.connected);
    }, 1000);

    const broadcast = async (
      type: WS_SUBTYPES.INIT | WS_SUBTYPES.UPDATE,
      elements: readonly OrderedExcalidrawElement[],
    ) => {
      if (!socket.connected) {
        return;
      }
      const data: ScenePayload = { type, payload: { elements } };
      const encoded = new TextEncoder().encode(JSON.stringify(data));
      const { encryptedBuffer, iv } = await encryptData(roomKey, encoded);
      socket.emit(WS_EVENTS.SERVER, roomId, encryptedBuffer, iv);
    };
    // expõe o broadcast p/ o onChange do Excalidraw via ref
    broadcastRef.current = (elements) => {
      const version = getSceneVersion(elements);
      if (version === lastSceneVersionRef.current) {
        return;
      }
      lastSceneVersionRef.current = version;
      void broadcast(WS_SUBTYPES.UPDATE, elements);
    };

    return () => {
      window.clearInterval(checkConnected);
      broadcastRef.current = null;
      socket.close();
      socketRef.current = null;
      setCollaborators(new Map());
      setIsConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, roomId, roomKey]);

  // cursor local → broadcast volátil throttled (~33ms)
  const onPointerUpdate = useMemo<
    NonNullable<ExcalidrawProps["onPointerUpdate"]>
  >(
    () =>
      throttle((payload) => {
        const socket = socketRef.current;
        const api = excalidrawAPIRef.current;
        if (!socket?.connected || !api || !roomKey) {
          return;
        }
        if (payload.pointersMap.size >= 2) {
          return;
        }
        const data: MousePayload = {
          type: WS_SUBTYPES.MOUSE_LOCATION,
          payload: {
            socketId: (socket.id || "") as SocketId,
            pointer: payload.pointer,
            button: payload.button,
            selectedElementIds: api.getAppState().selectedElementIds,
            username: profile.name,
            userId: profile.userId || undefined,
            avatarUrl: profile.avatarUrl || undefined,
          },
        };
        void (async () => {
          const encoded = new TextEncoder().encode(JSON.stringify(data));
          const { encryptedBuffer, iv } = await encryptData(roomKey, encoded);
          socket.emit(WS_EVENTS.SERVER_VOLATILE, roomId, encryptedBuffer, iv);
        })();
      }, CURSOR_SYNC_TIMEOUT),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roomId, roomKey, profile.name, profile.userId, profile.avatarUrl],
  );

  const broadcastScene = useMemo(
    () => (elements: readonly OrderedExcalidrawElement[]) => {
      broadcastRef.current?.(elements);
    },
    [],
  );

  return { collaborators, onPointerUpdate, broadcastScene, isConnected };
};

// (placeholder p/ tipo de elemento — evita import não usado em alguns builds)
export type _CanvasCollabElement = ExcalidrawElement;
