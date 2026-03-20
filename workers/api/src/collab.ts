import type { Env, DurableObjectState } from "./types";

type SnapshotPayload = {
  data: string;
  iv: string;
  updatedAt: string;
};

type Participant = {
  socketId: string;
  username: string;
  avatarUrl: string | null;
  userId: string | null;
  githubLogin: string | null;
  connectedAt: string;
  lastSeenAt: string;
};

type JoinMessage = {
  type: "join";
  payload: {
    username: string;
    avatarUrl: string | null;
    userId: string | null;
    githubLogin: string | null;
  };
};

type BroadcastMessage = {
  type: "broadcast";
  payload: {
    roomId: string;
    data: string;
    iv: string;
    volatile: boolean;
  };
};

type SnapshotMessage = {
  type: "snapshot";
  payload: {
    data: string;
    iv: string;
  };
};

type FollowChangeMessage = {
  type: "follow-change";
  payload: {
    userToFollow: {
      socketId: string;
      username: string;
    };
    action: "FOLLOW" | "UNFOLLOW";
  };
};

type ClientMessage =
  | JoinMessage
  | {
      type: "heartbeat";
    }
  | BroadcastMessage
  | SnapshotMessage
  | FollowChangeMessage;

const STALE_PARTICIPANT_TTL_MS = 5 * 60_000;

type ServerMessage =
  | {
      type: "joined";
      payload: {
        socketId: string;
        participants: Participant[];
        snapshot: SnapshotPayload | null;
        isFirstParticipant: boolean;
      };
    }
  | {
      type: "participants";
      payload: {
        participants: Participant[];
        joinedSocketId?: string;
      };
    }
  | {
      type: "client-broadcast";
      payload: {
        data: string;
        iv: string;
      };
    }
  | {
      type: "follow-room-change";
      payload: {
        followedBy: string[];
      };
    }
  | {
      type: "error";
      payload: {
        message: string;
      };
    };

const json = (message: ServerMessage) => JSON.stringify(message);

const isWebSocketRequest = (request: Request) =>
  request.headers.get("Upgrade")?.toLowerCase() === "websocket";

