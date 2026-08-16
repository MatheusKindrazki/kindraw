# Direção de design — Kindraw (shell de produto + OG image)

> Preenchido a partir da skill `design-intelligence`. Heurísticas: `references/heuristics.md`.
> Fontes: `references/sources.md`. Regras de uso: `references/compliance.md`.
>
> Data: `2026-08-16` · Responsável: Matheus Kindrazki
> Repo: `~/development/personal/kindraw` (branch default `master`)

---

## 0. Achado que precede tudo: o doc de design está desatualizado

`.impeccable.md` (commit `3be179fa`, **2026-05-29**) declara como brand color o roxo **`#6965DB`**
(+ `#5B57D1`, `#4A47B1`, `#E3E2FE`, `#5753D0`).

**Medido no código shipado hoje:**

- **Zero** ocorrências desses roxos em fonte Kindraw. As 3 únicas ocorrências em `excalidraw-app/`
  estão em `build/oss_promo_presentations_light.svg` e afins — **assets promo do upstream Excalidraw**,
  não da marca Kindraw. (`#6965db` é o roxo institucional do próprio Excalidraw.)
- O sistema real é **âmbar + navy sobre creme**, introduzido em `1e9e8151`, **2026-06-12**
  ("redesign 'Ateliê' do shell"), **14 dias depois** de `.impeccable.md` ser escrito — que nunca foi atualizado.

Ou seja: o documento que deveria governar o design descreve a identidade *anterior ao rebrand*.
Qualquer agente ou pessoa que leia `.impeccable.md` como fonte-da-verdade vai propor roxo num
produto que é âmbar. **Corrigir `.impeccable.md` é o item de maior alavancagem desta auditoria** —
custa uma edição e destrava todo o resto.

---

## 1. Gênero e superfície

- **Superfície:** dashboard/produto (shell ao redor do canvas) + OG image
- **Sub-gênero:** ferramenta de pensamento visual, drawing-first; chrome que emoldura um canvas sempre-claro
- **Formato/dimensões:** app desktop-first com sidebar `--kd-sidebar-w` + topbar `--kd-topbar-h`; OG 1200×630
- **Por que este gênero define a densidade:** o canvas é o protagonista. Densidade alta é permitida
  **só na área de dados** (workspace/sidebar/lista de drawings); o chrome fica neutro e recua
  (`heuristics.md` §Dashboard, item 4).

## 2. Público e posicionamento

- **Público:** times pequenos async-first e indivíduos que pensam visualmente; desktop, sessões longas
- **Posicionamento:** produto/confiança (light), com alma handmade — não dev-tool premium/arquivo
- **O que a peça precisa provar:** que dá pra organizar *muitos* desenhos e compartilhar sem overhead de SaaS

## 3. Polo: light ou dark

- **Polo escolhido:** **light** ✅
- **Luminância alvo:** > 200 · **medido na OG: 235.29**
- **Por quê:** o canvas do Excalidraw é sempre claro. Chrome escuro criaria uma moldura que compete
  com o conteúdo — exatamente o oposto do princípio "o canvas é o protagonista".
- **Confirmação:** nenhum cinza médio (~lum 120) como base. ✅
  A base é `--kd-bg: #faf6ef` (creme quente) — neutro **tintado**, não cinza estéril. Correto pelo DNA.

## 4. Acento único

- **Cor:** `--kd-amber: #c9963f` (deep `#7a5414`, soft `#f1e6cf`, chip `#f5e7c8`)
- **Papel funcional:** marca (símbolo "K"), ações primárias, estados ativos, chips
- **Onde NÃO aparece:** superfícies de fundo, texto de corpo, bordas estruturais
- **Confirmação:** ❌ **FALHA** — existe um **segundo acento saturado sem token**.

  `excalidraw-app/components/AppSidebar.scss` usa azul hardcoded, fora do sistema:

  ```
  :337-339   #1d4ed8   (saturação 0.76)  — background/color/border-color
  :515-516   #93b4ff   (saturação 1.00)  — color/border-color
  ```

  Isso é o **anti-padrão #2 (multi-acento)** do `SKILL.md` §5. Azul tem sanção parcial no sistema
  (`--kd-doc-bg: #dce7f7` / `--kd-doc-fg: #2d5687`, semântica de "doc mode"), mas `#1d4ed8` não é
  nenhum dos dois — é uma terceira geração de azul, saturada, inventada no arquivo.

  Agravante: `AppSidebar.scss` tem **0 usos de `var(--kd-*)`** e escreve contra o namespace do
  upstream (`var(--color-surface-lowest)`). Ele está inteiramente fora do sistema Kindraw.

