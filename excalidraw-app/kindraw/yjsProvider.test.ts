import { describe, expect, it } from "vitest";
import * as Y from "yjs";

// Valida o MECANISMO de sync Yjs em que o KindrawYjsProvider se apoia: o relay
// do DO repassa updates binários (base64) entre peers, e cada cliente aplica
// com Y.applyUpdate. Aqui simulamos o relay em memória (sem WebSocket) e
// confirmamos que dois Y.Docs convergem — incluindo um late-joiner que recebe
// o snapshot consolidado (Y.encodeStateAsUpdate), exatamente como o yjs-init.

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
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

describe("yjs sync mechanism (provider relay)", () => {
  it("converges two docs through base64 update relay", () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    // relay: quando A emite um update, B aplica (e vice-versa), via base64.
    docA.on("update", (update) => {
      Y.applyUpdate(docB, fromBase64(toBase64(update)));
    });
    docB.on("update", (update) => {
      Y.applyUpdate(docA, fromBase64(toBase64(update)));
    });

    docA.getText("default").insert(0, "Olá ");
    docB.getText("default").insert(4, "mundo");

    expect(docA.getText("default").toString()).toBe("Olá mundo");
    expect(docB.getText("default").toString()).toBe(docA.getText("default").toString());
  });

  it("late-joiner reconstructs state from a consolidated snapshot (yjs-init)", () => {
    const docA = new Y.Doc();
    docA.getText("default").insert(0, "documento existente");

    // snapshot consolidado que o DO persiste e envia no join (yjs-init)
    const snapshot = toBase64(Y.encodeStateAsUpdate(docA));

    // novo participante entra e aplica o snapshot
    const docLate = new Y.Doc();
    Y.applyUpdate(docLate, fromBase64(snapshot));

    expect(docLate.getText("default").toString()).toBe("documento existente");
  });
});
