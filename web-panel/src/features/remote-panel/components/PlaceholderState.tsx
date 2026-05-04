import { Icon, type IconName } from '@/components/ui/icon';

type PlaceholderStateProps = {
  icon: IconName;
  title: string;
  sub: string;
  action: string;
  onAction: () => void;
};

export const PlaceholderState = ({ icon, title, sub, action, onAction }: PlaceholderStateProps) => {
  return (
    <div className="flex min-h-145 flex-col items-center justify-center px-10 py-12 text-center">
      <div className="mb-4 flex size-18 items-center justify-center rounded-[18px] border border-white/10 bg-white/[0.05] text-(--deck-accent) shadow-[0_0_0_8px_color-mix(in_oklab,var(--deck-accent)_6%,transparent),0_0_40px_-8px_color-mix(in_oklab,var(--deck-accent)_30%,transparent)] backdrop-blur-xl">
        <Icon className="size-7" name={icon} stroke={1.6} />
      </div>
      <h2 className="text-lg font-bold text-(--deck-fg)">{title}</h2>
      <p className="mt-1.5 max-w-65 text-[13px] leading-6 text-(--deck-fg-3)">{sub}</p>
      <button type="button" className="mt-5 inline-flex items-center gap-2 rounded-[10px] bg-(--deck-accent) px-4 py-2.5 text-[13px] font-bold text-black shadow-[0_8px_24px_-8px_var(--deck-accent)]" onClick={onAction}>
        {action}
        <Icon className="size-3.5" name="arrow-right" stroke={2.2} />
      </button>
    </div>
  );
};
