import { requireClient } from "../client.js";

export const itemsList = async (args: { json?: boolean }): Promise<void> => {
  const client = requireClient();
  const { items } = await client.listItems();
  if (args.json) {
    console.log(JSON.stringify(items, null, 2));
    return;
  }
  if (!items.length) {
    console.log("No items yet.");
    return;
  }
  for (const item of items) {
    console.log(
      `${item.id}  ${item.kind.padEnd(7)}  ${item.title}`,
    );
  }
};

export const itemsGet = async (args: {
  id?: string;
  json?: boolean;
}): Promise<void> => {
  if (!args.id) {
    throw new Error("Usage: kindraw items get <id> [--json]");
  }
  const client = requireClient();
  const { item, content } = await client.getItem(args.id);
  if (args.json) {
    console.log(JSON.stringify({ item, content }, null, 2));
    return;
  }
  console.log(`${item.title} (${item.kind}) — ${item.id}`);
  console.log(`${content.length} bytes of content`);
};

export const itemsDelete = async (args: { id?: string }): Promise<void> => {
  if (!args.id) {
    throw new Error("Usage: kindraw items delete <id>");
  }
  const client = requireClient();
  await client.deleteItem(args.id);
  console.log(`Deleted ${args.id}`);
};

export const whoami = async (): Promise<void> => {
  const client = requireClient();
  const me = await client.whoami();
  console.log(`${me.user.githubLogin} (${me.user.name}) — scope: ${me.scope}`);
};
