// Generative engineering board recipes: a thin, PURE mapper layer over the
// existing composeHybrid. A board TYPE + a typed payload deterministically maps
// to { title, markdown, diagram } and runs through composeHybrid → buildScene.
// This is "describe a board → it materializes", scoped to the artifacts
// engineers actually produce (ADR, C4, sequence) — Miro's template gallery, but
// generated from a prompt and emitted as a reviewable, diffable spec.
//
// Correctness-by-construction: a `DocBuilder.section(title, body)` records the
// canonical heading and RETURNS it; the recipe uses that exact return value as a
// node's `linkToHeading`. Heading text and link string are the SAME value, so
// doc↔canvas drift is impossible. composeHybrid's unmatchedHeadings then only
// fires on real payload pathologies (e.g. duplicate names), which the MCP reply
// surfaces for the LLM to self-correct.

import { composeHybrid } from "../hybrid.js";

import type {
  ComposeHybridResult,
  HybridDiagram,
  HybridDiagramNode,
} from "../hybrid.js";
import type { KindrawClient } from "../client.js";

export type BoardType =
  | "adr"
  | "c4-context"
  | "sequence"
  | "runbook"
  | "rfc"
  | "data-model";

export type BoardRecipeOutput = {
  title: string;
  markdown: string;
  diagram: HybridDiagram;
};

export type BoardRecipe<P> = {
  type: BoardType;
  title: string;
  summary: string;
  build: (payload: P) => BoardRecipeOutput;
};

export type ComposeBoardInput = {
  type: BoardType;
  payload: unknown;
  folderId?: string | null;
};

export type ComposeBoardResult = ComposeHybridResult & { boardType: BoardType };

