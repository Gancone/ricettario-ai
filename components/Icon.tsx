import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "book" | "plus" | "bag" | "settings" | "search" | "clock" | "users" | "flame"
  | "download" | "share" | "external" | "shield" | "check" | "close" | "arrowLeft"
  | "arrowRight" | "sparkles" | "tag" | "image" | "cloud" | "refresh" | "database";

const paths: Record<IconName, ReactNode> = {
  book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5A2.5 2.5 0 0 1 20 21.5z"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>,
  bag: <><path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 0 1 6 0"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z"/></>,
  search: <><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  users: <><circle cx="9" cy="9" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 7.5a2.5 2.5 0 0 1 0 5M16.5 15.5A4.5 4.5 0 0 1 20.5 19"/></>,
  flame: <path d="M13.5 3.5c.7 3-1.6 4-1 6.3.4 1.4 1.9 1.8 2.8.5 1-1.4.7-3.1.2-4.1 2.7 1.7 4.2 4.1 4.2 6.8A6.8 6.8 0 0 1 5 17.7c0-3.6 2.5-6 5.1-8.5-.2 2.2 1 3.4 2 3.1 1.2-.4 1.5-2 .9-3.5-.6-1.5-.4-3.7.5-5.3z"/>,
  download: <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/></>,
  share: <><circle cx="18" cy="5" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="19" r="2"/><path d="m8 11 8-5M8 13l8 5"/></>,
  external: <><path d="M14 4h6v6"/><path d="m20 4-9 9"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/></>,
  shield: <><path d="M12 3 5 6v5c0 4.8 2.9 8 7 10 4.1-2 7-5.2 7-10V6z"/><path d="m9 12 2 2 4-4"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  close: <><path d="M6 6l12 12M18 6 6 18"/></>,
  arrowLeft: <><path d="m15 18-6-6 6-6"/></>,
  arrowRight: <><path d="m9 18 6-6-6-6"/></>,
  sparkles: <><path d="m12 3 1.3 3.7L17 8l-3.7 1.3L12 13l-1.3-3.7L7 8l3.7-1.3z"/><path d="m18 14 .7 2.3L21 17l-2.3.7L18 20l-.7-2.3L15 17l2.3-.7z"/></>,
  tag: <><path d="M4 4h7l9 9-7 7-9-9z"/><circle cx="8" cy="8" r="1"/></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="2"/><path d="m21 15-5-5L5 20"/></>,
  cloud: <path d="M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6.2 8.3 4.7 4.7 0 0 0 7 18z"/>,
  refresh: <><path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M6.1 8A7 7 0 0 1 18 6l2 5M18 16a7 7 0 0 1-12 2l-2-5"/></>,
  database: <><ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v7c0 1.7 3.1 3 7 3s7-1.3 7-3V5"/><path d="M5 12v7c0 1.7 3.1 3 7 3s7-1.3 7-3v-7"/></>
};

export function Icon({ name, size = 20, ...props }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {paths[name]}
    </svg>
  );
}
