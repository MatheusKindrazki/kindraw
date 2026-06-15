import { useEffect, useState } from "react";

import { atom, useAtom } from "../app-jotai";
import { KindrawIcon } from "../kindraw/icons";
import { useKindrawI18n } from "../kindraw/i18n";
import { KindrawLanguageList } from "../kindraw/KindrawLanguageList";

import { AgentsGuide } from "./AgentsGuide";
import { ApiTokensPanel } from "./ApiTokensPanel";

import "./SettingsDialog.scss";

import type { TranslationKeys } from "@excalidraw/excalidraw/i18n";

export type SettingsDialogTab = "general" | "api-keys" | "agents";

export const settingsDialogStateAtom = atom<{
  isOpen: boolean;
  tab?: SettingsDialogTab;
}>({
  isOpen: false,
});

const TABS: { id: SettingsDialogTab; labelKey: TranslationKeys }[] = [
  { id: "general", labelKey: "kindraw.settings.tabs.general" },
  { id: "api-keys", labelKey: "kindraw.settings.tabs.apiKeys" },
  { id: "agents", labelKey: "kindraw.settings.tabs.agents" },
];

// NOTE: usa a casca de modal própria do shell Kindraw (.kindraw-modal-overlay /
// .kindraw-modal), NÃO o <Dialog> de @excalidraw/excalidraw — aquele depende do
// editor-jotai isolado (createIsolation) que só existe dentro do <Excalidraw>.
// Como este modal abre no workspace (KindrawApp, sem editor montado), usar o
// Dialog do Excalidraw crasha com "Missing Provider from createIsolation".
export const SettingsDialog = () => {
  const { t } = useKindrawI18n();
  const [state, setState] = useAtom(settingsDialogStateAtom);
  const [activeTab, setActiveTab] = useState<SettingsDialogTab>("api-keys");

  useEffect(() => {
    if (state.isOpen) {
      setActiveTab(state.tab ?? "api-keys");
    }
  }, [state.isOpen, state.tab]);

  const close = () => setState({ isOpen: false });

  useEffect(() => {
    if (!state.isOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setState({ isOpen: false });
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [state.isOpen, setState]);

  if (!state.isOpen) {
    return null;
  }

  return (
    <div
      className="kindraw-modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          close();
        }
      }}
    >
      <div
        aria-labelledby="kindraw-settings-title"
        aria-modal="true"
        className="kindraw-modal kindraw-settings"
        role="dialog"
      >
        <div className="kindraw-settings__head">
          <h2 id="kindraw-settings-title">{t("kindraw.settings.title")}</h2>
          <button
            aria-label={t("kindraw.settings.close")}
            className="kindraw-settings__close"
            onClick={close}
            type="button"
          >
            <KindrawIcon name="close" size={16} />
          </button>
        </div>

        <div className="kindraw-settings__tablist" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`kindraw-settings-tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`kindraw-settings-panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              className={`kindraw-settings__tab${
                activeTab === tab.id ? " kindraw-settings__tab--active" : ""
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          id={`kindraw-settings-panel-${activeTab}`}
          aria-labelledby={`kindraw-settings-tab-${activeTab}`}
          className="kindraw-settings__panel"
        >
          {activeTab === "general" ? (
            <div className="kindraw-settings__general">
              <label
                className="kindraw-settings__field"
                htmlFor="kindraw-settings-language"
              >
                <span className="kindraw-settings__field-label">
                  {t("kindraw.settings.language")}
                </span>
                <KindrawLanguageList />
                <span className="kindraw-settings__field-help">
                  {t("kindraw.settings.languageHelper")}
                </span>
              </label>
            </div>
          ) : activeTab === "api-keys" ? (
            <ApiTokensPanel />
          ) : (
            <AgentsGuide />
          )}
        </div>
      </div>
    </div>
  );
};
