# Kindraw Editor Package

This package powers the Kindraw editor and keeps the upstream `@excalidraw/excalidraw` API surface for compatibility.

## Installation

Use `npm` or `yarn` to install the package.

```bash
npm install react react-dom @excalidraw/excalidraw
# or
yarn add react react-dom @excalidraw/excalidraw
```

> **Note**: This fork currently preserves the upstream package name for compatibility with existing integrations.

#### Self-hosting fonts

By default, the editor will try to download the used fonts from the upstream CDN at [esm.run/@excalidraw/excalidraw/dist/prod](https://esm.run/@excalidraw/excalidraw/dist/prod).

For self-hosting purposes, you'll have to copy the content of the folder `node_modules/@excalidraw/excalidraw/dist/prod/fonts` to the path where your assets should be served from (i.e. `public/` directory in your project). In that case, you should also set `window.EXCALIDRAW_ASSET_PATH` to the very same path, i.e. `/` in case it's in the root:

```js
<script>window.EXCALIDRAW_ASSET_PATH = "/";</script>
```

### Dimensions

The editor takes _100%_ of the containing block's `width` and `height`, so make sure the host container has non-zero dimensions.

## Demo

Use the live Kindraw app at [kindraw.dev](https://kindraw.dev).

## Integration

The fork keeps the upstream component API, so the upstream integration docs remain useful:

- [Integration guide](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/integration)
- [API reference](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api)

## Contributing

Repository-level contribution notes live in the root [README](../../README.md).
