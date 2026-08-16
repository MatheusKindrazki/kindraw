# Plano — Dívida de design system do Kindraw

> Origem: auditoria `design-intelligence` de 2026-08-16
> ([`2026-08-16-design-intelligence-audit.md`](./2026-08-16-design-intelligence-audit.md)).
> Todo número aqui foi medido, não estimado. Onde não foi medido, está dito.

## Cabeçalho

| | |
|---|---|
| **Objetivo** | Fechar as 4 classes de defeito achadas na auditoria: acessibilidade de texto, acento duplicado sem token, adoção parcial de token, e tema escuro pela metade. |
| **Repo** | `~/development/personal/kindraw` |
| **Branch default** | **`master`** (⚠️ não é `main`) — medido fresco em 2026-08-16 via `fleet-freshness.sh --fetch` |
| **Stack** | Fork do Excalidraw · monorepo Yarn · React + Vite · SCSS |
| **Superfície** | `excalidraw-app/` (camada Kindraw) + `packages/public/` (assets de marca). ⚠️ **Não tocar** em `packages/excalidraw/` nem nos demais pacotes — esses são upstream. `packages/public/` **não** é upstream: é onde vivem favicon, app icons e a OG. |
| **Comandos** | `yarn test:typecheck` · `yarn test:update` · `yarn fix` |
| **Work Control** | Nenhum item canônico existe (`jarvis_work_find` → `total: 0`). Precisa `jarvis_work_submit`. |
| **⚠️ Hooks de WC** | **RECUSADOS neste clone** — `core.hooksPath` aponta para `.husky`. Não haverá trailer automático: o `Work-Control-ID` vai **no corpo do PR, à mão**. |

### Por que 3 PRs e não 1

| PR | Escopo | Risco | Bloqueado por |
|---|---|---|---|
| **A — Verdade** | doc + memória Jarvis + OG | zero (não toca código de produto) | nada — pode sair hoje |
| **B — Sistema de cor** | 4 arquivos SCSS | baixo, mecânico | A (para o doc já nascer certo) |
| **C — Dark mode do shell** | `kindraw.scss` | **médio** — precisa decisão de design | validação visual (Task C1) |

Misturar A e B faria um PR onde a revisão de acessibilidade compete com revisão de texto.
Misturar C faria um PR bloqueado por uma decisão de design segurar duas correções triviais.

---

## Fase 0 — Pré-voo (uma vez, antes de qualquer PR)

### Task 0.1 — Worktree isolada
```bash
bash ~/development/personal/scripts/wt.sh new kindraw fix/design-system-truth
```
**Esperado:** worktree em `~/development/personal/.worktrees/kindraw/fix-design-system-truth`,
branch nascida de `master` (fresco).
**Falha:** se disser que `master` divergiu, **pare** e resolva antes — não nasça de base torta.

### Task 0.2 — Registrar o work no ledger
```
jarvis_work_submit(
  title: "Kindraw: dívida de design system (WCAG, token único, dark mode)",
  front: "personal", repo: "kindraw", risk_class: "low", ...
)
```
Guarde o `work_id` e ligue à worktree:
```bash
cd ~/development/personal/.worktrees/kindraw/fix-design-system-truth
bash ~/development/personal/scripts/wc.sh bind <work_id>
bash ~/development/personal/scripts/wc.sh id     # confere que devolve o uuid
```
⚠️ **Ligue AGORA, não no fim** — o feeder de sessão não é retroativo.

### Task 0.3 — Baseline verde
```bash
yarn test:typecheck && yarn test:update
```
**Esperado:** ambos passam. Se já falham em `master`, **registre o estado** antes de mexer —
senão você herda a falha e ela vira "sua".

---

## PR A — Verdade documental

> **Por que primeiro:** `.impeccable.md` e a memória do Jarvis dizem que a marca é **roxa**.
> Todo agente (e toda sessão futura) que os ler vai propor a cor errada com plena confiança.
> Isto custa ~20 min e para o sangramento.

