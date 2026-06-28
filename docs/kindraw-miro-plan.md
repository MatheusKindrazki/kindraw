# Plano: kindraw → canvas colaborativo criativo ("um Miro, do jeito kindraw")

> Plano de implementação derivado do mapeamento do código real + taxonomia Miro/FigJam. Gerado em 2026-06-28. Status: **proposta** (decisões de produto pendentes — ver §10).

---

## 1. Visão & posicionamento

Não clonar o Miro. Ganhar o artefato que o engenheiro **realmente guarda**: o diagrama de arquitetura/RFC que mora ao lado do spec e continua correto ao longo do tempo.

O kindraw já tem 3 ativos que o Miro **estruturalmente não consegue ter**:

1. **Builder de grafo tipado e determinístico** (`scene/spec.ts → layout.ts → build.ts`) — o LLM emite um spec validado e o kindraw é dono do layout. Mesmo spec → canvas idêntico, sempre. O output do Miro é posicionado pelo LLM e **nunca** dá pra versionar/diff/regenerar em CI.
2. **Hybrid doc+canvas** com deep-links bidirecionais de seção (`hybrid.ts`) — a forma natural de um doc de engenharia (prosa RFC + diagrama), impossível de colar num canvas freeform.
3. **Entrega MCP-nativa** dentro do agente que o engenheiro já roda — fricção de criação ≈ zero.

**O wedge é "diagram-as-code / docs-as-code pra visuais":** um board que round-trippa pra um spec commitável, regenera em CI pra parar de apodrecer, e que humano + agente co-editam ao vivo.

## 2. Onde já estamos (NÃO reconstruir)

Mapeado no código: colab em tempo real (YJS docs + WS criptografado canvas), presença + facepile, 3 modos (Drawing/Doc/Hybrid), slash commands, templates/ícones/libraries curadas, folders + sharing com roles, share links público/live-edit, builder determinístico + 11 ferramentas MCP + worker de IA. **As partes difíceis estão prontas.** O que falta é a _camada de estrutura_ que transforma grafos gerados em boards, mais o fechamento do loop diagram-as-code.

## 3. Princípios do plano

- **Determinismo é a espinha.** Ids de seta estáveis + emissão de frames tornam a cena byte-stable e diffável — pré-condição do round-trip e do `kindraw_sync_scene`.
- **Front-load de wins isolados de risco-zero** (embeds, ids de seta, sticky/card) → valor na semana 1 enquanto a fundação assenta.
- **Frames destravam** board recipes (fronteiras C4) e present mode (frames-as-slides).
- **O item de maior risco** (IA in-app pelo builder determinístico) fica atrás de um refactor browser-safe + feature flag, com o caminho Mermaid intacto como fallback.
- **Nada quebra back-compat:** specs sem grupos / sem shapes novos produzem output byte-idêntico.

---

## 4. Milestones

### M1 — Wins isolados & fundação de determinismo · ~3-4 semanas, 1-2 eng

**Meta:** entregar os wins de baixo risco/alta credibilidade e travar o determinismo da cena. **Features:** embeds · arrow-ids · frames (+ guard node.id/group.id) · sticky+card **Exit criteria:**

- URLs github/gitlab/linear/atlassian colam como embed ou link-card estritamente sandboxed; sem iframe morto (catch-all card por host).
- Ids de seta = `arrow-<from>-<to>` com dedup determinístico; remover uma aresta não-relacionada nunca reembaralha outros ids; golden snapshot trava o esquema.
- DiagramGroups não-vazios emitem frames (children ligados, frame por último no array); specs sem grupo byte-idênticos ao atual.
- sticky renderiza como post-it (`customData.kindrawStickyNote`); card renderiza título + meta agrupados; setas ainda fazem bind border-to-border.
- `yarn test:update` + `yarn test:typecheck` verdes em kindraw-client + element + MCP.

### M2 — Loop diagram-as-code · ~2-3 semanas, 1 eng

