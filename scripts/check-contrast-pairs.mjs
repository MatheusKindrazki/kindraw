#!/usr/bin/env node
/**
 * Gate de contraste PAR a PAR para o shell Kindraw.
 *
 * O `.impeccable.md` declara um piso de 4.5:1 (WCAG AA) para todo token usado
 * como `color:`. Medir o token contra as três superfícies base NÃO basta: o
 * texto quase sempre pousa sobre um FUNDO PAREADO (--kd-ok-bg, --kd-live-bg)
 * ou sobre um fundo hardcoded. Foi assim que três pares reprovados passaram
 * despercebidos enquanto todos os tokens, isoladamente, estavam verdes.
 *
 * Este script resolve os dois lados de verdade — token, fallback de var(),
 * rgba composto sobre as superfícies plausíveis — e mede o par.
 *
 *   node scripts/check-contrast-pairs.mjs          # relatório; sai 1 se reprovar
 *   node scripts/check-contrast-pairs.mjs --json   # o mesmo, para automação
 */

/* eslint-disable no-console -- este script É um relatório de CLI: o stdout é o
   produto dele, não um vestígio de depuração esquecido. */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, basename } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const TOKENS_FILE = "excalidraw-app/kindraw/kindraw.scss";

/** Superfícies sobre as quais um fundo translúcido pode pousar. */
const SURFACES = ["#faf6ef", "#ffffff", "#fffdf8", "#fcf8ee"];

/**
 * Isenções declaradas. Cada uma precisa de MOTIVO — uma isenção sem motivo é
 * indistinguível de um bug varrido para debaixo do tapete.
 */
const EXEMPT = [
  {
    selector: ".kindraw-card__check",
    reason:
      "checkbox vazio: `color` pinta o glifo de check, que só é visível no estado --on (fundo âmbar). Branco sobre branco no estado off é o desenho de um checkbox desmarcado, não texto ilegível.",
  },
];

const lin = (c) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};

const luminance = (hex) => {
  let h = hex.replace("#", "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((x) => x + x)
      .join("");
  }
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

const ratio = (a, b) => {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

const composite = ([r, g, b, a], bgHex) => {
  const h = bgHex.replace("#", "");
  const [br, bg, bb] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (f, k) => Math.round(f * a + k * (1 - a));
  return `#${[mix(r, br), mix(g, bg), mix(b, bb)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
};

function loadTokens() {
  const src = readFileSync(join(ROOT, TOKENS_FILE), "utf8");
  const start = src.indexOf(":root {");
  const block = src.slice(start, src.indexOf("\n}", start));
  const out = {};
  for (const m of block.matchAll(/--(kd-[a-z0-9-]+):\s*([^;]+);/g)) {
    out[m[1]] = m[2].trim();
  }
  return out;
}

/** -> {kind:'hex',value} | {kind:'rgba',value:[r,g,b,a]} | null */
function resolve(raw, tokens, depth = 0) {
  if (!raw || depth > 6) {
    return null;
  }
  const val = raw.trim();

  const v = val.match(/^var\(\s*--([a-z0-9-]+)\s*(?:,\s*([\s\S]+?)\s*)?\)$/);
  if (v) {
    const [, name, fallback] = v;
    if (tokens[name]) {
      return resolve(tokens[name], tokens, depth + 1);
    }
    return fallback ? resolve(fallback, tokens, depth + 1) : null;
  }

  const hex = val.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) {
      h = h
        .split("")
        .map((x) => x + x)
        .join("");
    }
    return { kind: "hex", value: `#${h.toLowerCase()}` };
  }

  const rgba = val.match(
    /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)$/,
  );
  if (rgba) {
    const [r, g, b] = [1, 2, 3].map((i) => Number(rgba[i]));
    const a = rgba[4] ? Number(rgba[4]) : 1;
    return a < 1
      ? { kind: "rgba", value: [r, g, b, a] }
      : {
          kind: "hex",
          value: `#${[r, g, b]
            .map((x) => x.toString(16).padStart(2, "0"))
            .join("")}`,
        };
  }
  return null;
}

function* scssFiles(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "build" || entry === "dist") {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* scssFiles(full);
    } else if (entry.endsWith(".scss")) {
      yield full;
    }
  }
}

function main() {
  const json = process.argv.includes("--json");
  const tokens = loadTokens();
  const problems = [];
  const exempted = [];
  let measured = 0;

  for (const file of scssFiles(join(ROOT, "excalidraw-app"))) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = m[1].trim().split("\n").pop().trim();
      const body = m[2];
      const line = src.slice(0, m.index).split("\n").length;

      const cm = body.match(/(?<![-\w])color:\s*([^;]+);/);
      const bm = body.match(/background(?:-color)?:\s*([^;]+);/);
      if (!cm || !bm) {
        continue;
      }

      const fg = resolve(cm[1], tokens);
      const bg = resolve(bm[1], tokens);
      if (!fg || !bg || fg.kind === "rgba") {
        continue;
      }

      const fs = body.match(/font-size:\s*([\d.]+)px/);
      const fw = body.match(/font-weight:\s*(\d+)/);
      const size = fs ? Number(fs[1]) : null;
      const weight = fw ? Number(fw[1]) : 400;
      const isLarge =
        size !== null && (size >= 24 || (size >= 18.66 && weight >= 700));
      const floor = isLarge ? 3.0 : 4.5;

      let bgHex = bg.value;
      let note = "";
      if (bg.kind === "rgba") {
        let worst = null;
        for (const s of SURFACES) {
          const c = composite(bg.value, s);
          if (worst === null || ratio(fg.value, c) < ratio(fg.value, worst.c)) {
            worst = { c, s };
          }
        }
        bgHex = worst.c;
        note = `rgba composto sobre ${worst.s}`;
      }

      measured++;
      const r = ratio(fg.value, bgHex);
      if (r >= floor) {
        continue;
      }

      const ex = EXEMPT.find((e) => selector.includes(e.selector));
      const rec = {
        file: relative(ROOT, file),
        line,
        selector,
        fg: fg.value,
        bg: bgHex,
        ratio: Number(r.toFixed(2)),
        floor,
        size,
        weight,
        note,
      };
      if (ex) {
        exempted.push({ ...rec, reason: ex.reason });
      } else {
        problems.push(rec);
      }
    }
  }

  if (json) {
    console.log(JSON.stringify({ measured, problems, exempted }, null, 2));
    return problems.length ? 1 : 0;
  }

  console.log(`pares texto×fundo resolvidos e medidos: ${measured}`);
  if (exempted.length) {
    console.log(`\nisentos (com motivo declarado): ${exempted.length}`);
    for (const e of exempted) {
      console.log(
        `  ${basename(e.file)}:${e.line} ${e.selector} — ${e.reason}`,
      );
    }
  }
  if (!problems.length) {
    console.log("\nGATE DE PARES: VERDE");
    return 0;
  }
  console.log(`\nGATE DE PARES: ${problems.length} reprovação(ões)\n`);
  for (const p of problems.sort((a, b) => a.ratio - b.ratio)) {
    const px = p.size ? `${p.size}px/${p.weight}` : "tamanho herdado";
    console.log(
      `  ${String(p.ratio).padStart(5)}:1 (piso ${p.floor})  ${basename(
        p.file,
      )}:${p.line}`,
    );
    console.log(`      ${p.selector}`);
    console.log(`      texto ${p.fg} sobre ${p.bg}  [${px}] ${p.note}`);
  }
  return 1;
}

process.exit(main());