- **Saturação de base:** ✅ **0.0711** na OG (alvo ≤0.15).

## 5. Papel da tipografia

- **A tipografia carrega a identidade?** **Sim** — a OG é wordmark + tagline sobre fundo limpo,
  sem screenshot. É a receita `typography-first` (75% de 896 itens no OGFolio).
- **Weight / tracking / escala:** wordmark pesado (~700) em navy `#20283a`; tagline em duas linhas
  com hierarquia por cor (linha 1 em ink, linha 2 em `--kd-faint`/`--kd-muted`), não por tamanho.
  Escala fluida `clamp(2rem, 4vw, 3rem)` para h1; labels de seção em uppercase com tracking 0.06–0.08em.
- **Faces:** **Assistant** no chrome (400/500/600/700) · **Virgil/Excalifont** no canvas.
  Manter o split — a fonte desenhada à mão é a alma do produto e o chrome limpo é o que o torna confiável.

## 6. Papel do screenshot / produto

- **O produto aparece?** **Não** na OG.
- **Como:** hoje é marca + tagline, zero prova visual.
- **Se não aparece, por quê:** é uma escolha brand-forward defensável, **mas está deixando valor na mesa**.
  Kindraw é um produto *visual* — e o OGFolio mede screenshot/mockup como prova em ≈400 instâncias
  de tag sobre 896 itens (P4: "o produto como prova visual"). Para um whiteboard, um canvas real
  emoldurado comunica em 1 segundo o que a tagline leva 2 linhas para dizer.
  **Não é violação** (typography-first é receita canônica), é **oportunidade** — ver §11.

## 7. Densidade alvo (por gênero)

| Gênero | Faixa de `edge_density` | Alvo desta peça |
|---|---|---|
| Pitch / sales deck, keynote | 0.015–0.035 | — |
| Card social / announcement | 0.026–0.077 | — |
| Report / portfolio deck | 0.072–0.17 | — |
| Gráfico / conteúdo técnico | 0.11–0.12 | — |
| **OG image (typography-first)** | — | **medido 0.0820** |

A OG não tem faixa canônica no dossiê. 0.0820 é coerente com uma peça de tipo grande + duas formas
decorativas: informa sem lotar. Sem ação.

## 8. Esqueleto narrativo

- **Gênero de storytelling:** produto/confiança — a promessa é *"abre e já está desenhando"*.
- **Sequência desta peça:** marca → o que é (1 linha) → o que dá pra fazer com ela (1 linha).
  A OG atual executa isso corretamente.

## 9. Referências (2–3, por link)

⚠️ **Declaração de método:** as galerias **não foram refetchadas nesta sessão**, por decisão de
compliance — `compliance.md` regra 1 (sem bulk-download), regra 5 (OGFolio serve `noindex` em todas
as páginas; uso interno de referência apenas) e regra 6 (SaaSpo só via Wayback, sem contornar o
Cloudflare). As heurísticas de `references/heuristics.md` **já são** a extração atribuída dessas
fontes (dossiê deepsearch, 2026-08-14, 193 amostras / 46 análises pixel-quantitativas). Cito por
link e atribuição, como manda a regra 7.

### Referência 1 — OGFolio
- **Link:** https://ogfolio.com/index
- **Criador / fonte / data:** OGFolio · censo de 896 itens via payload · dossiê 2026-08-14
- **Padrão extraído** — polo: 3 receitas (Light `#fafaf9/#fcfcfc` 90%+ da área com texto preto ·
  Dark `#0f–#2a` com texto branco · Color saturada) · acento: 1, saturação cheia é rara e usada como
  statement · densidade: n/a · tipografia: **typography-first em 75% (669/896)** · produto:
  screenshot/mockup como prova em ≈400 instâncias de tag.
