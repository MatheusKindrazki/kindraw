# Installing the Kindraw skill

`skills/kindraw/` is the **canonical, versioned source** of the skill. Install it into each agent runtime by pointing that runtime at these files (symlink so updates propagate, or copy for a frozen snapshot).

```
skills/kindraw/
  SKILL.md       # the skill: mental model, workflows, gotchas (start here)
  reference.md   # full tool catalog (progressive-disclosure detail)
  README.md      # this file
```

Prerequisite for all runtimes: the **Kindraw MCP server** connected (or the CLI / REST fallback described in SKILL.md), authenticated via `KINDRAW_TOKEN` or `kindraw login`.

## Claude Code

Skills live in `~/.claude/skills/<name>/` (personal) or `.claude/skills/<name>/` (project). Symlink this directory:

```bash
ln -s "$(pwd)/skills/kindraw" ~/.claude/skills/kindraw
```

Claude Code discovers it by the `name` + `description` frontmatter and invokes it via the Skill tool. Verify with `/skills` (or just ask something kindraw-shaped).

## Codex

Codex reads `AGENTS.md` (repo root and `~/.codex/AGENTS.md`) and custom prompts in `~/.codex/prompts/`. Two options:

1. **As a prompt** (invocable): copy the skill body into a prompt file.
   ```bash
   mkdir -p ~/.codex/prompts
   cp skills/kindraw/SKILL.md ~/.codex/prompts/kindraw.md
   ```
2. **As always-on context**: reference it from `AGENTS.md` so Codex loads it every session:

   ```markdown
   ## Kindraw

   When working with Kindraw (diagrams / docs / hybrids), follow `skills/kindraw/SKILL.md` and `skills/kindraw/reference.md`.
   ```

Codex acts via shell, so it will lean on the **CLI / REST fallback** section of SKILL.md unless the Kindraw MCP is configured in `~/.codex/config.toml`.

## Hermes

Hermes uses the **same skill format** as Claude Code — a `skills/<name>/SKILL.md` directory under `~/.hermes/skills/`. Symlink it:

```bash
ln -sfn "$(pwd)/skills/kindraw" ~/.hermes/skills/kindraw
```

Verify with `ls ~/.hermes/skills/` (kindraw should appear alongside your other skills). The content is runtime-agnostic markdown; only the _loading_ mechanism differs.

## Keeping it accurate

The gotchas and tool contracts here were captured against the live MCP. When the MCP tool surface changes (e.g. `patch_scene` lands, or `sync_scene` gains a `scope`), update `reference.md`'s catalog and the "Not yet available" list, and bump `version` in `SKILL.md`. The tool descriptions in `packages/kindraw-mcp/src/index.ts` are the source of truth.
