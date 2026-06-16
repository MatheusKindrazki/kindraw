import { KindrawApiError } from "@kindraw/client";

import { login, logout } from "./commands/login.js";
import { generate } from "./commands/generate.js";
import { docCreate } from "./commands/doc.js";
import { hybridCreate } from "./commands/hybrid.js";
import { itemsList, itemsGet, itemsDelete, whoami } from "./commands/items.js";

const HELP = `kindraw — create drawings in your Kindraw workspace from the terminal

Usage:
  kindraw login [--base-url <url>]      Connect with GitHub (opens browser)
  kindraw logout                        Remove local credentials
  kindraw whoami                        Show the logged-in account
  kindraw generate --mermaid <file|->   Create a drawing from a Mermaid diagram
                   --spec <file|->      ...or from a structured node/edge spec
                  [--title <title>]
  kindraw doc create --md <file|->      Create a markdown doc
                    --title <title>
                   [--folder <id>]
  kindraw hybrid create --title <T>     Create a doc + canvas hybrid
                       [--md <file|->] [--spec <file|->] [--folder <id>]
  kindraw items list [--json]           List your drawings/docs
  kindraw items get <id> [--json]       Show one item
  kindraw items delete <id>             Delete an item

Env:
  KINDRAW_TOKEN           API token (overrides saved login)
  KINDRAW_API_BASE_URL    API base URL (default https://api.kindraw.dev)
`;

// Minimal flag parser: collects --key value / --key=value / --flag (boolean)
// and leaves bare tokens as positionals.
const parse = (argv: string[]) => {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const body = token.slice(2);
      const eq = body.indexOf("=");
      if (eq >= 0) {
        flags[body.slice(0, eq)] = body.slice(eq + 1);
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        flags[body] = argv[++i];
      } else {
        flags[body] = true;
      }
    } else {
      positionals.push(token);
    }
  }
  return { positionals, flags };
};

const str = (v: string | boolean | undefined): string | undefined =>
  typeof v === "string" ? v : undefined;

const main = async () => {
  const { positionals, flags } = parse(process.argv.slice(2));
  const [command, sub, arg] = positionals;

  if (!command || flags.help || command === "help") {
    console.log(HELP);
    return;
  }

  switch (command) {
    case "login":
      return login({ baseUrl: str(flags["base-url"]) });
    case "logout":
      return logout();
    case "whoami":
      return whoami();
    case "generate":
      return generate({
        mermaid: str(flags.mermaid),
        spec: str(flags.spec),
        title: str(flags.title),
      });
    case "doc": {
      if (sub === "create") {
        return docCreate({
          md: str(flags.md),
          title: str(flags.title),
          folder: str(flags.folder),
        });
      }
      throw new Error(`Unknown doc command: ${sub ?? "(none)"}`);
    }
    case "hybrid": {
      if (sub === "create") {
        return hybridCreate({
          title: str(flags.title),
          md: str(flags.md),
          spec: str(flags.spec),
          folder: str(flags.folder),
        });
      }
      throw new Error(`Unknown hybrid command: ${sub ?? "(none)"}`);
    }
    case "items": {
      if (sub === "list") {
        return itemsList({ json: flags.json === true });
      }
      if (sub === "get") {
        return itemsGet({ id: arg, json: flags.json === true });
      }
      if (sub === "delete") {
        return itemsDelete({ id: arg });
      }
      throw new Error(`Unknown items command: ${sub ?? "(none)"}`);
    }
    default:
      throw new Error(`Unknown command: ${command}`);
  }
};

main().catch((error: unknown) => {
  if (error instanceof KindrawApiError) {
    console.error(`Error (${error.status}): ${error.message}`);
  } else if (error instanceof Error) {
    console.error(`Error: ${error.message}`);
  } else {
    console.error(error);
  }
  process.exit(1);
});
