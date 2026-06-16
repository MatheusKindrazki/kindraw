// Decisão pura de "semear" (seed) um Y.Doc colaborativo VAZIO com o markdown
// inicial. Extraído como helper puro para ser testável fora do React/Tiptap.
//
// REGRA: só um peer AUTORITATIVO (o dono/editor autenticado com permissão de
// escrita) pode semear. O convidado (guest) NUNCA semeia — ele só recebe o
// estado já sincronizado. Isso evita a RACE de seed em que um `yjs-init` com
// `update: null` (DO reciclado / room novo) dispara `onSynced` com o doc ainda
// vazio e o guest semearia o snapshot REST estável (ex.: só "# Payment Method"),
// colidindo com o conteúdo bom do dono.

export type ShouldSeedInput = {
  // O Y.Doc está VAZIO neste instante? (editor.state.doc.textContent vazio)
  isEmpty: boolean;
  // Este peer tem permissão para semear? (dono/editor autenticado com escrita)
  canSeed: boolean;
  // Markdown inicial para popular o doc vazio.
  seedMarkdown?: string;
};

// Decisão síncrona: só semeia se o doc está vazio, este peer é autoritativo, e
// há markdown não-vazio para semear. Qualquer um dos três falso → não semeia.
export const shouldSeed = ({
  isEmpty,
  canSeed,
  seedMarkdown,
}: ShouldSeedInput): boolean =>
  isEmpty &&
  canSeed &&
  typeof seedMarkdown === "string" &&
  seedMarkdown.trim().length > 0;
