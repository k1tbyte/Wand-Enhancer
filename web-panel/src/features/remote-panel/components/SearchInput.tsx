import type { FormEvent } from 'react';

import { Icon } from '@/components/ui/icon';

import { cn } from '@/lib/utils';

type SearchInputProps = {
  value: string;
  placeholder: string;
  className?: string;
  onChange: (value: string) => void;
};

export const SearchInput = ({ value, placeholder, className, onChange }: SearchInputProps) => {
  const handleInput = (event: FormEvent<HTMLInputElement>) => onChange(event.currentTarget.value);
  const handleClear = () => onChange('');

  return (
    <div className={cn('remote-glass-control flex h-9.5 items-center gap-2 rounded-[10px] border px-2.5', className)}>
      <Icon className="size-3.5 shrink-0 text-(--deck-fg-3)" name="search" />
      <input
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent text-[13px] text-(--deck-fg) outline-none placeholder:text-(--deck-fg-4)"
        onInput={handleInput}
      />
      {value ? (
        <button type="button" aria-label="Clear search" className="flex size-6 items-center justify-center rounded-[7px] text-(--deck-fg-3) hover:bg-white/6 hover:text-(--deck-fg)" onClick={handleClear}>
          <Icon className="size-3.5" name="x" />
        </button>
      ) : null}
    </div>
  );
};
