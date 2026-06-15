import { useEffect } from "react";

import {
  defaultLang,
  getLanguage,
  languages,
  setLanguage,
  t,
} from "@excalidraw/excalidraw/i18n";

import { atom, useAtomValue, useSetAtom } from "../app-jotai";
import { appLangCodeAtom } from "../app-language/language-state";

import type { Language, TranslationKeys } from "@excalidraw/excalidraw/i18n";

/**
 * i18n para o "shell" do Kindraw (lista de workspace, modais, editores
 * híbridos) que renderiza FORA do `<Excalidraw>`.
 *
 * O `useI18n()` do pacote depende do `editor-jotai`, que usa `jotai-scope`
 * (`createIsolation`) e só tem Provider dentro do `<Excalidraw>`. Chamá-lo no
 * shell quebra com erro de contexto. Aqui usamos o `app-jotai` (jotai global,
 * sem Provider) para disparar re-render na troca de idioma. A função `t()`
 * continua sendo a mesma do pacote; ela lê estado de módulo, então funciona em
 * qualquer lugar.
 */

const resolveLanguage = (langCode: string): Language =>
  languages.find((lang) => lang.code === langCode) || defaultLang;

/**
 * Tradução com pluralização. O `t()` do Excalidraw não tem plural automático,
 * então usamos duas chaves por contagem — `${baseKey}One` e `${baseKey}Other` —
 * e escolhemos pela contagem (regra simples singular/plural, suficiente para
 * en/pt). Ex.: `tCount("kindraw.workspace.itemCount", 3)` → "3 itens".
 */
export const tCount = (baseKey: string, count: number): string => {
  const key = (
    count === 1 ? `${baseKey}One` : `${baseKey}Other`
  ) as TranslationKeys;
  return t(key, { count });
};

/**
 * Código do idioma cujos dados de tradução JÁ foram carregados por
 * `setLanguage`. Diferente do `appLangCodeAtom` (idioma *desejado*): só avança
 * depois que o `import()` do locale resolve, evitando um flash do fallback em
 * inglês enquanto o JSON carrega. Inicializa com o idioma já vigente no módulo
 * (`en` no primeiro boot).
 */
const loadedLangCodeAtom = atom(getLanguage().code);

/**
 * Aplica o idioma selecionado (carrega os dados de tradução via
 * `setLanguage`). Deve ser montado UMA vez no topo do shell — é o equivalente
 * ao `<InitializeApp>` que o `<Excalidraw>` usa internamente. Sem isso, o shell
 * renderizaria sempre em inglês (fallback do `en.json`).
 */
export const useKindrawLangBootstrap = () => {
  const langCode = useAtomValue(appLangCodeAtom);
  const setLoadedLangCode = useSetAtom(loadedLangCodeAtom);

  useEffect(() => {
    const currentLang = resolveLanguage(langCode);
    let cancelled = false;

    const apply = async () => {
      if (getLanguage().code !== currentLang.code) {
        await setLanguage(currentLang);
      }
      if (!cancelled) {
        setLoadedLangCode(currentLang.code);
      }
    };

    void apply();

    return () => {
      cancelled = true;
    };
  }, [langCode, setLoadedLangCode]);
};

/**
 * Hook de tradução para o shell. Retorna `{ t, langCode }` e re-renderiza o
 * componente quando o idioma TERMINA de carregar. Drop-in para o `useI18n()`
 * do pacote, mas seguro fora do `<Excalidraw>`.
 */
export const useKindrawI18n = () => {
  const langCode = useAtomValue(loadedLangCodeAtom);
  return { t, langCode };
};