**Meta:** tornar o grafo tipado (não o blob `.excalidraw`) a fonte da verdade diffável e fechar o loop de regeneração pra CI. **Features:** round-trip (`exportSceneToDiagramSpec`) · sync-scene (`kindraw_sync_scene`) **Exit criteria:**

- `buildScene → extractDiagramSpec → validateDiagramSpec → buildScene` round-trippa limpo; fronteiras lossy emitem warnings explícitos.
- `KindrawTechnicalExportCard` oferece Copy-JSON / Download-`.kindraw.json` ao lado do Mermaid.
- `kindraw_sync_scene` + CLI `kindraw sync <id> --spec <f> [--check]`; `--check` sai não-zero em drift sem escrever; re-PUT idempotente é no-op quando o conteúdo bate byte-a-byte.
- Sem mudança de backend; guard de kind impede clobber de um doc.

### M3 — Boards unificados e gerados · ~4-6 semanas, 1-2 eng

**Meta:** toda superfície (web AI, MCP, CLI) produz o mesmo layout desenhado, e uma chamada gera boards de engenharia. **Features:** ai-typed-spec (IA in-app → builder determinístico) · board-recipes (`kindraw_create_board`) **Exit criteria:**

- `buildScene` browser-safe (`@kindraw/client/scene/browser`, sem `node:module` no grafo do web); teste de determinismo jsdom verde; MCP/CLI ainda buildam.
- web AI emite `{kind:flow,spec}` → buildScene pra diagramas de grafo e mantém Mermaid pra sequence/class/er/state/gantt; atrás de flag com fallback Mermaid.
- `kindraw_create_board` entrega recipes ADR→C4→flow→doc; `recipes.test.ts` prova que todo `node.linkToHeading ∈ linkableHeadings` (zero drift doc↔canvas).
- `kindraw_list_boards` lista metadata; `HybridPartialError` + `unmatchedHeadings` expostos pro auto-corrigir do LLM.

### M4 — Co-watch & present · ~3-4 semanas, 1-2 eng

**Meta:** transformar o hybrid numa superfície de design-review apresentável e co-observável. **Features:** follow-mode (co-watch) · present-mode (frames-as-slides) **Exit criteria:**

- Clicar num avatar do facepile segue o viewport daquele usuário; pan/zoom do líder transmite por `follow@<socketId>`; auto-unfollow nativo em pan manual ou saída do líder.
- Frames apresentam full-screen em ordem `slideIndex` (fallback espacial) via `scrollToContent`; export Mermaid por-frame reusa `technicalExport`.
- `slideIndex` emitido como `customData` nos frame skeletons; present mode degrada em frames feitos à mão.
- follow + present restritos a editor↔editor; comportamento viewer-mode documentado.

---

## 5. Grafo de dependências

```
embeds ─────────────────────────────────► (credibilidade; standalone)

frames-guard (node.id ∉ group.id) ──► frames ──┬─► present-mode (slideIndex)
                                                ├─► board-recipes (fronteiras C4)
                                                └─► round-trip (grupos round-trippáveis)

arrow-ids (estáveis) ──┬─► round-trip ──► loop diagram-as-code
                       └─► sync-scene ──► gate "diagramas apodrecem" em CI

ai-typed-spec ── precisa ─► browser-safe buildScene (PR linchpin) + flag

board-recipes ── reusa ─► composeHybrid (pronto) + frames (soft)
rich-shapes (sticky+card) ─► boards lêem como whiteboard (standalone)

follow-mode ── reusa ─► relay do servidor (pronto, ~80%)
present-mode ── precisa ─► frames (degrada p/ fallback espacial sem ele)
```

---

## 6. Sequência de PRs (núcleo executável)

Pequenos primeiro, dependências respeitadas. `risk` = chance de regressão.

