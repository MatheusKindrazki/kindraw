import { requireClient } from "../client.js";
import { MAX_TITLE_LEN, readSource } from "./generate.js";

const USAGE =
  "Usage: kindraw doc create --md <file|-> --title <T> [--folder <id>]";

// `kindraw doc create --md <file|-> --title T [--folder ID]`
// Reads raw markdown (bounded by MAX_SPEC_BYTES via readSource) and creates a
// doc. Prints the canonical /doc/<id> URL (built client-side, verified C3).
export const docCreate = async (args: {
  md?: string;
  title?: string;
  folder?: string;
}): Promise<void> => {
  if (!args.md) {
    throw new Error(`Provide --md <file|->.\n${USAGE}`);
  }
  if (!args.title) {
    throw new Error(`Provide --title.\n${USAGE}`);
  }
  const content = readSource(args.md);
  const title =
    args.title.length > MAX_TITLE_LEN
      ? args.title.slice(0, MAX_TITLE_LEN)
      : args.title;

  const client = requireClient();
  const result = await client.createDoc({
    title,
    content,
    folderId: args.folder ?? null,
  });
  console.log(`Created doc "${title}"`);
  console.log(result.url);
};
