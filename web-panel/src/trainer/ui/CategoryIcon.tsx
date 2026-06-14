import { Icon, type IconName } from '@/shared/ui/Icon';

const CATEGORY_ICONS: Record<string, IconName> = {
  challenge: 'flame',
  character: 'user',
  cheats: 'sparkles',
  crafting: 'hammer',
  enemies: 'heart-broken',
  game: 'gamepad',
  inventory: 'backpack',
  items: 'package',
  physics: 'atom',
  pinned: 'bolt',
  player: 'user',
  resources: 'box',
  stats: 'chart',
  teleport: 'map-pin',
  vehicles: 'car',
  weapons: 'swords',
  world: 'world',
};

export function CategoryIcon({ category, className }: { category: string; className?: string }) {
  return <Icon className={className} name={CATEGORY_ICONS[category.toLowerCase()] ?? 'gamepad'} stroke={1.8} />;
}
