import { languages } from "@excalidraw/excalidraw/i18n";

import { useAtom } from "../app-jotai";
import { appLangCodeAtom } from "../app-language/language-state";

import { useKindrawI18n } from "./i18n";

import type { CSSProperties } from "react";

/**
 * Seletor de idioma para o shell Kindraw (fora do `<Excalidraw>`).
 *
 * Equivalente ao `LanguageList` do app, mas usa `useKindrawI18n()` em vez do
 * `useI18n()` do pacote — este último depende do `editor-jotai` isolado, que só
 * existe dentro do `<Excalidraw>`. Escreve no mesmo `appLangCodeAtom`, então a
 * escolha é persistida e compartilhada com o editor.
 */
export const KindrawLanguageList = ({ style }: { style?: CSSProperties }) => {
  const { t } = useKindrawI18n();
  // `value` reflete a escolha imediata (`appLangCodeAtom`), não o idioma já
  // carregado — assim o select responde no ato do clique, sem esperar o
  // `import()` do locale resolver.
  const [langCode, setLangCode] = useAtom(appLangCodeAtom);

  return (
    <select
      className="dropdown-select dropdown-select__language"
      onChange={({ target }) => setLangCode(target.value)}
      value={langCode}
      aria-label={t("buttons.selectLanguage")}
      style={style}
    >
      {languages.map((lang) => (
        <option key={lang.code} value={lang.code}>
          {lang.label}
        </option>
      ))}
    </select>
  );
};
