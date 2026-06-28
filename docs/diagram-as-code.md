# Diagram-as-code com kindraw

O kindraw fecha o loop que um whiteboard não consegue: o diagrama de arquitetura
mora ao lado do código como um **spec tipado commitável**, dá diff num PR, e
**regenera em CI** — então para de apodrecer.

```
  DiagramSpec (JSON, no git)  ──build──►  canvas .excalidraw
        ▲                                        │
        └──────────── extract ◄──────────────────┘
        (canvas → spec commitável, diffável)

  CI:  kindraw sync <id> --spec arch.json --check   →  exit 1 se o canvas drift-ou do spec
```

## As peças

| Peça | O quê |
|---|---|
| `buildScene(spec)` | spec → canvas determinístico (mesmo spec = bytes idênticos) |
| `extractDiagramSpec(elements)` | canvas → `DiagramSpec` tipado (inverso, com warnings de perda) |
| `kindraw_sync_scene` (MCP) | um agente regenera o canvas a partir do spec, idempotente |
| `kindraw sync` (CLI) | mesma coisa no terminal / CI, com `--check` pra detectar drift |

## Fluxo

1. **Gerar** o diagrama (via MCP `kindraw_create_scene`, CLI `kindraw generate --spec`, ou a IA do app).
2. **Exportar** o canvas de volta pra um spec commitável (`extractDiagramSpec` / botão de export no app) e **commitar** `arch.json` no repo, ao lado do código.
3. **Regenerar** quando o código muda — um agente edita `arch.json` e roda o sync; layout determinístico mantém o canvas byte-estável e diffável.
4. **Gate de CI** — `kindraw sync <id> --spec arch.json --check` falha (exit 1) se o canvas publicado divergiu do spec versionado, sem escrever nada.

## CLI

```bash
# regenera o canvas a partir do spec (SOBRESCREVE o canvas vivo — spec é a fonte da verdade)
kindraw sync draw_abc123 --spec arch.json

# detecta drift sem escrever (exit 1 em drift) — use em CI
kindraw sync draw_abc123 --spec arch.json --check
```

## Gate de CI (GitHub Actions)

```yaml
# .github/workflows/diagrams.yml
name: diagrams-stay-fresh
on: [pull_request]
jobs:
  check-architecture-diagram:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx -y @kindraw/cli sync ${{ vars.ARCH_DIAGRAM_ID }} --spec docs/arch.json --check
        env:
          KINDRAW_TOKEN: ${{ secrets.KINDRAW_TOKEN }}
```

Se alguém mudar a arquitetura no código mas esquecer de atualizar `docs/arch.json`
(ou vice-versa), o `--check` quebra o PR. O diagrama nunca mais mente.

## Política de overwrite

Um `sync` **sem** `--check` sobrescreve o canvas vivo — **o spec é a fonte da
verdade**. Edições feitas à mão no editor são perdidas no próximo sync. Use
`--check` pra detectar drift sem risco; trate o spec versionado como o source.

> Antes de promover o `sync` (modo write) pra CI de produção, considere o
> follow-up de **snapshots de versão server-side** (M4 do plano) como rede de
> segurança contra uma run ruim do agente.
