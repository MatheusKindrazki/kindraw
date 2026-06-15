import { useEffect, useRef, useState } from "react";

import { openGithubLogin, openGoogleLogin } from "./api";
import { useKindrawI18n } from "./i18n";
import { GoogleGlyph, KindrawIcon } from "./icons";

import "./SignInDropdown.scss";

/**
 * Botão único "Entrar" que abre um menu com as opções de login (GitHub e
 * Google), substituindo os dois botões separados na topbar. Fecha ao clicar
 * fora ou com Esc.
 */
export const SignInDropdown = ({ className }: { className?: string }) => {
  const { t } = useKindrawI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="kindraw-signin" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className={`kindraw-top-right-actions__button kindraw-signin__trigger${
          className ? ` ${className}` : ""
        }`}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {t("kindraw.actions.signIn")}
        <span
          className={`kindraw-signin__chevron${
            open ? " kindraw-signin__chevron--open" : ""
          }`}
          aria-hidden="true"
        >
          <KindrawIcon name="chevD" size={14} />
        </span>
      </button>

      {open ? (
        <div className="kindraw-signin__menu" role="menu">
          <button
            className="kindraw-signin__option"
            onClick={() => {
              setOpen(false);
              openGithubLogin();
            }}
            role="menuitem"
            type="button"
          >
            <KindrawIcon name="github" size={18} />
            {t("kindraw.actions.signInWithGitHub")}
          </button>
          <button
            className="kindraw-signin__option"
            onClick={() => {
              setOpen(false);
              openGoogleLogin();
            }}
            role="menuitem"
            type="button"
          >
            <GoogleGlyph size={18} />
            {t("kindraw.actions.signInWithGoogle")}
          </button>
        </div>
      ) : null}
    </div>
  );
};
