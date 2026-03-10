import { APP_NAME } from "@excalidraw/common";

import "./ExcalidrawLogo.scss";

import type { CSSProperties } from "react";

const LogoIcon = () => (
  <svg
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="ExcalidrawLogo-icon"
    aria-hidden="true"
  >
    <rect
      x="10"
      y="14"
      width="22"
      height="24"
      rx="6"
      fill="currentColor"
      opacity="0.14"
    />
    <rect
      x="16"
      y="10"
      width="22"
      height="24"
      rx="6"
      stroke="currentColor"
      strokeWidth="3"
    />
    <path
      d="M22 18v12M22 24l10-7M22 24l10 7"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const LogoText = () => <span className="ExcalidrawLogo-text">{APP_NAME}</span>;

type LogoSize = "xs" | "small" | "normal" | "large" | "custom" | "mobile";

interface LogoProps {
  size?: LogoSize;
  withText?: boolean;
  style?: CSSProperties;
  isNotLink?: boolean;
}

export const ExcalidrawLogo = ({
  style,
  size = "small",
  withText,
}: LogoProps) => {
  return (
    <div className={`ExcalidrawLogo is-${size}`} style={style}>
      <LogoIcon />
      {withText && <LogoText />}
    </div>
  );
};
