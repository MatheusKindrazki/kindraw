const TIME_PREFIXES = {
  morning: ["Sunrise", "Daybreak", "Fresh", "Golden", "Soft"],
  afternoon: ["Bright", "Open", "Clear", "Swift", "Bold"],
  evening: ["Afterglow", "Copper", "Velvet", "Calm", "Amber"],
  night: ["Moonlit", "Nightshift", "Quiet", "Starlight", "Midnight"],
} as const;

const CANVAS_NOUNS = [
  "Sketch",
  "Board",
  "Map",
  "Flow",
  "Outline",
  "Canvas",
  "Session",
  "Draft",
] as const;

const TAG_SUFFIXES = [
  "Board",
  "Canvas",
  "Map",
  "Flow",
  "Session",
  "Draft",
] as const;

const slugScore = (value: string) =>
  [...value].reduce((sum, char) => sum + char.charCodeAt(0), 0);

const getTimeBucket = (date: Date) => {
  const hour = date.getHours();

  if (hour >= 5 && hour < 12) {
    return "morning";
  }

  if (hour >= 12 && hour < 18) {
    return "afternoon";
  }

  if (hour >= 18 && hour < 22) {
    return "evening";
  }

  return "night";
};

const normalizeTagName = (tagName: string) =>
  tagName
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, "");

export const generateKindrawCanvasTitle = (input?: {
  date?: Date;
  tagName?: string | null;
}) => {
  const date = input?.date || new Date();
  const tagName = input?.tagName ? normalizeTagName(input.tagName) : "";

  if (tagName) {
    const suffix =
      TAG_SUFFIXES[
        (date.getDate() + date.getMonth() + slugScore(tagName)) %
          TAG_SUFFIXES.length
      ];
    return `${tagName} ${suffix}`;
  }

  const bucket = getTimeBucket(date);
  const prefixes = TIME_PREFIXES[bucket];
  const prefix = prefixes[(date.getDate() + date.getHours()) % prefixes.length];
  const noun =
    CANVAS_NOUNS[(date.getMonth() + date.getMinutes()) % CANVAS_NOUNS.length];

  return `${prefix} ${noun}`;
};