| # | PR | Escopo | Depende | Esf. | Risco |
| --- | --- | --- | --- | --- | --- |
| 1 | **embeds: GitHub** | `embeddable.ts`: github.com em ALLOWED_DOMAINS (NÃO ALLOW_SAME_ORIGIN), RE_GH_PR_ISSUE/RE_GH_BLOB + catch-all, `escapeHtml`/`createLinkCardSrcDoc`, branches em getEmbedLink; testes (escaping + sandbox) | — | M | low |
| 2 | **arrow-ids** | `build.ts` `makeArrowIdFactory` (`arrow-<from>-<to>` + dedup `-2/-3`) em toSkeleton; `build.test.ts` suite (remoção de aresta não-relacionada, arestas paralelas, ambiguidade de hífen, self-loop, golden inline) | — | S | low |
| 3 | **frames-guard** | `spec.ts` validateDiagramSpec: throw quando `node.id ∈ groupIds`; caso em `spec.test.ts`. Hardening puro, sem mudar output | — | S | low |
| 4 | **embeds: GitLab + Linear** | gitlab.com/linear.app, RE_GITLAB/RE_GITLAB_SNIPPET/RE_LINEAR + catch-all, snippet gist-style; testes | 1 | M | low |
| 5 | **embeds: Jira** | `*.atlassian.net` wildcard + RE_JIRA card (exercita matchHostname first-label wildcard); testes | 4 | S | low |
| 6 | **frames: emitir DiagramGroup** | `build.ts` FRAME_PADDING(16), emissão de frame por grupo não-vazio (children + bounds medidos), reordenação frames-last em buildScene; `build.test.ts` suite groups→frames | 3 | M | **med** |
| 7 | **rich-shapes: sticky** | `spec.ts` widen NodeShape/VALID_SHAPES; `build.ts` branch sticky (`customData.kindrawStickyNote` + `#ffec99`, override vence); min-size em layout/textMetrics; widen 3 enums zod MCP; testes | — | M | low |
| 8 | **rich-shapes: card** | `spec.ts` `DiagramNode.meta` + reserva prefixo `meta-`; `measureCard`; `build.ts` branch card (rect + título top + meta agrupado `meta-<id>`); campo meta no MCP; testes | 7 | M | **med** |
| 9 | **round-trip: extract.ts** | novo `scene/extract.ts` (`extractDiagramSpec` + RawSceneElement/ExtractWarning), re-export; `extract.test.ts` round-trip + lossy; caso build→extract→build. Sem app | 2, 6 | M | low |
| 10 | **round-trip: app+UI** | alias tsconfig/vite p/ `@kindraw/client/scene/extract`; export package.json; `exportSceneToDiagramSpec` + size em technicalExport; KindrawTechnicalExportCard Copy/Download + warnings; i18n | 9 | M | **med** |
| 11 | **sync-scene: client core** | novo `scene/sync.ts` (`syncScene` + `SceneSyncClient`, kind-guard, skip idempotente byte-equal, check mode); `sync.test.ts`; assert PUT em client.test.ts | 2 | M | low |
| 12 | **sync-scene: MCP tool** | registrar `kindraw_sync_scene` (reusar `sceneSpecShape` zod + itemId + check); mapear unchanged/check no result | 11 | S | low |
| 13 | **sync-scene: CLI + CI gate** | `kindraw sync <id> --spec <f> [--check]` (`process.exitCode=1` em drift); snippet GitHub Action pro gate "diagramas apodrecem" | 12 | M | **med** |
| 14 | **ai-typed-spec: browser-safe buildScene** _(linchpin)_ | mover NodeTextMetricsProvider→`textMetrics.node.ts`; `FallbackTextMetricsProvider` + `setLayoutTextMetricsProvider`; ensureProvider lazy/async; `build.browser.ts` + export `@kindraw/client/scene/browser` + teste jsdom. Sem mudança de comportamento; verificar MCP/CLI | — | L | **med** |
| 15 | **ai-typed-spec: prompt envelope worker** | `ai.ts` trocar prompt p/ `{kind:flow,spec}`\|`{kind:...,mermaid}`; opcional response_format; deltas em index.test.ts. Shippável independente (client cai p/ Mermaid) | — | M | **med** |
| 16 | **ai-typed-spec: TTDDialog flow branch** _(flip, flagged)_ | `aiEnvelope.ts` parser + convertSpecToExcalidraw; branch em useTextGeneration/useMermaidRenderer/TextToDiagram por kind; gate View-as-Mermaid; manter Mermaid intacto; atrás de flag | 14, 15, 10 | L | **high** |
| 17 | **ai-typed-spec: hardening determinismo** _(opcional)_ | forçar Fallback provider em MCP/CLI p/ output byte-idêntico cross-surface; refresh snapshots; documentar parity. Precisa de version-snapshot antes de CI | 16 | M | med |
| 18 | **board-recipes: scaffolding + ADR** | `boards/{types,markdown,compose,index}.ts` + `recipes/adr.ts`; `DocBuilder` como fonte única heading↔link; wiring subpath; testes contra mocks composeHybrid. Sem MCP | 6 | L | low |
| 19 | **board-recipes: MCP tools (ADR)** | registrar `kindraw_create_board` + `kindraw_list_boards` (union zod adr-only) + folderId; expor unmatched/linkable + HybridPartialError; external no build.mjs MCP | 18 | M | low |
| 20 | **board-recipes: C4 context+container** | `recipes/c4Context.ts` + `c4Container.ts` (groups→frames, LR, labels tech/rel); estender union; samples | 19 | M | low |
| 21 | **board-recipes: sequence+runbook** | `recipes/sequence.ts` + `runbook.ts` (participants/steps; diamond decision flow); union; testes | 20 | M | low |
| 22 | **board-recipes: RFC+data-model** | `recipes/rfc.ts` + `dataModel.ts`; union; descrição da tool com lista completa; testes | 21 | M | low |
| 23 | **board-recipes: CLI** _(opcional)_ | `kindraw boards create --type adr --payload <f>` + dispatch | 22 | S | low |
| 24 | **follow-mode: hook glue (sem UI)** | useCanvasCollab: `followBounds.ts`, case USER_VISIBLE_SCENE_BOUNDS, listener USER_FOLLOW_ROOM_CHANGE, relay throttled p/ `follow@<id>`, onUserFollow→emit; wire em HybridEditorPage; teste unit | — | M | **med** |
| 25 | **follow-mode: facepile UI** | props PresenceFacepile (following/followable/onToggle) + botão + indicador + i18n; reverse-map socketId↔userId; `PresenceFacepile.test.tsx` | 24 | M | low |
| 26 | **follow-mode: relay test + polish** _(opcional)_ | `collab.test.ts` routing; toast "Following X"; opcional viewer-mode | 25 | S | low |
| 27 | **present-mode: helpers puros** | `presentMode.ts` (`orderFramesAsSlides` slideIndex→fallback espacial, `exportFrameToMermaid`, fileName) + testes. Sem UI | — | S | low |
| 28 | **present-mode: UI full-screen** | `KindrawPresentMode.tsx` (índice, scrollToContent double-defer, setas/space/esc, copy/download por slide); i18n; estado presenting + botão gated em HybridEditorPage | 27 | L | **med** |
| 29 | **present-mode: slideIndex nos frames** | `build.ts` frame skeleton anexa `customData.slideIndex` (aditivo, sobrevive convert+stabilize); assert em build.test.ts | 6, 28 | S | low |
| 30 | **present-mode: editor standalone** _(opcional)_ | estender present a drawings não-hybrid (App.tsx + KindrawTechnicalExportCard) | 28 | M | low |