export class KindrawCollaborationRoom {
  private readonly state: DurableObjectState;
  private readonly env: Env;
  private readonly sockets = new Map<string, WebSocket>();
  private readonly participants = new Map<string, Participant>();
  private readonly followersByTarget = new Map<string, Set<string>>();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request) {
    if (!isWebSocketRequest(request)) {
      return new Response("Expected websocket upgrade.", { status: 426 });
    }

    const pair = new (
      globalThis as typeof globalThis & {
        WebSocketPair: new () => { 0: WebSocket; 1: WebSocket };
      }
    ).WebSocketPair();
    const clientSocket = pair[0];
    const serverSocket = pair[1];
    const socketId = crypto.randomUUID();

    (serverSocket as WebSocket & { accept(): void }).accept();
    this.sockets.set(socketId, serverSocket);

    serverSocket.addEventListener("message", (event: MessageEvent<string>) => {
      void this.handleMessage(socketId, event);
    });
    serverSocket.addEventListener("close", () => {
      void this.handleClose(socketId);
    });
    serverSocket.addEventListener("error", () => {
      void this.handleClose(socketId);
    });

    return new Response(null, {
      status: 101,
      webSocket: clientSocket,
    } as ResponseInit & { webSocket: WebSocket });
  }

  private async handleMessage(socketId: string, event: MessageEvent) {
    const raw = typeof event.data === "string" ? event.data : "";
    if (!raw) {
      return;
    }

    let message: ClientMessage;
    try {
      message = JSON.parse(raw) as ClientMessage;
    } catch {
      this.send(socketId, {
        type: "error",
        payload: {
          message: "Invalid collaboration payload.",
        },
      });
      return;
    }

    switch (message.type) {
      case "join":
        await this.handleJoin(socketId, message.payload);
        return;
      case "heartbeat":
        this.touchParticipant(socketId);
        return;
      case "broadcast":
        this.touchParticipant(socketId);
        this.handleBroadcast(socketId, message.payload.roomId, {
          data: message.payload.data,
          iv: message.payload.iv,
        });
        return;
      case "snapshot":
        this.touchParticipant(socketId);
        await this.state.storage.put<SnapshotPayload>("sceneSnapshot", {
          data: message.payload.data,
          iv: message.payload.iv,
          updatedAt: new Date().toISOString(),
        });
        return;
      case "follow-change":
        this.touchParticipant(socketId);
        this.handleFollowChange(socketId, message.payload);
        break;
      default:
        break;
    }
  }

  private async handleJoin(socketId: string, payload: JoinMessage["payload"]) {
    this.pruneStaleParticipants();

    // If a participant with the same userId already exists (reconnection),
    // remove the old socket to prevent duplicate participants.
    if (payload.userId) {
      for (const [existingSocketId, existing] of this.participants.entries()) {
        if (
          existing.userId === payload.userId &&
          existingSocketId !== socketId
        ) {
          this.removeParticipant(existingSocketId, { closeSocket: true });
          break;
        }
      }
    }

    const now = new Date().toISOString();
    const participant: Participant = {
      socketId,
      username: payload.username,
      avatarUrl: payload.avatarUrl,
      userId: payload.userId,
      githubLogin: payload.githubLogin,
      connectedAt: now,
      lastSeenAt: now,
    };

    this.participants.set(socketId, participant);

    const participants = this.getParticipants();
    const snapshot =
      (await this.state.storage.get<SnapshotPayload>("sceneSnapshot")) || null;
    const isFirstParticipant = participants.length === 1;

    this.send(socketId, {
      type: "joined",
      payload: {
        socketId,
        participants,
        snapshot,
        isFirstParticipant,
      },
    });

    this.broadcastParticipants({
      joinedSocketId: socketId,
      includeSelf: false,
    });
  }

  private handleBroadcast(
    senderSocketId: string,
    roomId: string,
    payload: {
      data: string;
      iv: string;
    },
  ) {
    if (roomId.startsWith("follow@")) {
      const targetSocketId = roomId.slice("follow@".length);
      const followers = this.followersByTarget.get(targetSocketId) || new Set();
      for (const followerSocketId of followers) {
        if (followerSocketId === senderSocketId) {
          continue;
        }
        this.send(followerSocketId, {
          type: "client-broadcast",
          payload,
        });
      }
      return;
    }

    for (const socketId of this.sockets.keys()) {
      if (socketId === senderSocketId) {
        continue;
      }
      this.send(socketId, {
        type: "client-broadcast",
        payload,
      });
    }
  }

  private handleFollowChange(
    followerSocketId: string,
    payload: FollowChangeMessage["payload"],
  ) {
    const targetSocketId = payload.userToFollow.socketId;
    const followers = this.followersByTarget.get(targetSocketId) || new Set();

    if (payload.action === "FOLLOW") {
      followers.add(followerSocketId);
      this.followersByTarget.set(targetSocketId, followers);
    } else {
      followers.delete(followerSocketId);
      if (followers.size === 0) {
        this.followersByTarget.delete(targetSocketId);
      } else {
        this.followersByTarget.set(targetSocketId, followers);
      }
    }

    this.send(targetSocketId, {
      type: "follow-room-change",
      payload: {
        followedBy: [...followers],
      },
    });
  }

  private async handleClose(socketId: string) {
    this.removeParticipant(socketId);
    this.broadcastParticipants({ includeSelf: true });
  }

  private removeParticipant(
    socketId: string,
    opts?: {
      closeSocket?: boolean;
    },
  ) {
    const socket = this.sockets.get(socketId);
    this.sockets.delete(socketId);
    this.participants.delete(socketId);

    if (opts?.closeSocket && socket) {
      try {
        socket.close(4001, "stale-participant");
      } catch {
        // noop
      }
    }

    const changedTargets = new Set<string>();
    for (const [targetSocketId, followers] of this.followersByTarget) {
      if (targetSocketId === socketId) {
        this.followersByTarget.delete(targetSocketId);
        continue;
      }

      if (followers.delete(socketId)) {
        changedTargets.add(targetSocketId);
      }

      if (followers.size === 0) {
        this.followersByTarget.delete(targetSocketId);
      }
    }

    this.broadcastParticipants({ includeSelf: true });

    for (const targetSocketId of changedTargets) {
      const followers = this.followersByTarget.get(targetSocketId) || new Set();
      this.send(targetSocketId, {
        type: "follow-room-change",
        payload: {
          followedBy: [...followers],
        },
      });
    }
  }

  private broadcastParticipants(opts: {
    joinedSocketId?: string;
    includeSelf: boolean;
  }) {
    this.pruneStaleParticipants();
    const participants = this.getParticipants();
    for (const socketId of this.sockets.keys()) {
      if (!opts.includeSelf && socketId === opts.joinedSocketId) {
        continue;
      }
      this.send(socketId, {
        type: "participants",
        payload: {
          participants,
          ...(opts.joinedSocketId
            ? { joinedSocketId: opts.joinedSocketId }
            : {}),
        },
      });
    }
  }

  private getParticipants() {
    return [...this.participants.values()].sort((left, right) =>
      left.connectedAt.localeCompare(right.connectedAt),
    );
  }

  private touchParticipant(socketId: string) {
    const participant = this.participants.get(socketId);
    if (!participant) {
      return;
    }

    this.participants.set(socketId, {
      ...participant,
      lastSeenAt: new Date().toISOString(),
    });
  }

  private pruneStaleParticipants() {
    const now = Date.now();

    for (const [socketId, participant] of this.participants.entries()) {
      if (
        now - new Date(participant.lastSeenAt).getTime() >
        STALE_PARTICIPANT_TTL_MS
      ) {
        this.removeParticipant(socketId, { closeSocket: true });
      }
    }
  }

  private send(socketId: string, message: ServerMessage) {
    const socket = this.sockets.get(socketId);
    if (!socket) {
      return;
    }

    try {
      socket.send(json(message));
    } catch {
      void this.handleClose(socketId);
    }
  }
}
