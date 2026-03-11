import type {
  OnUserFollowedPayload,
  SocketId,
} from "@excalidraw/excalidraw/types";
import type { UserIdleState } from "@excalidraw/common";

import { WS_EVENTS } from "../app_constants";

export type KindrawCollabParticipant = {
  socketId: SocketId;
  username: string;
  avatarUrl: string | null;
  userId: string | null;
  githubLogin: string | null;
  userState?: UserIdleState;
};

type SnapshotPayload = {
  data: string;
  iv: string;
};

type ServerMessage =
  | {
      type: "joined";
      payload: {
        socketId: SocketId;
        participants: KindrawCollabParticipant[];
        snapshot: SnapshotPayload | null;
        isFirstParticipant: boolean;
      };
    }
  | {
      type: "participants";
      payload: {
        participants: KindrawCollabParticipant[];
        joinedSocketId?: SocketId;
      };
    }
  | {
      type: "client-broadcast";
      payload: SnapshotPayload;
    }
  | {
      type: "follow-room-change";
      payload: {
        followedBy: SocketId[];
      };
    }
  | {
      type: "error";
      payload: {
        message: string;
      };
    };

type ClientMessage =
  | {
      type: "join";
      payload: {
        username: string;
        avatarUrl: string | null;
        userId: string | null;
        githubLogin: string | null;
      };
    }
  | {
      type: "heartbeat";
    }
  | {
      type: "broadcast";
      payload: {
        roomId: string;
        data: string;
        iv: string;
        volatile: boolean;
      };
    }
  | {
      type: "snapshot";
      payload: SnapshotPayload;
    }
  | {
      type: "follow-change";
      payload: OnUserFollowedPayload;
    };

type EventMap = {
  "init-room": [];
  connect_error: [Error];
  "new-user": [SocketId];
  "room-user-change": [SocketId[]];
  participants: [KindrawCollabParticipant[]];
  "first-in-room": [];
  snapshot: [ArrayBuffer, Uint8Array<ArrayBuffer>];
  "client-broadcast": [ArrayBuffer, Uint8Array<ArrayBuffer>];
  [WS_EVENTS.USER_FOLLOW_ROOM_CHANGE]: [SocketId[]];
};

type EventName = keyof EventMap;
type EventHandler<K extends EventName> = (...args: EventMap[K]) => void;

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]!);
  }
  return btoa(binary);
};

const uint8ArrayToBase64 = (buffer: Uint8Array<ArrayBuffer>) =>
  arrayBufferToBase64(
    buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ),
  );

const base64ToUint8Array = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes as Uint8Array<ArrayBuffer>;
};

const base64ToArrayBuffer = (value: string) => base64ToUint8Array(value).buffer;