**Caminho crítico curto** (semana 1): PRs **1, 2, 3** em paralelo — todos isolados, low-risk. Depois **6 (frames)** destrava metade do resto.

---

## 7. Especificação por feature

### 7.1 Frames — `DiagramGroup` → Excalidraw frames · M · PRs 3,6

- **Hoje:** `toSkeleton` (build.ts:91) emite 1 skeleton por nó + 1 por aresta; **nunca lê `spec.groups`** — grupos são validados mas descartados visualmente. `convertToExcalidrawElements` já suporta frame skeletons (`transform.ts:200,609,741`) e liga `frameId` nos membros + bound text.
- **Abordagem:** emitir 1 frame skeleton por grupo não-vazio com bounds medidos (união dos x/y/w/h dos membros ± `FRAME_PADDING=16`) + `children=ids`, **por último** no array (igual ao invariante `[...elements, frame]` do `actionFrame.ts:204`). `FRAME_PADDING < ORIGIN_MARGIN(20)` garante x/y > 0 (senão o fallback `frame?.x || minX` do convert clobera). Pular grupos vazios (evita `getCommonBounds([])` = Infinity).
- **Guard (PR3, pré-req):** rejeitar `node.id ∈ groupIds` — frame element entra no namespace de id dos nós; colisão faria o convert dropar elemento silenciosamente.
- **Edge cases:** membros espalhados (layout é group-blind → frames podem sobrepor; aceitar como limitação v1, clustering é follow-up); `group.label` undefined → omitir name (default "Frame"); determinismo preservado (stabilize zera seed).
- **Risco:** layout group-blind → frames grandes/sobrepostos em grupos não-contíguos. _Mitigação:_ documentar como limitação v1; agendar clustering antes de C4 pesar em fronteiras.