### Task A1 — Reescrever a seção de cor do `.impeccable.md`

**Arquivo:** `.impeccable.md`

**Trocar** o bloco que hoje diz:
> **Brand color:** Purple `#6965DB` (darker `#5B57D1`, darkest `#4A47B1`, light `#E3E2FE`, hover `#5753D0`)

**Por:**
```markdown
- **Brand color:** Âmbar `#c9963f` (`--kd-amber`), com `--kd-amber-deep #7a5414`,
  `--kd-amber-soft #f1e6cf`, `--kd-amber-chip #f5e7c8`. Usado com parcimônia —
  o símbolo "K", ações primárias, estados ativos, chips. Nunca como bloco grande.
- **Tinta e superfície:** navy `#20283a` (`--kd-ink`) sobre creme `#faf6ef` (`--kd-bg`).
  Contraste medido: 13.67:1 (AAA).
- ⚠️ **O roxo `#6965DB` NÃO é a marca Kindraw** — é a cor institucional do Excalidraw upstream.
  Ele sobrevive só em SVGs promo herdados em `excalidraw-app/build/`. Não usar.
- **Fonte-da-verdade dos valores:** os 38 tokens `--kd-*` em
  `excalidraw-app/kindraw/kindraw.scss` `:root`. Este documento descreve; o `:root` decide.