- **O que NÃO copiar:** a paleta e o layout de qualquer OG específica do acervo. Kindraw usa a
  **receita Light** com seu próprio creme quente `#faf6ef` — não o `#fafaf9` neutro do padrão.

### Referência 2 — LogoInspo
- **Link:** https://www.logoinspo.com/symbol-and-text
- **Criador / fonte / data:** LogoInspo · 441+ itens na categoria · dossiê 2026-08-14
- **Padrão extraído** — polo: teste em dark canvas (n=6, inferência) · acento: padrão "1% de cor"
  (acento cromático pontual sobre fundo quase-neutro, foco total na forma) · tipografia: lockup
  Symbol & Text é o **default** (441+ vs wordmark 267+ vs symbol 76+).
- **O que NÃO copiar:** formas, grid de construção ou paleta de qualquer marca do acervo.
  O que se aproveita é a **estrutura**: Kindraw já usa Symbol & Text (quadrado navy + "K" âmbar +
  wordmark), que é o lockup majoritário — e o "K" âmbar sobre navy é literalmente o padrão "1% de cor".

### Referência 3 — Inspora (categoria Product)
- **Link:** https://inspora.design
- **Criador / fonte / data:** Inspora · 54 posts (censo) · dossiê 2026-08-14
- **Padrão extraído** — densidade alta é aceitável **na área de dados**, com o chrome em neutro;
  microinteração com física (spring) como assinatura; AI-states como categoria própria em 2026.
- **O que NÃO copiar:** nada visual. ⚠️ `compliance.md` regra 4: **não automatizar** o Inspora
  (challenge Vercel, robots 404) — navegação manual apenas.

**Confirmação:** referências estudadas por link, **nenhuma imagem baixada** para o entregável,
atribuição (criador + URL + data) registrada. ✅

## 10. Motion