### 7.2 Embeds de código/PR/issue/Linear/Jira · M · PRs 1,4,5

- **Hoje:** `embeddable.ts:133` ALLOWED_DOMAINS só tem gist/stackblitz entre fontes de código.
- **Abordagem:** tudo dentro de `embeddable.ts` — sem novo element type, sem render, sem fetch. Adicionar domínios a ALLOWED*DOMAINS (NÃO a ALLOW_SAME_ORIGIN = a garantia de sandbox estrito). Patterns RE* pra GitHub PR/issue/blob, GitLab MR/issue/snippet, Linear, Jira. Snippets GitLab = embed script gist-style; resto = **link card** estático (`type:"document"` srcdoc, theme-aware, sem remoto) que no SVG export degrada pra `<a>`. Metadata derivada de parsing de URL (zero rede); tudo escapado com `escapeHtml`.
- **Edge case crítico:** URL github.com que não casa nenhum RE\_ → fall-through pra iframe genérico que o GitHub bloqueia (X-Frame-Options) → **embed morto**. _Mitigação:_ catch-all `RE_GH_GENERIC` roteando todo github.com restante pra link card.
- **Risco:** med — broadening de ALLOWED*DOMAINS. \_Mitigação:* catch-all cards por host; cards sem script e fora de ALLOW_SAME_ORIGIN.

### 7.3 Ids de seta estáveis · S · PR 2

- **Hoje:** `arrow-${i}` posicional (build.ts:118-131) — adicionar/remover 1 aresta reembaralha todos os ids downstream.
- **Abordagem:** `makeArrowIdFactory()` — base `arrow-<from>-<to>` + `Set` de ids usados, sufixo `-2/-3` em colisão **local ao bucket**. Resolve arestas paralelas (a→b solid + a→b dashed) E ambiguidade de hífen (a-b→c vs a→b-c) com o mesmo mecanismo. `canonicalizeBoundTextIds`/`reanchorArrows` derivam tudo do id do skeleton → nada mais muda. ~15 LOC + testes.
- **Edge cases:** ids de nó sem restrição de charset (hífen reachable → dedup); self-loop `arrow-a-a` permitido; comprimento pode passar MAX_ID_LEN mas isso só limita input do usuário.
- **Risco:** low. Golden snapshot trava o esquema.

### 7.4 IA in-app → builder determinístico · L · PRs 14,15,16,17

