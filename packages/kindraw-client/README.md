# @kindraw/client

Node client for the [Kindraw](https://kindraw.dev) public API, plus optional
Mermaid→Excalidraw generation. Shared by `@kindraw/cli` and `@kindraw/mcp`.

## Install

```bash
npm i @kindraw/client
```

## HTTP client

```ts
import { KindrawClient } from "@kindraw/client";

const client = new KindrawClient({ token: process.env.KINDRAW_TOKEN! });

await client.whoami();
await client.listItems();
const { url } = await client.createDrawing({ title: "My drawing", content });
```

## Mermaid → Excalidraw (opt-in)

The generation pipeline (mermaid + jsdom + canvas) lives in a separate subpath
so plain CRUD stays lightweight:

```ts
import { generateExcalidrawFromMermaid } from "@kindraw/client/generate";

const { content } = await generateExcalidrawFromMermaid("graph TD; A --> B");
const { url } = await client.createDrawing({ title: "Flow", content });
```

## OAuth loopback

```ts
import { startLoopbackLogin } from "@kindraw/client";

const { secret } = await startLoopbackLogin(); // opens browser, returns a PAT
```

Requires Node 18+. `KINDRAW_API_BASE_URL` defaults to `https://api.kindraw.dev`.
