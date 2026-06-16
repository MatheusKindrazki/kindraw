// Turn picked Iconify icon ids into Excalidraw image skeletons + a matching
// `files` map, to be merged into a scene (via buildScene's iconImages/files
// extras). FETCH-FREE: the caller INJECTS a getIconSvg-shaped callback so this
// module (and all of scene/) never imports the HTTP client. fileId is a
// DETERMINISTIC hash of iconId+color (NOT randomId) so the serialized scene
// stays snapshot-stable. We ATOMICALLY emit the files entry alongside every
// image element — a dangling fileId renders a broken image, so a fetch failure
// emits NEITHER the image NOR a file (skip-with-warning, never abort).

export type IconPlacement = {
  iconId: string;
  /** Place the icon at this node's top-left if positions[nodeId] is known. */
  nodeId?: string;
  color?: string;
};

export type ComposeIconImagesResult = {
  /** Image skeletons to pass as buildScene's `iconImages`. */
  imageSkeletons: Array<Record<string, unknown>>;
  /** Files map to merge into buildScene's `files`. */
  files: Record<string, unknown>;
  /** iconIds that failed to fetch (skipped, not fatal). */
  warnings: string[];
};

// Tiny stable string hash (FNV-1a) -> 8 hex chars. Deterministic,
// dependency-free, and identical across runs (no randomId) so two builds of the
// same icon+color produce the same fileId and the scene snapshot is stable.
const stableHash = (value: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
};

const DEFAULT_ICON_SIZE = 28;
const GRID_STEP = 48;
const GRID_COLS = 8;

export const composeIconImages = async (
  placements: IconPlacement[],
  getIconSvg: (id: string, color?: string) => Promise<string>,
  opts?: { positions?: Record<string, { x: number; y: number }> },
): Promise<ComposeIconImagesResult> => {
  const imageSkeletons: Array<Record<string, unknown>> = [];
  const files: Record<string, unknown> = {};
  const warnings: string[] = [];

  let gridIndex = 0;
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i];
    let svg: string;
    try {
      svg = await getIconSvg(p.iconId, p.color);
    } catch {
      // Skip-with-warning: a 404/invalid icon must not abort the whole scene.
      warnings.push(p.iconId);
      continue;
    }

    const fileId = `icon-${stableHash(`${p.iconId}|${p.color ?? ""}`)}`;
    const b64 = Buffer.from(svg, "utf8").toString("base64");
    // Atomic: add the files entry whenever (and only when) we emit an image.
    files[fileId] = {
      id: fileId,
      mimeType: "image/svg+xml",
      dataURL: `data:image/svg+xml;base64,${b64}`,
      created: 1, // stabilized
    };

    const placed = p.nodeId ? opts?.positions?.[p.nodeId] : undefined;
    const pos = placed ?? {
      x: (gridIndex % GRID_COLS) * GRID_STEP,
      y: Math.floor(gridIndex / GRID_COLS) * GRID_STEP,
    };
    if (!placed) {
      gridIndex += 1;
    }

    imageSkeletons.push({
      type: "image",
      id: `icon-${i}`,
      fileId,
      status: "saved",
      x: pos.x,
      y: pos.y,
      width: DEFAULT_ICON_SIZE,
      height: DEFAULT_ICON_SIZE,
    });
  }

  return { imageSkeletons, files, warnings };
};
