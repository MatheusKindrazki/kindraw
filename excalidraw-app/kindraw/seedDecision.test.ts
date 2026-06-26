import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { shouldSeed } from "./seedDecision";

// Reproduz a RACE de seed do editor colaborativo (doc markdown híbrido) e prova
// o fix: só o peer AUTORITATIVO (canSeed=true) semeia um Y.Doc vazio; o GUEST
// (canSeed=false) NUNCA semeia; e mesmo o dono NÃO sobrescreve conteúdo real que
// chegou (yjs-sync) antes do timer de seed disparar.

describe("shouldSeed (decisão pura de seed)", () => {
  const SEED = "# Payment Method\n\nconteúdo inicial";

  it("guest (canSeed=false) NUNCA semeia, mesmo com doc vazio e seed válido", () => {
    expect(
      shouldSeed({ isEmpty: true, canSeed: false, seedMarkdown: SEED }),
    ).toBe(false);
  });

  it("dono (canSeed=true) semeia quando o doc está vazio e há seed", () => {
    expect(
      shouldSeed({ isEmpty: true, canSeed: true, seedMarkdown: SEED }),
    ).toBe(true);
  });

  it("dono NÃO semeia se o doc já tem conteúdo (não está vazio)", () => {
    expect(
      shouldSeed({ isEmpty: false, canSeed: true, seedMarkdown: SEED }),
    ).toBe(false);
  });

  it("dono NÃO semeia se o seed é vazio/whitespace", () => {
    expect(shouldSeed({ isEmpty: true, canSeed: true, seedMarkdown: "" })).toBe(
      false,
    );
    expect(
      shouldSeed({ isEmpty: true, canSeed: true, seedMarkdown: "   \n  " }),
    ).toBe(false);
    expect(shouldSeed({ isEmpty: true, canSeed: true })).toBe(false);
  });
});

// Simula a lógica do efeito de seed em RichTextEditor: ao `onSynced` (que pode
// disparar num `yjs-init` prematuro com doc vazio), o seed é ADIADO por um tick
// e RE-CHECADO. Se conteúdo real chegar nesse meio-tempo (yjs-sync popula o doc),
// o re-check vê isEmpty=false e cancela o seed — mesmo para o dono.
describe("guarda de timing do seed (re-check após onSynced)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const SEED_DELAY = 200;

  // Helper que espelha o agendamento do efeito real: agenda um seed adiado que
  // só executa se, no momento do disparo, o doc ainda estiver vazio E o peer
  // puder semear.
  const scheduleSeed = ({
    canSeed,
    seedMarkdown,
    getIsEmpty,
    doSeed,
  }: {
    canSeed: boolean;
    seedMarkdown?: string;
    getIsEmpty: () => boolean;
    doSeed: () => void;
  }) => {
    const timer = setTimeout(() => {
      if (
        shouldSeed({ isEmpty: getIsEmpty(), canSeed, seedMarkdown })
      ) {
        doSeed();
      }
    }, SEED_DELAY);
    return () => clearTimeout(timer);
  };

  it("guest: onSynced com doc vazio NÃO semeia (canSeed=false)", () => {
    const doSeed = vi.fn();
    scheduleSeed({
      canSeed: false,
      seedMarkdown: "# Payment Method",
      getIsEmpty: () => true,
      doSeed,
    });
    vi.advanceTimersByTime(SEED_DELAY + 50);
    expect(doSeed).not.toHaveBeenCalled();
  });

  it("dono: doc fica vazio até o timer → semeia", () => {
    const doSeed = vi.fn();
    scheduleSeed({
      canSeed: true,
      seedMarkdown: "# Payment Method",
      getIsEmpty: () => true,
      doSeed,
    });
    vi.advanceTimersByTime(SEED_DELAY + 50);
    expect(doSeed).toHaveBeenCalledTimes(1);
  });

  it("dono: conteúdo real (yjs-sync) chega ANTES do timer → NÃO sobrescreve", () => {
    const doSeed = vi.fn();
    // doc começa vazio no onSynced, mas conteúdo real chega antes do timer.
    let empty = true;
    scheduleSeed({
      canSeed: true,
      seedMarkdown: "# Payment Method",
      getIsEmpty: () => empty,
      doSeed,
    });
    // yjs-sync do dono aplica conteúdo real ~100ms depois (antes dos 200ms).
    vi.advanceTimersByTime(100);
    empty = false; // Y.applyUpdate populou o doc
    vi.advanceTimersByTime(150); // passa do limite do timer
    expect(doSeed).not.toHaveBeenCalled();
  });

  it("unmount antes do timer cancela o seed agendado", () => {
    const doSeed = vi.fn();
    const cancel = scheduleSeed({
      canSeed: true,
      seedMarkdown: "# Payment Method",
      getIsEmpty: () => true,
      doSeed,
    });
    cancel();
    vi.advanceTimersByTime(SEED_DELAY + 50);
    expect(doSeed).not.toHaveBeenCalled();
  });
});