- **Hoje:** `/v1/ai/text-to-diagram` (ai.ts:34) cospe Mermaid cru → mermaid-to-excalidraw (layout não-determinístico), enquanto o caminho MCP usa o builder.
- **Abordagem:** rodar `buildScene` **client-side** (browser já bundla @excalidraw/element + tem canvas DOM real). 3 peças: (1) worker troca prompt p/ envelope discriminado `{kind:"flow",spec}` ou `{kind:...,mermaid}` (worker continua fino, sem build); (2) **buildScene browser-safe** — tirar `node:module`/canvas do grafo de import, novo entry `@kindraw/client/scene/browser` que injeta provider DOM-canvas ou Fallback puro-JS; (3) client parseia envelope, `kind:flow` → validateDiagramSpec + buildScene browser, senão caminho Mermaid intacto.
- **Decisão de paridade (ver §10):** node-canvas (MCP/CLI) vs DOM-canvas (web) → layouts **não** byte-idênticos, só "ambos parecem desenhados". Pra byte-idêntico, forçar `FallbackTextMetricsProvider` (puro-JS, AVG*CHAR_RATIO) em todas as superfícies. \_Recomendado:* fallback-everywhere, já que o WHY é "unificar".
- **Riscos high:** (a) regressão na aba Mermaid publicada (vive em @excalidraw/excalidraw) → _só ADICIONAR branch flow, nunca tocar paths Mermaid, atrás de flag_; (b) import transitivo `node:module` no grafo browser quebra build Vite → _mover provider Node + lazy-import + teste jsdom asserta no-throw_.

### 7.5 Round-trip canvas → DiagramSpec commitável · M · PRs 9,10

- **Hoje:** só spec→canvas; o blob `.excalidraw` é opaco/não-reviewável.
- **Abordagem:** `extractDiagramSpec` (inverso puro de toSkeleton) em novo `scene/extract.ts`, importando **só os tipos** de spec.ts (sem @excalidraw/element, sem dagre → alias app leve). Wrapper fino `exportSceneToDiagramSpec` em `technicalExport.ts` (irmão de exportSceneToMermaid). Ids limpos sequenciais (`n0,n1…/g0,g1…`) → output sempre passa validateDiagramSpec.
- **Fronteiras lossy explícitas:** só rect/diamond/ellipse→nós; edges só de setas com ambos bindings resolvidos (v1 bound-only); cores/links só quando válidos e não-default; todo o resto contado num warning "omitted N elements"; grupos emitidos de frames **com warning** que o builder os re-dropa até frames-aware toSkeleton (PR6).
- **Risco:** low. _Nota:_ sequenciar depois de frames (PR6) pra remover o warning "groups-not-rebuilt".

### 7.6 `kindraw_sync_scene` — regenerar canvas idempotente (docs-as-code CI) · M · PRs 11,12,13

- **Hoje:** o write "into existing canvas" existe enterrado em apply_template (`updateHybridDrawing` → PUT `putItemContent`). Sem backend novo.
- **Abordagem:** orquestrador puro `syncScene(client, {itemId, spec, check?})`: getItem (existência + **kind-guard** recusa clobber de doc) → buildScene determinístico → `unchanged = existing===built.content` → se !check && !unchanged, `updateContent`. Interface estrutural `SceneSyncClient` (igual composeHybrid). Expor via MCP tool + CLI `kindraw sync <id> --spec <f> [--check]` (`--check` = exit non-zero em drift, **a headline de CI**).
- **Risco high:** sobrescreve edições manuais/in-app (spec vira dono em todo sync não-check). _Mitigação:_ shippar `--check` primeiro; documentar "spec é a fonte da verdade" alto; kind-guard; considerar `--force` vs default-refuse-on-foreign-content (ver §10).

### 7.7 Board recipes generativos (`kindraw_create_board`) · L · PRs 18-23

- **Hoje:** 12 skeletons de diagrama + libraries; sem recipes board-level/hybrid.
- **Abordagem:** módulo `boards/` puro sobre `composeHybrid` — zero canvas-engine. Cada TYPE é um `BoardRecipe<P>.build(payload) → {title, markdown, diagram}`. **Move-chave:** `DocBuilder.section(title, body)` sanitiza/dedup e **retorna** o título canônico, que o recipe usa como `linkToHeading` — heading e link são o **mesmo valor**, drift doc↔canvas impossível por construção. zod fica no MCP (como create_scene); recipes são TS-typed.
- **Recipes (engenharia, não retro):** ADR (Context→Decision→Consequences + alternativas como diamonds), RFC, C4 context/container (groups→frames, LR, labels), sequence, runbook (Alert→Triage→…→Verify, diamonds), data-model (entidades + edges com cardinalidade).
- **Invariante testado:** `recipes.test.ts` re-parseia o markdown e asserta todo `linkToHeading ∈ linkableHeadings`.
- **Risco med:** `@kindraw/client/boards` (puxa hybrid→scene→excalidraw+dagre) bundlar no MCP. _Mitigação:_ adicionar a `external` no build.mjs + verificar dynamic import fica external.

