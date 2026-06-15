import * as Y from "yjs";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";

// Provider Yjs leve que fala com o Durable Object KindrawCollaborationRoom
// (workers/api/src/collab.ts) pelo WebSocket /api/collab/rooms/:roomId/ws.
//
// Protocolo (JSON com payloads base64):
//   cliente → servidor:
//     { type: "join", payload: { username, avatarUrl, userId, githubLogin } }
//     { type: "yjs-sync", payload: { update } }       // Y.Doc update
//     { type: "yjs-awareness", payload: { update } }  // awareness update
//     { type: "yjs-snapshot", payload: { update } }   // estado completo p/ persistir
//     { type: "heartbeat" }
//   servidor → cliente:
//     { type: "yjs-init", payload: { update | null } } // snapshot persistido no join
//     { type: "yjs-sync", payload: { update } }        // update de outro peer
//     { type: "yjs-awareness", payload: { update } }
//
// É um relay: ao entrar, o cliente recebe o snapshot persistido (yjs-init),
// aplica, e então envia SEU estado completo como yjs-sync para os peers já
// presentes convergirem. Snapshots periódicos persistem o doc no DO.

const HEARTBEAT_MS = 30_000;
const SNAPSHOT_DEBOUNCE_MS = 4_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 20_000;

export type YjsUser = {
  name: string;
  color: string;
  avatarUrl: string | null;
  githubLogin: string | null;
  userId: string | null;
};

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

const fromBase64 = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const buildWsUrl = (roomId: string, token: string | null) => {
  const base = import.meta.env.VITE_APP_KINDRAW_API_BASE_URL?.trim();
  const origin = base ? base.replace(/\/+$/, "") : window.location.origin;
  const wsOrigin = origin.replace(/^http/, "ws");
  const suffix = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${wsOrigin}/api/collab/rooms/${encodeURIComponent(roomId)}/ws${suffix}`;
};

export class KindrawYjsProvider {
  readonly doc: Y.Doc;
  readonly awareness: Awareness;

  private socket: WebSocket | null = null;
  private readonly roomId: string;
  private readonly token: string | null;
  private readonly user: YjsUser;
  private heartbeatTimer: number | null = null;
  private snapshotTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  private destroyed = false;
  private synced = false;
  private readonly onSyncedListeners = new Set<() => void>();

  constructor(opts: {
    roomId: string;
    token?: string | null;
    user: YjsUser;
    doc?: Y.Doc;
  }) {
    this.roomId = opts.roomId;
    this.token = opts.token ?? null;
    this.user = opts.user;
    this.doc = opts.doc ?? new Y.Doc();
    this.awareness = new Awareness(this.doc);
    this.awareness.setLocalStateField("user", {
      name: opts.user.name,
      color: opts.user.color,
    });

    this.doc.on("update", this.handleLocalDocUpdate);
    this.awareness.on("update", this.handleLocalAwarenessUpdate);

    this.connect();
  }

  onSynced(listener: () => void): () => void {
    if (this.synced) {
      listener();
      return () => undefined;
    }
    this.onSyncedListeners.add(listener);
    return () => {
      this.onSyncedListeners.delete(listener);
    };
  }

  get isSynced() {
    return this.synced;
  }

  private connect() {
    if (this.destroyed) {
      return;
    }

    const socket = new WebSocket(buildWsUrl(this.roomId, this.token));
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.reconnectAttempts = 0;
      this.send({
        type: "join",
        payload: {
          username: this.user.name,
          avatarUrl: this.user.avatarUrl,
          userId: this.user.userId,
          githubLogin: this.user.githubLogin,
        },
      });
      this.startHeartbeat();
    });

    socket.addEventListener("message", (event) => {
      this.handleMessage(event);
    });

    socket.addEventListener("close", () => {
      this.stopHeartbeat();
      if (!this.destroyed) {
        this.scheduleReconnect();
      }
    });

    socket.addEventListener("error", () => {
      try {
        socket.close();
      } catch {
        // noop
      }
    });
  }

  private handleMessage(event: MessageEvent) {
    let message: {
      type: string;
      payload?: { update?: string | null };
    };
    try {
      message = JSON.parse(
        typeof event.data === "string" ? event.data : "",
      );
    } catch {
      return;
    }

    switch (message.type) {
      case "yjs-init": {
        // estado persistido pelo DO (pode ser null em room novo)
        const update = message.payload?.update;
        if (update) {
          Y.applyUpdate(this.doc, fromBase64(update), this);
        }
        // manda o NOSSO estado completo para os peers já presentes convergirem
        this.send({
          type: "yjs-sync",
          payload: { update: toBase64(Y.encodeStateAsUpdate(this.doc)) },
        });
        // estado inicial de awareness
        this.broadcastAwareness([this.doc.clientID]);
        this.markSynced();
        return;
      }
      case "yjs-sync": {
        const update = message.payload?.update;
        if (update) {
          Y.applyUpdate(this.doc, fromBase64(update), this);
        }
        this.markSynced();
        return;
      }
      case "yjs-awareness": {
        const update = message.payload?.update;
        if (update) {
          applyAwarenessUpdate(this.awareness, fromBase64(update), this);
        }
        return;
      }
      default:
        return;
    }
  }

  private markSynced() {
    if (this.synced) {
      return;
    }
    this.synced = true;
    for (const listener of this.onSyncedListeners) {
      listener();
    }
    this.onSyncedListeners.clear();
  }

  // Update local do doc → envia aos peers e agenda snapshot de persistência.
  // (origin === this significa que o update veio de aplicar um update remoto,
  // então não reemitimos.)
  private handleLocalDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this) {
      return;
    }
    this.send({
      type: "yjs-sync",
      payload: { update: toBase64(update) },
    });
    this.scheduleSnapshot();
  };

  private handleLocalAwarenessUpdate = (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (origin === this) {
      return;
    }
    const changed = [
      ...changes.added,
      ...changes.updated,
      ...changes.removed,
    ];
    this.broadcastAwareness(changed);
  };

  private broadcastAwareness(clients: number[]) {
    if (!clients.length) {
      return;
    }
    this.send({
      type: "yjs-awareness",
      payload: {
        update: toBase64(encodeAwarenessUpdate(this.awareness, clients)),
      },
    });
  }

  private scheduleSnapshot() {
    if (this.snapshotTimer !== null) {
      return;
    }
    this.snapshotTimer = window.setTimeout(() => {
      this.snapshotTimer = null;
      this.send({
        type: "yjs-snapshot",
        payload: { update: toBase64(Y.encodeStateAsUpdate(this.doc)) },
      });
    }, SNAPSHOT_DEBOUNCE_MS);
  }

  private send(message: unknown) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      this.send({ type: "heartbeat" });
    }, HEARTBEAT_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer !== null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer !== null) {
      return;
    }
    const delay = Math.min(
      RECONNECT_BASE_MS * 2 ** this.reconnectAttempts,
      RECONNECT_MAX_MS,
    );
    this.reconnectAttempts += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  destroy() {
    this.destroyed = true;
    this.stopHeartbeat();
    if (this.snapshotTimer !== null) {
      window.clearTimeout(this.snapshotTimer);
      this.snapshotTimer = null;
    }
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    // tira nosso estado de awareness dos outros antes de sair
    removeAwarenessStates(this.awareness, [this.doc.clientID], "destroy");
    this.doc.off("update", this.handleLocalDocUpdate);
    this.awareness.off("update", this.handleLocalAwarenessUpdate);
    this.awareness.destroy();
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // noop
      }
      this.socket = null;
    }
  }
}
