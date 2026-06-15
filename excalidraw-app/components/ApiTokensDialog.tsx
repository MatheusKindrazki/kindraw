import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import { useI18n } from "@excalidraw/excalidraw/i18n";

import { atom, useAtom } from "../app-jotai";

import { ApiTokensPanel } from "./ApiTokensPanel";

export const apiTokensDialogStateAtom = atom<{ isOpen: boolean }>({
  isOpen: false,
});

/**
 * Wrapper fino de retrocompatibilidade: o miolo (listar/criar/revogar) vive em
 * ApiTokensPanel, que também é usado pelo SettingsDialog. Hoje a UI abre o
 * SettingsDialog; este dialog continua disponível caso algo ainda use o atom.
 */
export const ApiTokensDialog = () => {
  const { t } = useI18n();
  const [state, setState] = useAtom(apiTokensDialogStateAtom);

  if (!state.isOpen) {
    return null;
  }

  return (
    <Dialog
      size="small"
      onCloseRequest={() => setState({ isOpen: false })}
      title={t("kindraw.apiTokens.title")}
    >
      <ApiTokensPanel />
    </Dialog>
  );
};
