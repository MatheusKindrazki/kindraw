# Roteiro do GIF de demo — Kindraw landing

**Objetivo:** GIF mudo, ~20-25s, loop, que cabe no placeholder da landing (`.kindraw-landing__demo`, frame 16:10).
**História (a da pesquisa de GTM):** prompt no Claude Code → diagrama com layout de verdade → abre o share link → edita junto. O ponto não é "o agente desenha", é **"o diagrama fica vivo num workspace compartilhável"**.
**Cenário:** serviço de pagamentos (bate com a landing `payments-architecture` e o copy do step 2).

---

## Setup (antes de gravar)

1. **Tela limpa:** janela larga (≥1440px), tema claro, sem notificações. Esconda barra de favoritos / docks.
2. **Dois apps lado a lado** (ou troca rápida entre eles): **Claude Code** (terminal/editor) à esquerda, **Chrome em kindraw.dev** à direita. O GIF vai cortar entre os dois.
3. **MCP do Kindraw conectado no Claude Code.** IMPORTANTE: reinicie o Claude Code antes (o MCP global `@kindraw/mcp@0.2.0` só carrega no restart; nesta sessão ainda estava o plugin antigo). Confirme com `/mcp` que `kindraw` aparece conectado, com as tools novas (`kindraw_create_hybrid`, `kindraw_create_scene`).
4. **Ferramenta de captura:** Kap (Mac, exporta GIF direto) ou CleanShot. Grave a ~30fps, depois corte para loop.
5. **Diagrama de backup já pronto** (caso queira pular a geração ao vivo): `Payments Architecture` na sua workspace — https://kindraw.dev/draw/65ff3c20-f492-470f-bd06-7e9e9dc77be8 (26 elementos, layout dagre). Use o atalho **Shift+1** (zoom-to-fit) ou **Shift+2** (zoom-to-selection) pra enquadrar.

---

## Roteiro plano a plano (~22s)

### Plano 1 — O prompt (0–6s) · Claude Code
- Mostra você digitando no Claude Code (ou já digitado, cursor piscando):
  > **"Desenha a arquitetura do nosso serviço de pagamentos no Kindraw — a API, a fila, o settlement worker, os dois bancos e o PSP."**
- Enter. O Claude chama a tool `kindraw_create_hybrid` (ou `create_scene`). Mostra a tool-call acontecendo (a linha do MCP rodando) — **isso é o "wow" pro dev**: o agente desenhou sozinho.
- Termina com a resposta do Claude trazendo a **URL** (`kindraw.dev/draw/...` ou `/hybrid/...`).

### Plano 2 — O diagrama aparece (6–13s) · Chrome / kindraw.dev
- Corta pro Chrome. Abre a URL. O canvas carrega com o diagrama **já posicionado** — níveis limpos (dagre), nós coloridos, setas borda-a-borda. **Shift+1** pra enquadrar bonito.
- Deixa 1-2s parado pro olho absorver: "o agente fez isso, e ficou organizado, não um espaguete".
- (Opcional, reforça o diferencial) hover/scroll suave mostrando que é um canvas Excalidraw editável de verdade.

### Plano 3 — Compartilhar (13–18s)
- Clica no botão de **share / link público** (topo do canvas). Copia o link.
- Mostra o toast "link copiado" / o dialog de Public link. Mensagem implícita: **"isso tem um endereço, vive em algum lugar"** — não é um arquivo no disco.

### Plano 4 — Editar junto (18–22s)
- Cola o link numa **segunda aba/janela** (ou simula um colega). Move um nó, ou edita um label.
- A edição aparece (realtime se colab estiver ligada; senão, só mostra que é editável e persiste).
- **Última frame** (a que vira o loop): o diagrama bonito + o cursor de outra pessoa OU o link visível. Reforça "stays alive, together".

---

## Regras de ouro (pra não ter cara de slop)

- **Sem mouse tremendo.** Movimentos lentos e retos. Se errar, regrava o plano.
- **Sem texto/UI de debug** na tela (terminal de erro, devtools, etc).
- **Corte cedo, corte curto.** 20-25s. Ninguém assiste GIF longo. O loop tem que ser satisfatório.
- **A primeira e a última frame importam mais** (é o que aparece parado). Comece já com algo acontecendo, termine no diagrama pronto.
- **Mudo de propósito** — tudo tem que ler sem áudio. Se algo só faz sentido com narração, mostra na tela.

---

## Onde colocar o GIF depois

Substituir o placeholder em `excalidraw-app/kindraw/KindrawApp.tsx`, bloco `.kindraw-landing__demo` (marcado com `{/* TODO: demo GIF ... */}`). Exportar o GIF otimizado (<3MB ideal; use gifsicle ou exporte como `.mp4`/`.webm` com `<video autoplay loop muted playsinline>` se quiser qualidade melhor e arquivo menor — recomendo o vídeo em vez de GIF puro pro peso). Servir de `excalidraw-app/public/`.

---

## Variações de prompt (se quiser regravar com outro ângulo)

- **Curto:** "Diagrama do serviço de pagamentos no Kindraw."
- **Code-aware (mais impressionante):** "Olha o módulo `payments/` e desenha a arquitetura dele no Kindraw." (mostra o agente lendo o código → diagrama — o pitch mais forte da pesquisa).
- **Atualização (mostra o "stay in sync"):** depois do primeiro, "agora adiciona um cache Redis entre a API e o banco" → o agente atualiza o mesmo diagrama. Esse é o golpe de misericórdia contra "diagram rot".