### 7.8 Rich shapes: sticky + card · M · PRs 7,8

- **Abordagem:** mapear ambos pra `type:"rectangle"` em toSkeleton (mantém o invariante 1-container-bindável-por-nó que reanchorArrows depende). **sticky** = rect + `customData:{kindrawStickyNote:true}` + defaults (`#ffec99`, stroke transparent, fillStyle solid) só quando não-override — **renderiza hoje** via renderElement.ts:406. **card** = rect + título bound `verticalAlign:top` + (se `node.meta`) text standalone `meta-<id>` agrupado em `cardgroup-<id>`. Adiciona `meta?` a DiagramNode, reserva prefixo `meta-`, widen NodeShape/VALID_SHAPES + 3 enums zod MCP.
- **Edge cases:** override de cor vence default; seta p/ sticky/card = bounding box border-to-border (inalterado); z-order meta depois do rect.
- **Risco:** sticky low (nativo hoje); card med (namespace de id + grouping → isolar PR).

### 7.9 Follow-mode (co-watch agente/design-review) · M · PRs 24-26

- **Hoje:** relay do servidor pronto (`collab.ts:352-403`); plumbing de socket pronto; só falta glue do client (`useCanvasCollab.ts:28-32` foi stripado).
- **Abordagem:** portar o glue nativo do excalidraw reusando AppState (`userToFollow`/`followedBy`) → ganha de graça auto-unfollow em pan manual / saída do líder + banner "Following X". 4 peças: líder `onScrollChange`→relay throttled p/ `follow@<id>` quando `followedBy.size>0`; tracking USER_FOLLOW_ROOM_CHANGE; follower aplica USER_VISIBLE_SCENE_BOUNDS via `zoomToFitBounds`; clique no avatar seta `userToFollow`.
- **Ponte de identidade:** presença é keyed por `userId`, follow mira `SocketId` → reverse-map `canvasCollab.collaborators` (`Collaborator.id===userId`). Memoizar.
- **Risco:** med (ponte de identidade). Posicionar como "co-assistir o agente desenhar / design review", não facilitação.

### 7.10 Present-mode (frames-as-slides + export por-frame) · L · PRs 27-30

- **Abordagem:** helpers puros `presentMode.ts` (`orderFramesAsSlides` com slideIndex→fallback espacial y-then-x, `exportFrameToMermaid` via getFrameChildren). UI `KindrawPresentMode.tsx` full-screen via `scrollToContent` (double-defer fitToContent), setas/space/esc, copy/download por slide. `slideIndex` emitido como `customData` nos frame skeletons (aditivo).
- **Decoupling:** funciona em qualquer frame pré-existente; sem frames cai no fallback espacial → desacoplado de PR6.
- **Risco:** med (UI). Botão Present gated em presença de frame; v1 editor↔editor.

---

## 8. Estratégia de testes

Determinismo é o contrato — testado em 3 camadas:

1. **Golden snapshots** em `build.test.ts`: snapshot só dos **ids extraídos** (arrow ids + containerIds de label via inline snapshot), **nunca** o `content` serializado completo (evita acoplar a coordenadas que driftam entre versões de dagre/Excalidraw). Manter verde o teste "same spec → identical serialized content" e adicionar equivalentes p/ frames, sticky/card, sync.
2. **Unit puro** (literais de element/spec, sem React/runtime): `extract.ts` (round-trip + warnings), `followBounds.ts`, `presentMode.ts`, `DocBuilder`, e o invariante `recipes.test.ts`.
3. **Orquestração** via harness `mockFetch`+client (copiado de `hybrid.test.ts`) p/ composeBoard e syncScene (ordem seed→doc→drawing, skip idempotente, check no-write, kind-guard, 404). Worker: atualizar `index.test.ts` p/ deltas do envelope JSON + assert do novo system prompt. Browser: `build.browser.test.ts` jsdom asserta determinismo + ausência de `node:module`.
4. **Checks manuais** (o que teste não pega): colar cada provider de embed (card vs iframe vs morto); follow em 2 browsers (snap, live, auto-unfollow em pan e em saída); present stepping + export por slide; sticky shadow + card título/meta; rodada completa de prompt web-AI (roteamento flow vs sequence, preview, insert, gating View-as-Mermaid).

