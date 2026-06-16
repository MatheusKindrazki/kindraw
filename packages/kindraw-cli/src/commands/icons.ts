import fs from "node:fs";
import path from "node:path";

import { requireClient } from "../client.js";

// `kindraw icons search <query> [--limit N] [--json]`
export const iconsSearch = async (args: {
  query?: string;
  limit?: string;
  json?: boolean;
}): Promise<void> => {
  if (!args.query) {
    throw new Error("Usage: kindraw icons search <query> [--limit N] [--json]");
  }
  const client = requireClient();
  const limit = args.limit ? Number(args.limit) : 48;
  const { icons } = await client.searchIcons(args.query, limit);
  if (args.json) {
    console.log(JSON.stringify(icons, null, 2));
    return;
  }
  if (!icons.length) {
    console.log(`No icons found for "${args.query}".`);
    return;
  }
  for (const i of icons) {
    console.log(`${i.id}\t${i.set}/${i.name}`);
  }
};

// `kindraw icons svg <id> [--color #hex] [--out file]`
// Fetches one raw SVG (via requestText). With --out, writes the SVG to a file;
// otherwise prints it to stdout. The id is validated client-side by getIconSvg.
export const iconsSvg = async (args: {
  id?: string;
  color?: string;
  out?: string;
}): Promise<void> => {
  if (!args.id) {
    throw new Error(
      "Usage: kindraw icons svg <id> [--color #hex] [--out file]",
    );
  }
  const client = requireClient();
  const svg = await client.getIconSvg(args.id, args.color);
  if (args.out) {
    // Contain --out to the current working directory: an attacker-supplied path
    // (e.g. "../../etc/cron.d/x" or "/etc/passwd") must not let us write outside
    // CWD. Resolve against CWD and require the result to stay inside it, and
    // refuse to clobber an existing file (no silent overwrite). (Security MEDIUM.)
    const target = path.resolve(process.cwd(), args.out);
    if (
      target !== process.cwd() &&
      !target.startsWith(process.cwd() + path.sep)
    ) {
      throw new Error(
        `--out must stay within the current directory: ${args.out}`,
      );
    }
    if (fs.existsSync(target)) {
      throw new Error(
        `Refusing to overwrite existing file: ${target} (remove it first).`,
      );
    }
    fs.writeFileSync(target, svg, "utf8");
    console.log(`Wrote ${target}`);
    return;
  }
  console.log(svg);
};
