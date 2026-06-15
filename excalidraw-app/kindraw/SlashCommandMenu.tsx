import { forwardRef, useEffect, useImperativeHandle, useState } from "react";

import { useKindrawI18n } from "./i18n";

import type { SlashCommandItem } from "./SlashCommand";

// Popup do slash "/" command (estilo Notion/Outline). Lista vertical de
// comandos com ícone + nome + descrição, navegável por teclado. Renderizado
// via ReactRenderer do @tiptap/react e posicionado manualmente pelo clientRect
// do suggestion (sem tippy/popper externos).

export type SlashCommandMenuRef = {
  // Recebe o teclado do suggestion. Retorna true se consumiu a tecla.
  onKeyDown: (event: KeyboardEvent) => boolean;
};

type SlashCommandMenuProps = {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
};

export const SlashCommandMenu = forwardRef<
  SlashCommandMenuRef,
  SlashCommandMenuProps
>(({ items, command }, ref) => {
  const { t } = useKindrawI18n();
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Sempre que a lista filtrada muda, volta a seleção pro topo.
  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  const selectItem = (index: number) => {
    const item = items[index];
    if (item) {
      command(item);
    }
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: (event: KeyboardEvent) => {
      if (items.length === 0) {
        return false;
      }
      if (event.key === "ArrowUp") {
        setSelectedIndex((prev) => (prev + items.length - 1) % items.length);
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelectedIndex((prev) => (prev + 1) % items.length);
        return true;
      }
      if (event.key === "Enter") {
        selectItem(selectedIndex);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div className="kindraw-rte__slash">
        <div className="kindraw-rte__slash-empty">
          {t("kindraw.slashCommand.empty")}
        </div>
      </div>
    );
  }

  return (
    <div className="kindraw-rte__slash" role="listbox">
      {items.map((item, index) => (
        <button
          aria-selected={index === selectedIndex}
          className={`kindraw-rte__slash-item${
            index === selectedIndex ? " kindraw-rte__slash-item--active" : ""
          }`}
          key={item.id}
          onClick={() => selectItem(index)}
          // Evita perder o foco/seleção do editor ao clicar.
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => setSelectedIndex(index)}
          role="option"
          type="button"
        >
          <span className="kindraw-rte__slash-icon" aria-hidden="true">
            {item.icon}
          </span>
          <span className="kindraw-rte__slash-text">
            <span className="kindraw-rte__slash-name">{item.title}</span>
            <span className="kindraw-rte__slash-desc">{item.description}</span>
          </span>
        </button>
      ))}
    </div>
  );
});

SlashCommandMenu.displayName = "SlashCommandMenu";
