import type { ReactNode, SVGProps } from 'react';

export type IconName =
  | 'alert'
  | 'arrow-right'
  | 'atom'
  | 'backpack'
  | 'bolt'
  | 'box'
  | 'car'
  | 'chart'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'dot'
  | 'flame'
  | 'gamepad'
  | 'gamepad-variant-outline'
  | 'hammer'
  | 'heart-broken'
  | 'list'
  | 'loader'
  | 'map-pin'
  | 'menu'
  | 'minus'
  | 'package'
  | 'pin'
  | 'pin-off'
  | 'plug'
  | 'play'
  | 'plus'
  | 'search'
  | 'settings'
  | 'sparkles'
  | 'star'
  | 'star-filled'
  | 'stop'
  | 'swords'
  | 'user'
  | 'world'
  | 'x';

const ICON_PATHS: Record<IconName, ReactNode> = {
  alert: <><path d="M12 3 2.8 20h18.4z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
  'arrow-right': <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  atom: <><circle cx="12" cy="12" r="1.5" /><path d="M4 12c2-4 14-4 16 0" /><path d="M4 12c2 4 14 4 16 0" /><path d="M12 4c4 2 4 14 0 16" /></>,
  backpack: <><path d="M8 8V7a4 4 0 0 1 8 0v1" /><path d="M6 9h12v11H6z" /><path d="M9 14h6" /></>,
  bolt: <path d="m13 2-8 12h6l-1 8 8-12h-6z" />,
  box: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" /><path d="m4 7.5 8 4.5 8-4.5" /><path d="M12 12v9" /></>,
  car: <><path d="M5 13 7 7h10l2 6" /><path d="M5 13h14v5H5z" /><path d="M8 18v2" /><path d="M16 18v2" /></>,
  chart: <><path d="M4 19V5" /><path d="M4 19h16" /><path d="M8 15v-4" /><path d="M12 15V8" /><path d="M16 15v-6" /></>,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  'chevron-left': <path d="m15 6-6 6 6 6" />,
  'chevron-right': <path d="m9 6 6 6-6 6" />,
  dot: <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />,
  flame: <path d="M12 22c4 0 7-3 7-7 0-3-2-5-5-8 0 3-2 4-4 5 0-3-1-5-3-7 0 5-3 7-3 10 0 4 3 7 8 7z" />,
  gamepad: <><path d="M6 11h12a4 4 0 0 1 4 4v1a3 3 0 0 1-5.2 2L15 16H9l-1.8 2A3 3 0 0 1 2 16v-1a4 4 0 0 1 4-4z" /><path d="M7 15h4" /><path d="M9 13v4" /><path d="M16.5 14.5h.01" /><path d="M18.5 16.5h.01" /></>,
  'gamepad-variant-outline': <path fill="currentColor" stroke="none" d="M6,9H8V11H10V13H8V15H6V13H4V11H6V9M18.5,9A1.5,1.5 0 0,1 20,10.5A1.5,1.5 0 0,1 18.5,12A1.5,1.5 0 0,1 17,10.5A1.5,1.5 0 0,1 18.5,9M15.5,12A1.5,1.5 0 0,1 17,13.5A1.5,1.5 0 0,1 15.5,15A1.5,1.5 0 0,1 14,13.5A1.5,1.5 0 0,1 15.5,12M17,5A7,7 0 0,1 24,12A7,7 0 0,1 17,19C15.04,19 13.27,18.2 12,16.9C10.73,18.2 8.96,19 7,19A7,7 0 0,1 0,12A7,7 0 0,1 7,5H17M7,7A5,5 0 0,0 2,12A5,5 0 0,0 7,17C8.64,17 10.09,16.21 11,15H13C13.91,16.21 15.36,17 17,17A5,5 0 0,0 22,12A5,5 0 0,0 17,7H7Z" />,
  hammer: <><path d="M14 5 5 14" /><path d="m4 15 5 5" /><path d="M12 3h5l4 4-3 3-4-4" /></>,
  'heart-broken': <path d="M20 8.5c0 6-8 11.5-8 11.5S4 14.5 4 8.5A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 8 2.5zM12 6l-2 4 4 2-2 4" />,
  list: <><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h10" /><circle cx="3" cy="6" r=".6" fill="currentColor" /><circle cx="3" cy="12" r=".6" fill="currentColor" /><circle cx="3" cy="18" r=".6" fill="currentColor" /></>,
  loader: <><path d="M12 3a9 9 0 1 0 9 9" /><path d="M21 12a9 9 0 0 0-9-9" /></>,
  'map-pin': <><path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11z" /><circle cx="12" cy="10" r="2" /></>,
  menu: <><path d="M4 7h12" /><path d="M4 12h16" /><path d="M4 17h8" /></>,
  minus: <path d="M5 12h14" />,
  package: <><path d="M5 8h14v11H5z" /><path d="m8 8 2-4h4l2 4" /><path d="M12 8v11" /></>,
  pin: <path fill="currentColor" stroke="none" d="M16,12V4H17V2H7V4H8V12L6,14V16H11.2V22H12.8V16H18V14L16,12Z" />,
  'pin-off': <path fill="currentColor" stroke="none" d="M2,5.27L3.28,4L20,20.72L18.73,22L12.8,16.07V22H11.2V16H6V14L8,12V11.27L2,5.27M16,12L18,14V16H17.82L8,6.18V4H7V2H17V4H16V12Z" />,
  plug: <><path d="M8 2v6" /><path d="M16 2v6" /><path d="M7 8h10v4a5 5 0 0 1-10 0z" /><path d="M12 17v5" /></>,
  play: <path d="m8 5 11 7-11 7z" />,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  sparkles: <><path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6z" /><path d="m5 16 .8 2.2L8 19l-2.2.8L5 22l-.8-2.2L2 19l2.2-.8z" /></>,
  star: <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
  'star-filled': <path fill="currentColor" stroke="none" d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none" />,
  swords: <><path d="M14 6 20 0" /><path d="m14 6 4 4" /><path d="M4 20 14 10" /><path d="M10 6 4 0" /><path d="m10 6-4 4" /><path d="M20 20 10 10" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  world: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a15 15 0 0 1 0 18" /><path d="M12 3a15 15 0 0 0 0 18" /></>,
  x: <><path d="M6 6l12 12" /><path d="M18 6 6 18" /></>,
};

type IconProps = Omit<SVGProps<SVGSVGElement>, 'stroke'> & {
  name: IconName;
  stroke?: number | string;
};

export function Icon({ name, className, stroke = 1.8, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={stroke}
      viewBox="0 0 24 24"
      {...props}
    >
      {ICON_PATHS[name]}
    </svg>
  );
}