```

**Verificação:**
```bash
grep -ci '6965db\|roxo\|purple' .impeccable.md
```
**Esperado:** só as ocorrências da nota de advertência. Zero como declaração de marca.

### Task A2 — Corrigir a memória do Jarvis

A memória de **2026-03-10** registra: *"novo logo com mark em SVG: quadrado de cantos arredondados
com contorno **roxo**, fundo claro e K geométrico **roxo**"*. É o estado pré-rebrand.

```
jarvis_save_memory(
  context: "decisao",
  content: "Kindraw — VIRADA DE PALETA (rebrand 'Ateliê', commit 1e9e8151, 2026-06-12):
  a marca deixou de ser ROXA (#6965DB, que era herança do Excalidraw upstream) e passou a ser
  ÂMBAR #c9963f + navy #20283a sobre creme #faf6ef. Supersede a memória de 2026-03-10, que
  descreve o mark roxo e está OBSOLETA. Fonte-da-verdade: os 38 tokens --kd-* em
  excalidraw-app/kindraw/kindraw.scss :root."
)
```
⚠️ **Precedente:** a virada de paleta da Lavra (teal → terracota, 2026-06-20) foi registrada
assim no Jarvis. A do Kindraw nunca foi — é essa lacuna que se fecha aqui.

### Task A3 — OG image em 1200×630

**Arquivo-fonte:** `packages/public/og-image-3.svg` (hoje `width="1200" height="675"`)

⚠️ **Não é `excalidraw-app/build/og-image-3.svg`** — `build/` é output e está gitignored
(`.gitignore:15`). A fonte versionada é `packages/public/`. Medido: os PNGs em `packages/public/`,
`excalidraw-app/build/` e o servido em produção têm o **mesmo sha256** — editar o versionado alcança
produção no próximo deploy.

⚠️ **Não é resize** — encolher o raster deformaria. É mudança de *canvas*, com o conteúdo parado:

| Elemento | Hoje | Vira |
|---|---|---|
| `<svg>` + `<rect>` base | `height="675"`, `viewBox="0 0 1200 675"` | `height="630"`, `viewBox="0 0 1200 630"` |
| Todo o resto (círculos, marca, textos) | — | **não mexer** |

✅ **Executado em 2026-08-16 — e a previsão inicial estava errada.** O rascunho deste plano mandava
subir o círculo inferior para `cy="567"` e recentrar o texto em −22px. **As duas coisas teriam
piorado:** com `cy="567"` o topo do círculo sobe para y=443 e **invade** a tagline (baseline y=460).

O que realmente acontece mantendo tudo parado: a margem superior segue 158px e a inferior passa de
206px para **161px** — ou seja, o corte para 630 **melhora** o equilíbrio vertical, que hoje é
descentralizado. O círculo continua sangrando pelo canto, só com menos arco visível (142px em vez
de 187px). Verificado no render.

**Export** (`rsvg-convert` está instalado em `/opt/homebrew/bin/rsvg-convert`):
```bash
rsvg-convert -w 1200 -h 630 excalidraw-app/build/og-image-3.svg -o /tmp/og-630.png
python3 ~/.claude/skills/design-intelligence/scripts/pixel_audit.py /tmp/og-630.png
```
**Esperado:** `"dimensions":{"width":1200,"height":630}` · `luminance.mean` > 200 ·
`saturation.mean` ≤ 0.15 · dominante `#faf6ef` com share ≥ 0.75.

**Deploy:** o PNG é servido de `https://kindraw.dev/og-image-3.png` (asset estático — ver
`vite.config.mts:324`). Substituir no destino de deploy, não só no repo.

**Checkpoint de revisão A:** ver os 3 diffs juntos. `.impeccable.md` deve bater com o `:root` real.

---

## PR B — Sistema de cor: acessibilidade e acento único

> ⚠️ **4 arquivos.** Pela regra `CANNOT operar diretamente em >3 arquivos`, esta fase deve ser
> **despachada a um agente** (ou ao mini). Ver "Delegação", no fim.

### Task B1 — Corrigir os tokens que reprovam WCAG

**Arquivo:** `excalidraw-app/kindraw/kindraw.scss`, bloco `:root` (linha 6)

```diff
- --kd-faint: #a39577;
+ --kd-faint: #7c7054;   /* era 2.74:1 (reprova AA e AA-large) -> 4.53:1 AA */
- --kd-muted: #8a7e63;
+ --kd-muted: #7b7058;   /* era 3.72:1 (só AA-large) -> 4.53:1 AA */
```

**E adicionar** um token novo, sem tocar em `--kd-amber`:
```diff
  --kd-amber: #c9963f;
+ --kd-amber-text: #906a28;  /* âmbar legível como TEXTO: 4.56:1 AA sobre --kd-bg */
```

⚠️ **Por que NÃO mudar `--kd-amber`:** como **preenchimento** sobre `--kd-ink #20283a` ele dá
**5.55:1 (AA)** — o símbolo "K" da marca está correto. Escurecê-lo apagaria a marca para
consertar o texto. São dois papéis; devem ser dois tokens.

**Depois:** trocar os **10** usos de `color: var(--kd-amber)` por `var(--kd-amber-text)`:
```bash
grep -rn 'color:\s*var(--kd-amber)' excalidraw-app/kindraw/ excalidraw-app/components/
```
⚠️ Trocar **só** onde a propriedade é `color:`. `background`, `border-color`, `fill` continuam
em `--kd-amber`.

**Verificação (gate de contraste):**
```bash
python3 - <<'PY'
def lin(c):
    c=c/255
    return c/12.92 if c<=0.03928 else ((c+0.055)/1.055)**2.4
def L(h):
    h=h.lstrip('#'); return sum(w*lin(int(h[i:i+2],16)) for w,i in zip((.2126,.7152,.0722),(0,2,4)))
def r(a,b):
    la,lb=L(a),L(b); return (max(la,lb)+.05)/(min(la,lb)+.05)
BGS=["#faf6ef","#ffffff","#fcf8ee"]
FG={"--kd-faint":"#7c7054","--kd-muted":"#7b7058","--kd-amber-text":"#906a28",
    "--kd-ink-soft":"#4a4434","--kd-ink":"#20283a"}
bad=0
for n,v in FG.items():
    for bg in BGS:
        x=r(v,bg)
        if x<4.5: print(f"REPROVA {n} {v} sobre {bg}: {x:.2f}:1"); bad+=1
print("OK — todos os tokens de texto >= 4.5:1 (AA)" if not bad else f"{bad} reprovacao(oes)")
PY
```
**Esperado:** `OK — todos os tokens de texto >= 4.5:1 (AA)`

**⚠️ Decisão deixada em aberto de propósito:** corrigidos, `--kd-faint` (`#7c7054`) e
`--kd-muted` (`#7b7058`) ficam quase idênticos — **são o mesmo degrau da rampa**, hoje separados
por uma diferença que só existia abaixo do limiar de acessibilidade. Fundir os dois é a correção
honesta, mas mexe em 70 usos e é **decisão de design, não de script**. Fica para follow-up.

### Task B2 — Tokenizar o azul "Public"

**Arquivo:** `excalidraw-app/components/AppSidebar.scss`

O azul **não é acento gratuito** — é o pill de "link público" (`--public.--active`). O defeito é
não ter token, não existir. Também **não** reusar `--kd-doc-*`: aquilo é "doc mode", outra semântica.

Adicionar em `kindraw.scss` `:root`:
```scss
--kd-public:      #2d5687;  /* 6.98:1 sobre --kd-bg (AA) */
--kd-public-dark: #93b4ff;  /* variante para .theme--dark */
```

Em `AppSidebar.scss:337-339`:
```diff
  .kindraw-top-right-actions__button--public.kindraw-top-right-actions__button--active {
-   background: color-mix(in srgb, #1d4ed8 10%, var(--color-surface-lowest));
-   color: #1d4ed8;
-   border-color: color-mix(in srgb, #1d4ed8 28%, var(--color-surface-lowest));
+   background: color-mix(in srgb, var(--kd-public) 10%, var(--color-surface-lowest));
+   color: var(--kd-public);
+   border-color: color-mix(in srgb, var(--kd-public) 28%, var(--color-surface-lowest));
  }
```
E em `AppSidebar.scss:515-516` (dentro de `&.theme--dark`): `#93b4ff` → `var(--kd-public-dark)`.

**Verificação:**
```bash
grep -rn '#1d4ed8\|#93b4ff' excalidraw-app/
```
**Esperado:** saída vazia.

### Task B3 — Consolidar os 4 vermelhos

Existem **4 valores para 1 semântica**: `--kd-danger: #b42318` (6.10:1 AA ✅) mais três órfãos.

| Arquivo:linha | Hoje | Vira |
|---|---|---|
| `kindraw.scss:2086` | `color: #c0392b` | `color: var(--kd-danger)` |
| `kindraw.scss:2728` | `color: #c94a4a` | `color: var(--kd-danger)` |
| `kindraw.scss:4039` | `background: #e8b4ad` | `background: var(--kd-danger-bg)` |

⚠️ `#e8b4ad` é **fundo**, não texto — mapeia para `--kd-danger-bg`, não `--kd-danger`.
Confira visualmente: se o contraste do texto sobre ele mudar, ajuste em vez de forçar.

### Task B4 — Adotar `--kd-*` nos 3 arquivos com 0% de adoção

| Arquivo | `var(--kd-*)` hoje | hex |
|---|---:|---:|
| `components/AppSidebar.scss` | 0 (→ resolvido em B2) | 5 |
| `kindraw/SignInDropdown.scss` | 0 | 1 |
| `index.scss` | 0 | 6 |

Caso concreto em `index.scss:48-49` e `:64-65`: `#ecfdf5`/`#064e3c` duplicam a semântica de
`--kd-ok`/`--kd-ok-bg` com valores diferentes. Unificar em `var(--kd-ok)` / `var(--kd-ok-bg)`.

⚠️ **Julgamento necessário:** `AppSidebar.scss` escreve contra o namespace do **upstream**
(`--color-surface-lowest`). Isso é **deliberado** — é o que faz a sidebar escurecer junto com o
editor (ver PR C). **Não converter os tokens de superfície do upstream para `--kd-*`** — converter
só as cores **semânticas** hardcoded. Converter as de superfície quebraria o dark mode que já funciona.

### Verificação final do PR B
```bash
yarn fix && yarn test:typecheck && yarn test:update
```
**Esperado:** os três verdes.

**Checkpoint de revisão B:** `/ring:codereview` — 5 revisores em paralelo. Atenção especial ao
`ring:code-reviewer` para a fronteira upstream × `--kd-*`.

---

## PR C — Dark mode do shell (bloqueado por validação)

> ⚠️ **Premissa a confirmar antes de codar.** A auditoria mediu: os 38 tokens `--kd-*` estão em
> `:root` e **nunca** são redefinidos sob seletor dark, enquanto `index.scss` (3×) e
> `AppSidebar.scss` (1×) têm blocos `.theme--dark` que rodam nos tokens do upstream.
> **A inferência é que o shell fica claro enquanto o editor escurece — mas isso NÃO foi
> confirmado em pixel** (sem `feqa` nesta máquina, sem screenshot em dark).

### Task C1 — Validar visualmente (gate)
```bash
yarn start     # abrir o app, alternar para tema escuro
```
Capturar o shell em dark. **Se o shell escurece corretamente, PARE — não há defeito e este PR
morre aqui.** Se fica claro contra um editor escuro, siga.

### Task C2 — Bloco `.theme--dark` para os 38 tokens

⚠️ **NÃO usar `light-dark()`.** O app já tem **dois** padrões de tema (tokens do upstream que
viram + overrides `.theme--dark`). `light-dark()` seria um **terceiro**. Siga o padrão existente:

```scss
.theme--dark {
  --kd-bg: <...>;
  --kd-surface: <...>;
  /* ... os 38 ... */
}
```

⚠️ **Isto é trabalho de DESIGN, não mecânico** — são 38 valores escuros a escolher, mantendo:
(a) a temperatura quente da marca; (b) contraste AA em todos os pares de texto; (c) o âmbar
legível sobre fundo escuro. Já existe um sinal de que alguém começou: `index.scss:20` traz
`--color-primary-contrast-offset: #e6c37e; // amber light for dark mode`.

**Recomendação:** rodar `/ring:brainstorm` para a paleta escura **antes** de escrever CSS, e
passar o mesmo gate de contraste da Task B1 sobre os 38 valores novos.

---

## Fora de escopo (declarado, não esquecido)

| Item | Por que fica de fora |
|---|---|
| Variante de OG com screenshot do canvas | P4 diz "produto como prova", mas typography-first é receita canônica (75% de 896). É teste A/B, não correção. |
| Fundir `--kd-faint` + `--kd-muted` | 70 usos, decisão de design. Follow-up após B1. |
| Pixel audit do shell de produto | `feqa` não instalado nesta máquina. Fica não medido, e isso está dito. |
| Qualquer coisa em `packages/` | É upstream. Não é nosso. |

---

## Recuperação de falha

| Sintoma | Ação |
|---|---|
| `yarn test:update` falha após mudança de cor | Snapshot de cor. Inspecione o diff: se só a cor mudou e é a esperada, aceite. Se mudou **layout**, reverta — não era só cor. |
| Contraste piorou em algum par | Rode o gate da B1 com o par real de fundo. Não ajuste "no olho". |
| Dark mode quebrou após B4 | Você converteu token de **superfície** do upstream. Reverta esse hunk (ver aviso na B4). |
| Worktree suja / conflito | `git -C <worktree> status`. Nunca `reset --hard` sem checar. |

## Teste zero-contexto

Um engenheiro sem contexto do Kindraw consegue executar? Cada task traz: arquivo exato, número de
linha, valor de antes e depois, comando de verificação e saída esperada. As três decisões que
**exigem julgamento** (fundir faint/muted, paleta escura, fronteira upstream×`--kd-*`) estão
marcadas como decisão, não escondidas como passo mecânico.

## Marcador obrigatório no PR

Como os hooks de commit estão **recusados neste clone** (husky ocupa `core.hooksPath`), o vínculo
vai no **corpo do PR, à mão** — uma linha basta:
```
Work-Control-ID: <uuid do jarvis_work_submit>
```
⚠️ Se separar seções na mensagem de commit, **não use `---`** — o git trata como cut-line e o
trailer fica invisível para o portão. Use `##`.
