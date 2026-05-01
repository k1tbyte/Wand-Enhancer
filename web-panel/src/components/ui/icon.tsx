import type { ReactNode, SVGProps } from 'react';

export type IconName =
  | 'activity'
  | 'alert'
  | 'atom'
  | 'backpack'
  | 'bolt'
  | 'box'
  | 'boxes'
  | 'car'
  | 'category'
  | 'chart'
  | 'chevron-left'
  | 'chevron-right'
  | 'flame'
  | 'flask'
  | 'gamepad'
  | 'hammer'
  | 'heart-broken'
  | 'loader'
  | 'map-pin'
  | 'package'
  | 'pin'
  | 'pin-off'
  | 'plug'
  | 'play'
  | 'radar'
  | 'refresh'
  | 'shield-bolt'
  | 'sparkles'
  | 'search'
  | 'swords'
  | 'trophy'
  | 'user'
  | 'wifi'
  | 'world'
  | 'x';

const ICON_PATHS: Record<IconName, ReactNode> = {
  activity: <path d="M3 12h4l2-6 4 12 2-6h6" />,
  alert: <><path d="M12 3 2.8 20h18.4z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
  atom: <><circle cx="12" cy="12" r="1.5" /><path d="M4 12c2-4 14-4 16 0" /><path d="M4 12c2 4 14 4 16 0" /><path d="M12 4c4 2 4 14 0 16" /></>,
  backpack: <><path d="M8 8V7a4 4 0 0 1 8 0v1" /><path d="M6 9h12v11H6z" /><path d="M9 14h6" /></>,
  bolt: <path d="m13 2-8 12h6l-1 8 8-12h-6z" />,
  box: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" /><path d="m4 7.5 8 4.5 8-4.5" /><path d="M12 12v9" /></>,
  boxes: <><path d="M4 7h7v7H4z" /><path d="M13 10h7v7h-7z" /><path d="M7 16h7v5H7z" /></>,
  car: <><path d="M5 13 7 7h10l2 6" /><path d="M5 13h14v5H5z" /><path d="M8 18v2" /><path d="M16 18v2" /></>,
  category: <><path d="M4 4h7v7H4z" /><path d="M13 4h7v7h-7z" /><path d="M4 13h7v7H4z" /><path d="M13 13h7v7h-7z" /></>,
  chart: <><path d="M4 19V5" /><path d="M4 19h16" /><path d="M8 15v-4" /><path d="M12 15V8" /><path d="M16 15v-6" /></>,
  'chevron-left': <path d="m15 6-6 6 6 6" />,
  'chevron-right': <path d="m9 6 6 6-6 6" />,
  flame: <path d="M12 22c4 0 7-3 7-7 0-3-2-5-5-8 0 3-2 4-4 5 0-3-1-5-3-7 0 5-3 7-3 10 0 4 3 7 8 7z" />,
  flask: <><path d="M9 3h6" /><path d="M10 3v5l-5 9a3 3 0 0 0 2.6 4h8.8a3 3 0 0 0 2.6-4l-5-9V3" /><path d="M8 15h8" /></>,
  gamepad: <><path d="M6 11h12a4 4 0 0 1 4 4v1a3 3 0 0 1-5.2 2L15 16H9l-1.8 2A3 3 0 0 1 2 16v-1a4 4 0 0 1 4-4z" /><path d="M7 15h4" /><path d="M9 13v4" /><path d="M16.5 14.5h.01" /><path d="M18.5 16.5h.01" /></>,
  hammer: <><path d="M14 5 5 14" /><path d="m4 15 5 5" /><path d="M12 3h5l4 4-3 3-4-4" /></>,
  'heart-broken': <path d="M20 8.5c0 6-8 11.5-8 11.5S4 14.5 4 8.5A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 8 2.5zM12 6l-2 4 4 2-2 4" />,
  loader: <><path d="M12 3a9 9 0 1 0 9 9" /><path d="M21 12a9 9 0 0 0-9-9" /></>,
  'map-pin': <><path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11z" /><circle cx="12" cy="10" r="2" /></>,
  package: <><path d="M5 8h14v11H5z" /><path d="m8 8 2-4h4l2 4" /><path d="M12 8v11" /></>,
  pin: <path fill="currentColor" stroke="none" d="M16,12V4H17V2H7V4H8V12L6,14V16H11.2V22H12.8V16H18V14L16,12Z" />,
  'pin-off': <path fill="currentColor" stroke="none" d="M2,5.27L3.28,4L20,20.72L18.73,22L12.8,16.07V22H11.2V16H6V14L8,12V11.27L2,5.27M16,12L18,14V16H17.82L8,6.18V4H7V2H17V4H16V12Z" />,
  plug: <><path d="M8 2v6" /><path d="M16 2v6" /><path d="M7 8h10v4a5 5 0 0 1-10 0z" /><path d="M12 17v5" /></>,
  play: <path d="m8 5 11 7-11 7z" />,
  radar: <><circle cx="12" cy="12" r="2" /><path d="M12 4a8 8 0 0 1 8 8" /><path d="M4 12a8 8 0 0 1 8-8" /><path d="M12 20a8 8 0 0 1-8-8" /><path d="M12 12l6-6" /></>,
  refresh: <><path d="M20 6v5h-5" /><path d="M4 18v-5h5" /><path d="M18 11a6 6 0 0 0-10-4L4 11" /><path d="M6 13a6 6 0 0 0 10 4l4-4" /></>,
  'shield-bolt': <><path d="M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="m13 7-4 6h3l-1 4 4-6h-3z" /></>,
  sparkles: <><path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6z" /><path d="m5 16 .8 2.2L8 19l-2.2.8L5 22l-.8-2.2L2 19l2.2-.8z" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  swords: <><path d="M14 6 20 0" /><path d="m14 6 4 4" /><path d="M4 20 14 10" /><path d="M10 6 4 0" /><path d="m10 6-4 4" /><path d="M20 20 10 10" /></>,
  trophy: <><path d="M8 4h8v4a4 4 0 0 1-8 0z" /><path d="M8 6H4a4 4 0 0 0 4 4" /><path d="M16 6h4a4 4 0 0 1-4 4" /><path d="M12 12v5" /><path d="M8 21h8" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  wifi: <><path d="M4 9a12 12 0 0 1 16 0" /><path d="M7 12a7 7 0 0 1 10 0" /><path d="M10 15a3 3 0 0 1 4 0" /><path d="M12 19h.01" /></>,
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