// Collapse a free-form title into a clean, single-line markdown heading. Strips
// `#`/CR/LF (so the parser sees one heading) and collapses runs of whitespace,
// so the heading text the recipe links to exactly matches what the parser keys.
const sanitizeHeading = (title: string): string =>
  title
    .replace(/[#\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Single source of truth for a board's doc sections. `section()` returns the
 * canonical heading string a node must use as its `linkToHeading`, making
 * doc↔canvas drift impossible by construction. Throws on a duplicate title
 * (composeHybrid would otherwise silently leave the later one unlinkable).
 */
export class DocBuilder {
  private parts: string[] = [];
  private readonly titles = new Set<string>();

  lead(markdown: string): this {
    const body = markdown.trim();
    if (body) {
      this.parts.push(body);
    }
    return this;
  }

  section(title: string, body: string): string {
    const heading = sanitizeHeading(title);
    if (!heading) {
      throw new Error("Board section title must be non-empty.");
    }
    if (this.titles.has(heading)) {
      throw new Error(`Duplicate board section title: "${heading}".`);
    }
    this.titles.add(heading);
    this.parts.push(`# ${heading}\n\n${body.trim()}`);
    return heading;
  }

  markdown(): string {
    return this.parts.join("\n\n");
  }
}

// ---------------- Recipes ----------------

export type AdrPayload = {
  title: string;
  status?: string;
  context: string;
  decision: string;
  consequences: string;
  alternatives?: Array<{ name: string; note?: string }>;
};

const adr: BoardRecipe<AdrPayload> = {
  type: "adr",
  title: "Architecture Decision Record",
  summary:
    "Context → Decision → Consequences flow with alternatives as branching diamonds, each node deep-linked to its doc section.",
  build: (p) => {
    const doc = new DocBuilder();
    doc.lead(`> **Status:** ${p.status ?? "Proposed"}`);
    const ctx = doc.section("Context", p.context);
    const dec = doc.section("Decision", p.decision);
    const con = doc.section("Consequences", p.consequences);

    const nodes: HybridDiagramNode[] = [
      { id: "ctx", label: "Context", linkToHeading: ctx },
      { id: "dec", label: "Decision", shape: "diamond", linkToHeading: dec },
      { id: "con", label: "Consequences", linkToHeading: con },
    ];
    const edges = [
      { from: "ctx", to: "dec" },
      { from: "dec", to: "con" },
    ];
    (p.alternatives ?? []).forEach((alt, i) => {
      const sec = doc.section(`Alternative: ${alt.name}`, alt.note ?? "—");
      nodes.push({
        id: `alt-${i}`,
        label: alt.name,
        shape: "diamond",
        linkToHeading: sec,
      });
      edges.push({ from: "dec", to: `alt-${i}` });
    });

    return {
      title: p.title,
      markdown: doc.markdown(),
      diagram: { nodes, edges, direction: "TB" },
    };
  },
};

export type C4ContextPayload = {
  title: string;
  system: { name: string; description?: string };
  users?: Array<{ name: string; note?: string }>;
  externalSystems?: Array<{ name: string; note?: string }>;
};

const c4Context: BoardRecipe<C4ContextPayload> = {
  type: "c4-context",
  title: "C4 System Context",
  summary:
    "The system in the center, its users and external systems around it, wrapped in a labeled boundary frame (LR).",
  build: (p) => {
    const doc = new DocBuilder();
    const sysSec = doc.section(
      p.system.name,
      p.system.description ?? "The system under design.",
    );
    const nodes: HybridDiagramNode[] = [
      {
        id: "sys",
        label: p.system.name,
        group: "boundary",
        linkToHeading: sysSec,
      },
    ];
    const edges: HybridDiagram["edges"] = [];
    (p.users ?? []).forEach((u, i) => {
      const sec = doc.section(u.name, u.note ?? "A user of the system.");
      nodes.push({
        id: `usr-${i}`,
        label: u.name,
        shape: "ellipse",
        linkToHeading: sec,
      });
      edges.push({ from: `usr-${i}`, to: "sys", label: "uses" });
    });
    (p.externalSystems ?? []).forEach((s, i) => {
      const sec = doc.section(s.name, s.note ?? "An external system.");
      nodes.push({ id: `ext-${i}`, label: s.name, linkToHeading: sec });
      edges.push({
        from: "sys",
        to: `ext-${i}`,
        label: "calls",
        style: "dashed",
      });
    });

    return {
      title: p.title,
      markdown: doc.markdown(),
      diagram: {
        nodes,
        edges,
        groups: [{ id: "boundary", label: `${p.system.name} — boundary` }],
        direction: "LR",
      },
    };
  },
};

export type SequencePayload = {
  title: string;
  summary?: string;
  participants: Array<{ name: string; note?: string }>;
  steps: Array<{ from: string; to: string; label: string }>;
};

const sequence: BoardRecipe<SequencePayload> = {
  type: "sequence",
  title: "Sequence / Flow",
  summary:
    "Participants laid left-to-right with ordered, labeled interactions between them, each participant deep-linked to its doc section.",
  build: (p) => {
    const doc = new DocBuilder();
    if (p.summary) {
      doc.lead(p.summary);
    }
    const idByName = new Map<string, string>();
    const nodes: HybridDiagramNode[] = p.participants.map((part, i) => {
      const id = `actor-${i}`;
      idByName.set(part.name, id);
      const sec = doc.section(part.name, part.note ?? "A participant.");
      return { id, label: part.name, linkToHeading: sec };
    });
    const resolve = (name: string): string => {
      const id = idByName.get(name);
      if (!id) {
        throw new Error(
          `Sequence step references unknown participant "${name}".`,
        );
      }
      return id;
    };
    const edges = p.steps.map((s) => ({
      from: resolve(s.from),
      to: resolve(s.to),
      label: s.label,
    }));

    return {
      title: p.title,
      markdown: doc.markdown(),
      diagram: { nodes, edges, direction: "LR" },
    };
  },
};

export type RunbookPayload = {
  title: string;
  alert: string;
  steps: Array<{ name: string; detail?: string; decision?: boolean }>;
};

const runbook: BoardRecipe<RunbookPayload> = {
  type: "runbook",
  title: "On-call Runbook",
  summary:
    "An incident flow from the alert through ordered triage/mitigation steps (decisions as diamonds), each step deep-linked to its doc section.",
  build: (p) => {
    const doc = new DocBuilder();
    const alertSec = doc.section("Alert", p.alert);
    const nodes: HybridDiagramNode[] = [
      {
        id: "alert",
        label: "Alert",
        shape: "ellipse",
        linkToHeading: alertSec,
      },
    ];
    const edges: HybridDiagram["edges"] = [];
    let prev = "alert";
    p.steps.forEach((s, i) => {
      const sec = doc.section(s.name, s.detail ?? "—");
      const id = `step-${i}`;
      nodes.push({
        id,
        label: s.name,
        shape: s.decision ? "diamond" : "rectangle",
        linkToHeading: sec,
      });
      edges.push({ from: prev, to: id });
      prev = id;
    });

    return {
      title: p.title,
      markdown: doc.markdown(),
      diagram: { nodes, edges, direction: "TB" },
    };
  },
};

export type RfcPayload = {
  title: string;
  summary: string;
  motivation: string;
  proposal: string;
  alternatives?: Array<{ name: string; note?: string }>;
  risks?: string;
  rollout?: string;
};

const rfc: BoardRecipe<RfcPayload> = {
  type: "rfc",
  title: "RFC",
  summary:
    "Summary/Motivation/Proposal/Risks/Rollout doc with a proposal flow on the canvas and alternatives branching off, each node deep-linked.",
  build: (p) => {
    const doc = new DocBuilder();
    doc.section("Summary", p.summary);
    const mot = doc.section("Motivation", p.motivation);
    const prop = doc.section("Proposal", p.proposal);
    const nodes: HybridDiagramNode[] = [
      { id: "mot", label: "Motivation", linkToHeading: mot },
      { id: "prop", label: "Proposal", linkToHeading: prop },
    ];
    const edges: HybridDiagram["edges"] = [{ from: "mot", to: "prop" }];
    let tail = "prop";
    if (p.risks) {
      const sec = doc.section("Risks", p.risks);
      nodes.push({
        id: "risk",
        label: "Risks",
        shape: "diamond",
        linkToHeading: sec,
      });
      edges.push({ from: "prop", to: "risk" });
      tail = "risk";
    }
    if (p.rollout) {
      const sec = doc.section("Rollout", p.rollout);
      nodes.push({ id: "rollout", label: "Rollout", linkToHeading: sec });
      edges.push({ from: tail, to: "rollout" });
    }
    (p.alternatives ?? []).forEach((alt, i) => {
      const sec = doc.section(`Alternative: ${alt.name}`, alt.note ?? "—");
      nodes.push({
        id: `alt-${i}`,
        label: alt.name,
        shape: "diamond",
        linkToHeading: sec,
      });
      edges.push({ from: "prop", to: `alt-${i}`, style: "dashed" });
    });

    return {
      title: p.title,
      markdown: doc.markdown(),
      diagram: { nodes, edges, direction: "TB" },
    };
  },
};

export type DataModelPayload = {
  title: string;
  entities: Array<{ name: string; fields?: string[]; note?: string }>;
  relationships?: Array<{ from: string; to: string; label?: string }>;
};

const dataModel: BoardRecipe<DataModelPayload> = {
  type: "data-model",
  title: "Data Model / ERD",
  summary:
    "Entities as boxes with their fields documented per section, connected by cardinality-labeled relationship edges (LR).",
  build: (p) => {
    const doc = new DocBuilder();
    const idByName = new Map<string, string>();
    const nodes: HybridDiagramNode[] = p.entities.map((e, i) => {
      const id = `ent-${i}`;
      idByName.set(e.name, id);
      const fields = e.fields?.length
        ? e.fields.map((f) => `- ${f}`).join("\n")
        : "";
      const body = [fields, e.note].filter(Boolean).join("\n\n") || "—";
      const sec = doc.section(e.name, body);
      return { id, label: e.name, linkToHeading: sec };
    });
    const resolve = (name: string): string => {
      const id = idByName.get(name);
      if (!id) {
        throw new Error(`Relationship references unknown entity "${name}".`);
      }
      return id;
    };
    const edges = (p.relationships ?? []).map((r) => ({
      from: resolve(r.from),
      to: resolve(r.to),
      ...(r.label ? { label: r.label } : {}),
    }));

    return {
      title: p.title,
      markdown: doc.markdown(),
      diagram: { nodes, edges, direction: "LR" },
    };
  },
};

export const BOARD_RECIPES: Record<BoardType, BoardRecipe<never>> = {
  adr,
  "c4-context": c4Context,
  sequence,
  runbook,
  rfc,
  "data-model": dataModel,
};

export const listBoards = (): Array<{
  type: BoardType;
  title: string;
  summary: string;
}> =>
  (Object.keys(BOARD_RECIPES) as BoardType[]).map((type) => {
    const r = BOARD_RECIPES[type] as BoardRecipe<unknown>;
    return { type, title: r.title, summary: r.summary };
  });

/**
 * Build an engineering board from a typed payload and seed it as a doc+canvas
 * hybrid. Returns composeHybrid's result (incl. unmatchedHeadings/linkableHeadings
 * for self-correction) tagged with the board type.
 */
export const composeBoard = async (
  client: KindrawClient,
  input: ComposeBoardInput,
): Promise<ComposeBoardResult> => {
  const recipe = BOARD_RECIPES[input.type] as BoardRecipe<unknown> | undefined;
  if (!recipe) {
    throw new Error(`Unknown board type "${input.type}".`);
  }
  const out = recipe.build(input.payload);
  const res = await composeHybrid(client, {
    title: out.title,
    markdown: out.markdown,
    folderId: input.folderId ?? null,
    diagram: out.diagram,
  });
  return { ...res, boardType: input.type };
};
