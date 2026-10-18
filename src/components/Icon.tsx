import type { ReactNode } from "react";

type IconName =
  | "archive"
  | "chevronDown"
  | "download"
  | "eye"
  | "focus"
  | "folder"
  | "fullscreen"
  | "home"
  | "layers"
  | "logs"
  | "moreVertical"
  | "plus"
  | "shield"
  | "trash"
  | "upload"
  | "x";

export function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    archive: (
      <>
        <path d="M4 7h16" />
        <path d="M6 7v12h12V7" />
        <path d="M8 3h8l2 4H6l2-4Z" />
        <path d="M10 11h4" />
      </>
    ),
    chevronDown: <path d="m6 9 6 6 6-6" />,
    download: (
      <>
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </>
    ),
    eye: (
      <>
        <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    focus: (
      <>
        <path d="M4 9V5a1 1 0 0 1 1-1h4" />
        <path d="M15 4h4a1 1 0 0 1 1 1v4" />
        <path d="M20 15v4a1 1 0 0 1-1 1h-4" />
        <path d="M9 20H5a1 1 0 0 1-1-1v-4" />
        <circle cx="12" cy="12" r="2" />
      </>
    ),
    folder: <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H9l2 2h7.5A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-10Z" />,
    fullscreen: (
      <>
        <path d="M4 9V5a1 1 0 0 1 1-1h4" />
        <path d="M15 4h4a1 1 0 0 1 1 1v4" />
        <path d="M20 15v4a1 1 0 0 1-1 1h-4" />
        <path d="M9 20H5a1 1 0 0 1-1-1v-4" />
      </>
    ),
    home: (
      <>
        <path d="m3 11 9-8 9 8" />
        <path d="M5 10v10h14V10" />
        <path d="M9 20v-6h6v6" />
      </>
    ),
    layers: (
      <>
        <path d="m12 3 9 5-9 5-9-5 9-5Z" />
        <path d="m3 12 9 5 9-5" />
        <path d="m3 16 9 5 9-5" />
      </>
    ),
    logs: (
      <>
        <path d="M5 5h14" />
        <path d="M5 12h14" />
        <path d="M5 19h14" />
      </>
    ),
    moreVertical: (
      <>
        <circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 19 6v5c0 4.5-2.9 8.3-7 10-4.1-1.7-7-5.5-7-10V6l7-3Z" />
        <path d="M9 12l2 2 4-4" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
        <path d="M6 7l1 14h10l1-14" />
        <path d="M9 7V4h6v3" />
      </>
    ),
    upload: (
      <>
        <path d="M12 21V9" />
        <path d="m7 14 5-5 5 5" />
        <path d="M5 3h14" />
      </>
    ),
    x: (
      <>
        <path d="M6 6l12 12" />
        <path d="M18 6 6 18" />
      </>
    ),
  };

  return (
    <svg aria-hidden="true" className="icon" viewBox="0 0 24 24">
      {paths[name]}
    </svg>
  );
}
