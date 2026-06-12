import type { ReactNode } from "react";

/* ────────────────────────────────────────────────────────
   Ícones de linha (1.7px, round) — adaptados do handoff
   (design_handoff_kindraw_redesign/redesign/shared.jsx)
   ──────────────────────────────────────────────────────── */

export type KindrawIconName =
  | "pen"
  | "folder"
  | "doc"
  | "hybrid"
  | "plus"
  | "search"
  | "link"
  | "clock"
  | "chevD"
  | "chevR"
  | "back"
  | "home"
  | "users"
  | "dots"
  | "share"
  | "copy"
  | "check"
  | "github";

const KINDRAW_ICON_BODY: Record<KindrawIconName, ReactNode> = {
  folder: (
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4.4l2 2.2h8.6A1.5 1.5 0 0 1 21 9.7v7.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />
  ),
  doc: (
    <g>
      <path d="M6.5 3.5h7.3l4.7 4.7v12.3h-12z" />
      <path d="M13.5 3.8V8.5h4.6" />
      <path d="M9.5 12.5h5M9.5 15.7h5" />
    </g>
  ),
  pen: (
    <g>
      <path d="M16.9 3.8l3.3 3.3L8.6 18.7 4 20l1.3-4.6z" />
      <path d="M14.6 6.1l3.3 3.3" />
    </g>
  ),
  hybrid: (
    <g>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
      <path d="M12 3.5v17" />
      <path d="M6.2 8.2h3M6.2 11.8h3M6.2 15.4h3" />
      <circle cx="16.4" cy="11" r="2.2" />
      <path d="M14.6 16.6h3.6" />
    </g>
  ),
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  search: (
    <g>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20.4 20.4l-4.6-4.6" />
    </g>
  ),
  link: (
    <g>
      <path d="M10 14.2a4 4 0 0 0 5.7 0l3.1-3.1a4 4 0 1 0-5.7-5.7l-1.4 1.4" />
      <path d="M14 9.8a4 4 0 0 0-5.7 0l-3.1 3.1a4 4 0 1 0 5.7 5.7l1.4-1.4" />
    </g>
  ),
  clock: (
    <g>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5V12l3 2" />
    </g>
  ),
  chevD: <path d="M6.5 9.5l5.5 5.5 5.5-5.5" />,
  chevR: <path d="M9.5 6.5l5.5 5.5-5.5 5.5" />,
  back: <path d="M14.5 6.5L9 12l5.5 5.5" />,
  home: (
    <g>
      <path d="M4.5 10.5L12 4l7.5 6.5" />
      <path d="M6.5 9.5v10h11v-10" />
    </g>
  ),
  users: (
    <g>
      <circle cx="9" cy="8.5" r="3.4" />
      <path d="M3.5 19.5c.6-3.4 2.7-5.2 5.5-5.2s4.9 1.8 5.5 5.2" />
      <path d="M15.5 5.6a3.4 3.4 0 0 1 0 5.8M17.6 14.6c1.8.8 2.7 2.4 2.9 4.9" />
    </g>
  ),
  dots: (
    <g fill="currentColor" stroke="none">
      <circle cx="5.5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="18.5" cy="12" r="1.4" />
    </g>
  ),
  share: (
    <g>
      <path d="M12 14.5v-11" />
      <path d="M7.8 7.6L12 3.4l4.2 4.2" />
      <path d="M5 12.5v7h14v-7" />
    </g>
  ),
  copy: (
    <g>
      <rect x="8.5" y="8.5" width="11" height="11" rx="1.5" />
      <path d="M5.5 14.5h-1V4.5h10v1" />
    </g>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  github: (
    <path
      fill="currentColor"
      stroke="none"
      d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.39-5.27 5.67.41.36.78 1.06.78 2.14 0 1.54-.01 2.78-.01 3.16 0 .31.21.67.8.56A11.52 11.52 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z"
    />
  ),
};

export const KindrawIcon = ({
  name,
  size = 18,
  strokeWidth = 1.7,
}: {
  name: KindrawIconName;
  size?: number;
  strokeWidth?: number;
}) => (
  <svg
    aria-hidden="true"
    fill="none"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={strokeWidth}
    style={{ flexShrink: 0, display: "block" }}
    viewBox="0 0 24 24"
    width={size}
  >
    {KINDRAW_ICON_BODY[name]}
  </svg>
);