const buildWebSocketUrl = (baseUrl: string, roomId: string) => {
  const resolvedBaseUrl = baseUrl || window.location.origin;
  const url = new URL(`/api/collab/rooms/${roomId}/ws`, resolvedBaseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
};

export type KindrawCollabProfile = {
  username: string;
  avatarUrl: string | null;
  userId: string | null;
  githubLogin: string | null;
};

export interface KindrawCollabTransport {
  id?: SocketId;
  connected: boolean;
  on<K extends EventName>(event: K, handler: EventHandler<K>): void;
  once<K extends EventName>(event: K, handler: EventHandler<K>): void;
  off<K extends EventName>(event: K, handler?: EventHandler<K>): void;
  emit(event: string, ...args: unknown[]): void;
  close(): void;
  persistSnapshot(data: ArrayBuffer, iv: Uint8Array<ArrayBuffer>): void;
}

export class KindrawCollabSocket implements KindrawCollabTransport {
  private static readonly HEARTBEAT_INTERVAL_MS = 30_000;

  public id?: SocketId;
  public connected = false;

  private readonly roomId: string;
  private readonly profile: KindrawCollabProfile;
  private readonly socket: WebSocket;
  private readonly listeners = new Map<
    string,
    Set<(...args: unknown[]) => void>
  >();
  private readonly onceListeners = new Map<
    string,
    Set<(...args: unknown[]) => void>
  >();
  private hasJoined = false;
  private heartbeatTimer: number | null = null;

  constructor(opts: {
    roomId: string;
    profile: KindrawCollabProfile;
    baseUrl: string;
  }) {
    this.roomId = opts.roomId;
    this.profile = opts.profile;
    this.socket = new WebSocket(buildWebSocketUrl(opts.baseUrl, opts.roomId));

    this.socket.addEventListener("open", () => {
      this.connected = true;
      this.dispatch("init-room");
    });

    this.socket.addEventListener("message", (event) => {
      this.handleMessage(event);
    });

    this.socket.addEventListener("error", () => {
      this.dispatch(
        "connect_error",
        new Error("Kindraw collaboration connection failed."),
      );
    });

    this.socket.addEventListener("close", () => {
      const wasJoined = this.hasJoined;
      this.connected = false;
      this.id = undefined;
      this.stopHeartbeat();
      if (!wasJoined) {
        this.dispatch(
          "connect_error",
          new Error(
            "Kindraw collaboration connection closed before room join.",
          ),
        );
      }
    });
  }

  on<K extends EventName>(event: K, handler: EventHandler<K>) {
    const bucket = this.listeners.get(event) || new Set();
    bucket.add(handler as (...args: unknown[]) => void);
    this.listeners.set(event, bucket);
  }

  once<K extends EventName>(event: K, handler: EventHandler<K>) {
    const bucket = this.onceListeners.get(event) || new Set();
    bucket.add(handler as (...args: unknown[]) => void);
    this.onceListeners.set(event, bucket);
  }

  off<K extends EventName>(event: K, handler?: EventHandler<K>) {
    if (!handler) {
      this.listeners.delete(event);
      this.onceListeners.delete(event);
      return;
    }

    this.listeners.get(event)?.delete(handler as (...args: unknown[]) => void);
    this.onceListeners
      .get(event)
      ?.delete(handler as (...args: unknown[]) => void);
  }

  emit(event: string, ...args: unknown[]) {
    switch (event) {
      case "join-room": {
        this.send({
          type: "join",
          payload: this.profile,
        });
        return;
      }
      case "heartbeat": {
        this.send({
          type: "heartbeat",
        });
        return;
      }
      case WS_EVENTS.SERVER:
      case WS_EVENTS.SERVER_VOLATILE: {
        const [roomId, data, iv] = args as [
          string,
          ArrayBuffer,
          Uint8Array<ArrayBuffer>,
        ];
        this.send({
          type: "broadcast",
          payload: {
            roomId,
            data: arrayBufferToBase64(data),
            iv: uint8ArrayToBase64(iv),
            volatile: event === WS_EVENTS.SERVER_VOLATILE,
          },
        });
        return;
      }
      case WS_EVENTS.USER_FOLLOW_CHANGE: {
        const [payload] = args as [OnUserFollowedPayload];
        this.send({
          type: "follow-change",
          payload,
        });
        break;
      }
      default:
        break;
    }
  }

  persistSnapshot(data: ArrayBuffer, iv: Uint8Array<ArrayBuffer>) {
    this.send({
      type: "snapshot",
      payload: {
        data: arrayBufferToBase64(data),
        iv: uint8ArrayToBase64(iv),
      },
    });
  }

  close() {
    this.stopHeartbeat();
    this.socket.close();
  }

  private send(message: ClientMessage) {
    if (this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify(message));
  }

  private handleMessage(event: MessageEvent) {
    const raw = typeof event.data === "string" ? event.data : "";
    if (!raw) {
      return;
    }

    let message: ServerMessage;
    try {
      message = JSON.parse(raw) as ServerMessage;
    } catch {
      this.dispatch(
        "connect_error",
        new Error("Invalid collaboration payload received."),
      );
      return;
    }

    switch (message.type) {
      case "joined": {
        this.id = message.payload.socketId;
        this.hasJoined = true;
        this.startHeartbeat();
        this.dispatch(
          "room-user-change",
          message.payload.participants.map(
            (participant) => participant.socketId,
          ),
        );
        this.dispatch("participants", message.payload.participants);
        if (message.payload.isFirstParticipant) {
          this.dispatch("first-in-room");
        }
        if (message.payload.snapshot) {
          this.dispatch(
            "snapshot",
            base64ToArrayBuffer(message.payload.snapshot.data),
            base64ToUint8Array(
              message.payload.snapshot.iv,
            ) as Uint8Array<ArrayBuffer>,
          );
        }
        return;
      }
      case "participants": {
        this.dispatch(
          "room-user-change",
          message.payload.participants.map(
            (participant) => participant.socketId,
          ),
        );
        this.dispatch("participants", message.payload.participants);
        if (message.payload.joinedSocketId) {
          this.dispatch("new-user", message.payload.joinedSocketId);
        }
        return;
      }
      case "client-broadcast": {
        this.dispatch(
          "client-broadcast",
          base64ToArrayBuffer(message.payload.data),
          base64ToUint8Array(message.payload.iv) as Uint8Array<ArrayBuffer>,
        );
        return;
      }
      case "follow-room-change": {
        this.dispatch(
          WS_EVENTS.USER_FOLLOW_ROOM_CHANGE,
          message.payload.followedBy,
        );
        return;
      }
      case "error": {
        this.dispatch("connect_error", new Error(message.payload.message));
        this.close();
        break;
      }
      default:
        break;
    }
  }

  private dispatch<K extends EventName>(event: K, ...args: EventMap[K]) {
    this.listeners.get(event)?.forEach((handler) => handler(...args));
    const onceHandlers = this.onceListeners.get(event);
    if (onceHandlers?.size) {
      onceHandlers.forEach((handler) => handler(...args));
      onceHandlers.clear();
    }
  }

  private startHeartbeat() {
    if (this.heartbeatTimer !== null) {
      return;
    }

    this.emit("heartbeat");
    this.heartbeatTimer = window.setInterval(() => {
      this.emit("heartbeat");
    }, KindrawCollabSocket.HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer === null) {
      return;
    }

    window.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }
}
