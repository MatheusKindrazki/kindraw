# Project coding standards

## Generic Communication Guidelines

- Be succint and be aware that expansive generative AI answers are costly and slow
- Avoid providing explanations, trying to teach unless asked for, your chat partner is an expert
- Stop apologising if corrected, just provide the correct information or code
- Prefer code unless asked for explanation
- Stop summarizing what you've changed after modifications unless asked for

## TypeScript Guidelines

- Use TypeScript for all new code
- Where possible, prefer implementations without allocation
- When there is an option, opt for more performant solutions and trade RAM usage for less CPU cycles
- Prefer immutable data (const, readonly)
- Use optional chaining (?.) and nullish coalescing (??) operators

## React Guidelines

- Use functional components with hooks
- Follow the React hooks rules (no conditional hooks)
- Keep components small and focused
- Use CSS modules for component styling

## Naming Conventions

- Use PascalCase for component names, interfaces, and type aliases
- Use camelCase for variables, functions, and methods
- Use ALL_CAPS for constants

## Error Handling

- Use try/catch blocks for async operations
- Implement proper error boundaries in React components
- Always log errors with contextual information

## Testing

- Always attempt to fix #problems
- Always offer to run `yarn test:app` in the project root after modifications are complete and attempt fixing the issues reported

## Types

- Always include `packages/math/src/types.ts` in the context when your write math related code and always use the Point type instead of { x, y}

## Design Context

Source of truth for UI/design work lives in `.impeccable.md` at the project root — consult it for full detail. Summary:

### Users

Small, async-first teams (and individuals) who think visually — sketch architecture, flows, diagrams, and ideas. GitHub-authenticated workspaces/folders, realtime collab rooms, read-only public share links. Job: capture and organize visual thinking fast, then share without SaaS overhead.

### Brand Personality

Calm, human, effortless. The chrome recedes so the canvas is the protagonist; light/creative/slightly handmade warmth (echoing the hand-drawn Virgil canvas font). Evoke calm + focus and lightness + creativity. Never cold, corporate, or busy.

### Aesthetic Direction

Keep and refine the existing identity (do not reinvent). Light/warm chrome is the default; design dark-ready (tokens / `light-dark()`), dark theme ships later. Brand purple `#6965DB` used sparingly as accent (washes, active states, primary actions) — never bold blocks. Warm tinted neutrals (`#FCFBFF`, `#F7F8FC`, `#FFF8EF`, `#F7F4EE`); text `#1F2937`/`#132032`/`#5B6574`; no pure black/white. UI font **Assistant** (400–700); canvas keeps **Virgil**. Soft rounded corners (14px buttons, 20–24px cards, 999px pills), soft elevation shadows (`0 16–18px 40–44px rgba(31,41,55,0.08)`), purposeful frosted glass, subtle low-opacity warm→cool gradients. Generous spacing. Avoid AI-slop: colored left-border stripes, gradient text, cyan-on-dark, neon purple→blue gradients, card-in-card, identical icon-card grids, everything-is-a-modal.

### Design Principles

1. The canvas is the protagonist — chrome recedes; remove/quiet rather than add.
2. Warm, tinted, never sterile — neutrals lean warm, tinted toward brand purple.
3. Accent is rare on purpose — purple ~10% of visual weight; scarcity gives it power.
4. Soft depth, purposeful glass — elevation to clarify layering, not decoration.
5. A handmade soul — hand-drawn canvas font + warmth, clean Assistant chrome; hold both.
6. Build dark-ready — light ships first, but use tokens so dark doesn't need a rewrite.
