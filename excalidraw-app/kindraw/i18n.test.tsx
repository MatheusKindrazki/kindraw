import { render, screen, waitFor, act } from "@testing-library/react";

import { useSetAtom } from "../app-jotai";
import { appLangCodeAtom } from "../app-language/language-state";

import { useKindrawI18n, useKindrawLangBootstrap } from "./i18n";

// Setter capturado do MESMO store (default, sem Provider) que o shell usa em
// produção — escrever via `appJotaiStore.set` direto não funcionaria, pois os
// hooks do app-jotai leem do store default quando não há <Provider>.
let setLang: (code: string) => void = () => {};

// Componente de prova: monta o bootstrap (carrega o locale do idioma escolhido)
// e renderiza uma chave kindraw.* via o hook reativo do shell.
const Probe = () => {
  useKindrawLangBootstrap();
  setLang = useSetAtom(appLangCodeAtom);
  const { t, langCode } = useKindrawI18n();
  return (
    <div>
      <span data-testid="lang">{langCode}</span>
      <span data-testid="text">{t("kindraw.settings.title")}</span>
    </div>
  );
};

describe("shell i18n (useKindrawI18n + bootstrap)", () => {
  afterEach(() => {
    act(() => setLang("en"));
  });

  it("traduz e re-renderiza quando o idioma muda (en → pt-BR → en)", async () => {
    render(<Probe />);

    // Em inglês, a chave kindraw.settings.title = "Settings".
    await waitFor(() =>
      expect(screen.getByTestId("text").textContent).toBe("Settings"),
    );

    // Troca para pt-BR — o bootstrap carrega o locale e o hook re-renderiza.
    await act(async () => {
      setLang("pt-BR");
    });
    await waitFor(
      () =>
        expect(screen.getByTestId("text").textContent).toBe("Configurações"),
      { timeout: 3000 },
    );

    // Volta para inglês.
    await act(async () => {
      setLang("en");
    });
    await waitFor(
      () => expect(screen.getByTestId("text").textContent).toBe("Settings"),
      { timeout: 3000 },
    );
  });
});