- **Há motion?** Sim no app (busca de ícones animada, transições de sidebar).
- **Função:** estado e feedback. Correto — motion decorativo contínuo é anti-padrão (#7).
- **Se for OG image:** motion não se aplica; o investimento foi em tipo e lockup. ✅

---

## 11. Verificação

```bash
python3 scripts/pixel_audit.py /tmp/kindraw-di/og-image-3.png
```

### OG image — `https://kindraw.dev/og-image-3.png`

| Métrica | Alvo | Medido | OK? |
|---|---|---|---|
| `luminance.mean` | >200 (light) | **235.29** | ✅ |
| `contrast.std` | ≥40 | **35.46** | ❌ |
| `saturation.mean` | ≤0.15 | **0.0711** | ✅ |
| `edge_density` | faixa do gênero | 0.0820 | ✅ |
| `dominant_colors` | 1 neutro + 1 acento | `#faf6ef` 78.4% · `#f3e6cc` 10.9% · `#20283a` 1.9% | ⚠️ |
| `dimensions` | **1200×630** | **1200×675** | ❌ |

**Leitura das três marcas:**

1. **`dimensions` 1200×675 (16:9) em vez de 1200×630 (1.91:1)** — violação direta do padrão de facto
   (10/12 amostras do OGFolio). Consequência real: o Twitter/X e o Facebook renderizam `summary_large_image`
   em 1.91:1 e **cortam 47px** (23 no topo, 24 na base). O `og:image:alt` diz "Kindraw logo", mas o crop pode comer
   parte do círculo decorativo inferior. Correção: reexportar em 1200×630 (o SVG-fonte existe em
   `excalidraw-app/build/og-image-3.svg`).
2. **`contrast.std` 35.46 < 40** — ⚠️ **com ressalva honesta**: esse número é o desvio-padrão de
   luminância da **imagem inteira**, e 89% da área é fundo claro chapado (`#faf6ef` + `#f3e6cc`).
   Uma OG typography-first bem-feita naturalmente pontua baixo aqui. O texto em si — navy `#20283a`
   sobre creme `#faf6ef` — tem contraste **~13.6:1**, muito acima de WCAG AAA. **Não trate como defeito
   de legibilidade.** É um limite da métrica agregada, não da peça. A única perda real de contraste é a
   segunda linha da tagline, em tom `--kd-faint`-like sobre creme.
3. **`dominant_colors`: 1 neutro dominante ✅, mas o acento não registra.** O "K" âmbar é pequeno demais
   para entrar no top-5. Na prática a OG lê como **neutra pura**. Coerente com o padrão "1% de cor"
   do LogoInspo — mas significa que a OG não carrega sinal cromático de marca em thumbnail pequeno.

### Shell de produto — auditoria estática de tokens

Não há screenshot: `feqa` (frontend-qa-harness) **não está instalado nesta máquina**, então o
`design_intelligence_auditor.py` não roda (ele depende de `feqa` para subir o server e capturar
viewports). O que segue é auditoria de código, não de pixel — **as métricas de pixel do shell
seguem não medidas** e essa lacuna está declarada, não preenchida por estimativa.

**O sistema de tokens é bom.** 38 custom properties `--kd-*`, semanticamente nomeadas, com
tokens de severidade próprios (`--kd-ok`, `--kd-live`, `--kd-danger`) — que é exatamente o que
faltava no caso Jarvis Admin citado no `SKILL.md`. Amostra dos valores:

```
--kd-bg: #faf6ef      --kd-ink: #20283a       --kd-amber: #c9963f     --kd-ok: #3e7c4f
--kd-surface: #ffffff --kd-ink-soft: #4a4434  --kd-amber-deep: #7a5414 --kd-live: #2f8f54
--kd-canvas: #fcf8ee  --kd-muted: #8a7e63     --kd-amber-soft: #f1e6cf --kd-danger: #b42318
--kd-line: #eadfcb    --kd-faint: #a39577     --kd-amber-chip: #f5e7c8
```

Coerência notável: `--kd-bg: #faf6ef` é **exatamente** a cor dominante da OG (78.4%) e
`--kd-ink: #20283a` é exatamente o navy do texto. App e OG partilham o mesmo chão. Isso é raro e bom.

**O vazamento é concentrado, não difuso** — adoção de `var(--kd-*)` vs hex hardcoded:

| Arquivo | `var(--kd-*)` | hex | adoção |
|---|---:|---:|---|
| `kindraw/kindraw.scss` | 508 | 65 | **89%** ✅ |
| `components/AgentsGuide.scss` | 34 | 16 | 68% ⚠️ |
| `components/ApiTokensDialog.scss` | 49 | 35 | 58% ⚠️ |
| `components/SettingsDialog.scss` | 26 | 21 | 55% ⚠️ |
| `components/AppSidebar.scss` | **0** | 5 | **0%** ❌ |
| `kindraw/SignInDropdown.scss` | **0** | 1 | **0%** ❌ |
| `index.scss` | **0** | 6 | **0%** ❌ |
| **total** | **617** | **151** | **~80%** |

São **47 cores únicas** hardcoded em 151 ocorrências, contra 38 tokens definidos.

**Duplicação semântica medida** (mesma função, valores diferentes, sem token):

- **Vermelho — 4 valores para 1 semântica:** `--kd-danger: #b42318` + `#c0392b` (`kindraw.scss:2086`)
  + `#c94a4a` (`:2728`) + `#e8b4ad` (`:4039`).
- **Verde — token duplicado:** `--kd-ok: #3e7c4f` / `--kd-ok-bg: #e4efe2` versus
  `#064e3c` / `#ecfdf5` hardcoded em `index.scss:48-49` e `:64-65`.
- **Azul — família inteira sem token:** ver §4.

### Contraste WCAG — computado por token, não a olho

O achado mais acionável da auditoria. Ratios calculados (WCAG 2.x relative luminance) para cada token
de texto contra as três superfícies do sistema:

| Token de texto | sobre `--kd-bg` `#faf6ef` | sobre `--kd-surface` `#ffffff` | sobre `--kd-canvas` `#fcf8ee` |
|---|---|---|---|
| `--kd-faint` `#a39577` | **2.74:1 REPROVA** | **2.95:1 REPROVA** | **2.78:1 REPROVA** |
| `--kd-amber` `#c9963f` | **2.46:1 REPROVA** | **2.65:1 REPROVA** | **2.50:1 REPROVA** |
| `--kd-muted` `#8a7e63` | 3.72:1 AA-large | 4.00:1 AA-large | 3.78:1 AA-large |
| `--kd-ink-soft` `#4a4434` | 8.99:1 AAA ✅ | 9.69:1 AAA ✅ | 9.13:1 AAA ✅ |
| `--kd-ink` `#20283a` | 13.67:1 AAA ✅ | 14.73:1 AAA ✅ | 13.89:1 AAA ✅ |

**Volume de uso** (todas as ocorrências são `color:` — são tokens que só existem para pintar texto):

- `--kd-faint`: **37 usos**, 37 deles `color:` → **reprova AA e AA-large em toda superfície**
- `--kd-muted`: **33 usos**, 33 deles `color:` → só passa se o texto for ≥18.66px ou ≥14px bold
- `--kd-amber`: 17 usos, **10 deles `color:`** → reprova como texto

**São 47 usos de cor de texto que reprovam WCAG AA em qualquer fundo do sistema**, mais 33 que
dependem de o texto ser grande — e nada no código garante isso.

Ressalva justa: `--kd-amber` como **preenchimento** sobre `--kd-ink` `#20283a` dá **5.55:1** (AA ✅).
O símbolo "K" da marca está correto. O problema é exclusivamente âmbar **como cor de texto sobre creme**.

**Correção mantendo matiz e saturação** (escurecendo só o L até cruzar 4.5:1 no pior fundo):

```
--kd-faint : #a39577  (2.74:1)  ->  #7c7054  (4.53:1 AA)
--kd-muted : #8a7e63  (3.72:1)  ->  #7b7058  (4.53:1 AA)
--kd-amber : #c9963f  (2.46:1)  ->  #906a28  (4.56:1 AA)   ← só para uso como texto
```

⚠️ `--kd-faint` e `--kd-muted` corrigidos ficam quase idênticos (`#7c7054` vs `#7b7058`) — sinal de
que **são o mesmo degrau da rampa**, hoje separados por uma diferença que só existe abaixo do limiar
de acessibilidade. A correção honesta provavelmente é **fundir os dois** e criar o degrau extra
acima, não abaixo. Isso é decisão de design, não de script.

### Dark mode: não é "planejado" — está pela metade, e isso é provavelmente um bug visível

⚠️ **Correção a uma conclusão anterior desta auditoria.** A leitura inicial foi "0 `light-dark()` →
o dark theme planejado exigirá reescrita". Errado nos dois lados. O que o código diz:

- **Dark mode existe e roda.** Há `&.theme--dark` em `index.scss` (3×) e `AppSidebar.scss` (1×).
  O comentário em `AppSidebar.scss:509-511` é explícito: *"the surface tokens above already flip
  warm-dark, so the sidebar darkens with the editor"*. A sidebar e o editor escurecem porque
  escrevem contra os tokens do **upstream** (`--color-surface-*`), que já viram com o tema do Excalidraw.
- **Os 38 tokens `--kd-*` estão definidos uma única vez, em `:root` (`kindraw.scss:6`), e nunca são
  redefinidos sob nenhum seletor dark.** Zero overrides.

**Consequência medida:** ao alternar para dark, os **508 usos** de `var(--kd-*)` que pintam o shell
Kindraw continuam claros, enquanto o editor e a sidebar escurecem. O app tem **dois sistemas de tema
convivendo** — upstream (dark-capable) e `--kd-*` (light-only) — e a fronteira entre eles é
exatamente onde o tema quebra.

⚠️ **Não confirmado visualmente** (sem `feqa`, sem screenshot em dark). É inferência a partir do CSS,
forte mas não medida em pixel. **Validar antes de tratar como bug** — é o primeiro passo do plano.

Há sinal de que a adaptação começou e parou: `index.scss:20` traz
`--color-primary-contrast-offset: #e6c37e; // amber light for dark mode`.

**Recomendação corrigida:** **não** introduzir `light-dark()`. Seria um **terceiro** padrão de tema
num app que já tem dois. O caminho coerente com o código existente é um bloco `.theme--dark`
redefinindo os 38 tokens `--kd-*` — mesma estratégia que `index.scss` e `AppSidebar.scss` já usam.

### Checklist de auditoria

- [x] Polo light OU dark extremo (sem cinza médio dominante) — lum 235.29, base creme tintada
- [ ] **Exatamente 1 acento saturado** — ❌ azul `#1d4ed8`/`#93b4ff` sem token em `AppSidebar.scss`
- [x] Tipografia carrega identidade — Assistant/Virgil split, wordmark como arte na OG
- [ ] **Produto/screenshot aparece como prova** — ❌ ausente na OG (oportunidade, não violação grave)
- [x] Contraste ≥40 nas áreas de texto (OG) — métrica agregada falha (35.46), **texto real 13.67:1** ✅
- [ ] **Contraste WCAG no shell de produto** — ❌ 47 usos reprovam AA (`--kd-faint` 2.74:1, `--kd-amber` 2.46:1)
- [x] Densidade adequada ao gênero — 0.0820, coerente
- [n/a] Formato feed-native (social)
- [n/a] Footer nos 3 arquétipos
- [ ] **OG image 1200×630 typography-first** — ❌ é 1200×675; typography-first ✅
- [ ] **Nenhum dos 10 anti-padrões** — ❌ anti-padrão #2 (multi-acento)

**Placar: 6 de 10 aplicáveis.**

---

## 12. Correções, por alavancagem

| # | Ação | Onde | Custo | Por quê |
|---|---|---|---|---|
| 1 | **Corrigir os 3 tokens de texto que reprovam WCAG** (`--kd-faint`, `--kd-muted`, `--kd-amber`-como-texto) e avaliar fundir faint+muted | `kindraw.scss` `:root` | baixo | 47 usos ilegíveis + 33 dependentes de tamanho. É acessibilidade, não estética — e o fix é 3 linhas. |
| 2 | **Reescrever `.impeccable.md`**: roxo `#6965DB` → âmbar `#c9963f` + navy `#20283a` + creme `#faf6ef`; listar os 38 tokens `--kd-*` como fonte-da-verdade | `.impeccable.md` | baixo | O doc de design mente sobre a marca há ~2 meses. Todo agente que o ler propõe a cor errada. |
| 3 | **Reexportar OG em 1200×630** | `build/og-image-3.svg` → `og-image-3.png` | baixo | Corta **47px** hoje (23 topo + 24 base) em X/Facebook. |
| 4 | **Tokenizar o azul "Public"**: criar `--kd-public`/`--kd-public-bg`, não reusar `--kd-doc-*` | `AppSidebar.scss:337-339,515-516` | baixo | O azul **é semântico** (pill de link público) — o defeito é não ter token, não existir. Fecha o anti-padrão #2. |
| 5 | **Consolidar os 4 vermelhos em `--kd-danger`** | `kindraw.scss:2086,2728,4039` | baixo | 1 semântica, 1 token. |
| 6 | **Adotar `--kd-*` nos 3 arquivos com 0% de adoção** | `AppSidebar.scss`, `SignInDropdown.scss`, `index.scss` | médio | São 12 hex, mas `AppSidebar` escreve contra o namespace do upstream — é dívida estrutural. |
| 7 | **Fechar o dark mode**: bloco `.theme--dark` redefinindo os 38 `--kd-*` (⚠️ **não** usar `light-dark()` — seria um 3º padrão de tema) | `kindraw.scss` | médio | Hoje o shell fica claro enquanto editor+sidebar escurecem. Validar visualmente primeiro. |
| 8 | *(opcional)* **Testar variante de OG com canvas real** | nova arte | médio | P4: produto como prova. Medir A/B — a versão typography-first é canônica e pode ganhar. |

**Aprendizado para o arquivo de padrões pessoais:** quando um repo tem doc de design **e** token
layer, audite a **data dos dois** antes de confiar em qualquer um — aqui o doc (`2026-05-29`) é
14 dias mais velho que o rebrand que os tokens implementam (`2026-06-12`), e ler só o doc levaria a
propor a cor da identidade anterior com toda a confiança do mundo.

---

### Proveniência

- Números de pixel: `scripts/pixel_audit.py` sobre `https://kindraw.dev/og-image-3.png` baixada em 2026-08-16.
- Números de código: `grep`/`git log` sobre `~/development/personal/kindraw` @ `master` (working tree limpo).
- Heurísticas e alvos: dossiê deepsearch `design-intelligence-deepsearch-v2` (2026-08-14) — 8 fontes,
  193 amostras, 46 análises pixel-quantitativas.
- **Não medido:** pixels do shell de produto (`feqa` ausente). **Não refetchado:** as 8 galerias (compliance).