## 9. Rollout & feature flags

- **Sai livre** (aditivo, back-compat, byte-idêntico p/ inputs não-afetados): arrow-ids, frames, sticky/card, guard node/group, embeds. Sem flag.
- **Atrás de flag:** o flip da IA in-app (TTDDialog flow branch). Manter TODOS os paths Mermaid intactos; dark-launch o prompt do worker primeiro (shippável independente), depois habilitar o flip do client por cohort.
- **Version-snapshot obrigatório antes de promover pra CI** qualquer mudança que altere output serializado: esquema de arrow-id (refresh golden), emissão de frames (elementCount muda), e especialmente o PR opcional de forçar Fallback provider em MCP/CLI (churn intencional de snapshot). Rodar `yarn test:update`, revisar o diff, confirmar só fixtures intencionais.
- **sync-scene é o próprio veículo de CI:** shippar `--check` (read-only, exit non-zero) antes de anunciar write mode.
- **Boards incrementais** via union zod: ADR-only → batches C4/flow/doc. Verificar que o dynamic import `@kindraw/client/boards` fica **external** pós-build do MCP.
- **Follow + present** = UI aditiva do hybrid editor; gate do Present em presença de frame; follow editor↔editor v1. Nenhum muda dado persistido.

## 10. Questões em aberto (decisões de produto)

1. **Paridade cross-surface:** exigir output byte-idêntico web/MCP/CLI (forçar Fallback provider em todos, aceitar churn de snapshot MCP/CLI) **ou** aceitar paridade "ambos parecem desenhados" com métricas de fonte reais por superfície?
2. **Política do `kindraw_sync_scene`** em canvas editado manualmente / com conteúdo estranho: default-refuse, overwrite (spec atual), ou exigir `--force` explícito? (`--check` cobre detecção; o default de write-mode precisa de decisão.)
3. **Endpoint de sync** num drawing de hybrid: `updateContent` (/v1/api) ou `updateHybridDrawing` (/api)? Funcionalmente idêntico (mesmo `putItemContent`), mas diverge da convenção do código.
4. **Rollout da IA typed-spec:** cohort gradual com flag, ou cutover duro confiando no fallback Mermaid? (UX de streaming degrada — sem preview token-a-token p/ JSON; precisa de estado "building…"?)
5. **Clustering layout-by-group:** agendar o follow-up de frames **antes** dos recipes C4, ou aceitar frames sobrepostos como limitação v1 conhecida p/ diagramas boundary-heavy?
6. **Escopo do follow-mode:** só editor↔editor v1, ou investir em viewer-mode follow p/ reviewers (sharedRole=viewer) co-assistirem?
7. **Card meta:** grouped-but-static v1 (sem reflow ao editar título/resize) ou renderer `customData.kindrawCard` agora p/ meta refluir?
8. **Round-trip v1:** tentar inferência por proximidade p/ setas livres (como o export Mermaid faz) ou ficar bound-only com warning e deferir helpers compartilhados p/ v2?

---

### Anti-goals (não construir — onde clonar o Miro é armadilha)

Rituais de workshop (dot-voting, 5-whys, retro) · marketplace de templates comunitário · workspaces de org/team cedo · geração de imagem raster no canvas · paleta de widgets manual fora do typed spec · reescrita CRDT por-objeto prematura · comment threads/activity feed antes do loop diagram-as-code · promover regen em CI antes dos version-snapshots existirem.
