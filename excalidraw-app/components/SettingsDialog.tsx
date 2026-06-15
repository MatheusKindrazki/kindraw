import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import { useI18n } from "@excalidraw/excalidraw/i18n";
import { useEffect, useState } from "react";

import type { TranslationKeys } from "@excalidraw/excalidraw/i18n";

import { atom, useAtom } from "../app-jotai";

import { AgentsGuide } from "./AgentsGuide";
import { ApiTokensPanel } from "./ApiTokensPanel";

import "./SettingsDialog.scss";

export type SettingsDialogTab = "api-keys" | "agents";

export const settingsDialogStateAtom = atom<{
  isOpen: boolean;
  tab?: SettingsDialogTab;
}>({
  isOpen: false,
});

const TABS: { id: SettingsDialogTab; labelKey: TranslationKeys }[] = [
  { id: "api-keys", labelKey: "kindraw.settings.tabs.apiKeys" },
  { id: "agents", labelKey: "kindraw.settings.tabs.agents" },
];

export const SettingsDialog = () => {
  const { t } = useI18n();
  const [state, setState] = useAtom(settingsDialogStateAtom);
  const [activeTab, setActiveTab] = useState<SettingsDialogTab>("api-keys");

  useEffect(() => {
    if (state.isOpen) {
      setActiveTab(state.tab ?? "api-keys");
    }
  }, [state.isOpen, state.tab]);

  if (!state.isOpen) {
    return null;
  }

  return (
    <Dialog
      size="small"
      onCloseRequest={() => setState({ isOpen: false })}
      title={t("kindraw.settings.title")}
    >
      <div className="kindraw-settings">
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
          {activeTab === "api-keys" ? <ApiTokensPanel /> : <AgentsGuide />}
        </div>
      </div>
    </Dialog>
  );
};
