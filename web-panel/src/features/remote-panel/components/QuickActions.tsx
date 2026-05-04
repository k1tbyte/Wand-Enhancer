import { useEffect, useRef, useState, type FormEvent } from 'react';

import { Icon } from '@/components/ui/icon';

import { cn } from '@/lib/utils';
import type { RemotePreset } from '../preset-storage';

type QuickActionsProps = {
  presets: RemotePreset[];
  onPanic: () => void;
  onAddPreset: (name: string) => boolean;
  onApplyPreset: (preset: RemotePreset) => void;
  onDeletePreset: (presetId: string) => void;
};

const DEFAULT_PRESET_NAME = 'New preset';

export const QuickActions = ({ presets, onPanic, onAddPreset, onApplyPreset, onDeletePreset }: QuickActionsProps) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [draftName, setDraftName] = useState('');

  const handleOpenModal = () => {
    setDraftName('');
    setModalOpen(true);
  };

  const handleCloseModal = () => setModalOpen(false);

  const handleSubmitPreset = (name: string): boolean => {
    const saved = onAddPreset(name);
    if (!saved) {
      return false;
    }

    setModalOpen(false);
    return true;
  };

  return (
    <>
      <div className="remote-scrollbar-hidden mb-3 flex gap-1.5 overflow-x-auto pb-0.5">
        <Chip icon="bolt" label="Panic Off" variant="danger" onClick={onPanic} />
        {presets.map((preset) => (
          <PresetChip key={preset.id} preset={preset} onApply={onApplyPreset} onDelete={onDeletePreset} />
        ))}
        <Chip icon="plus" label="Add" variant="add" onClick={handleOpenModal} />
      </div>
      {modalOpen ? (
        <PresetModal
          draftName={draftName}
          onClose={handleCloseModal}
          onDraftNameChange={setDraftName}
          onSubmit={handleSubmitPreset}
        />
      ) : null}
    </>
  );
};

type ChipProps = {
  icon: 'bolt' | 'plus';
  label: string;
  variant: 'add' | 'danger';
  onClick: () => void;
};

const Chip = ({ icon, label, variant, onClick }: ChipProps) => {
  return (
    <button type="button" className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-semibold backdrop-blur-xl', getChipVariantClass(variant))} onClick={onClick}>
      <Icon className="size-3" name={icon} stroke={2} />
      {label}
    </button>
  );
};

type PresetChipProps = {
  preset: RemotePreset;
  onApply: (preset: RemotePreset) => void;
  onDelete: (presetId: string) => void;
};

const PresetChip = ({ preset, onApply, onDelete }: PresetChipProps) => {
  const handleApply = () => onApply(preset);
  const handleDelete = () => onDelete(preset.id);

  return (
    <span className="inline-flex shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/[0.055] text-[11.5px] font-semibold text-(--deck-fg-2) shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl">
      <button type="button" className="inline-flex h-[30px] max-w-[140px] items-center gap-1.5 px-3" onClick={handleApply}>
        <Icon className="size-3 shrink-0 text-(--deck-accent)" name="sparkles" stroke={2} />
        <span className="truncate">{preset.name}</span>
      </button>
      <button type="button" aria-label={`Delete preset ${preset.name}`} className="flex h-[30px] w-7 items-center justify-center border-l border-white/10 text-(--deck-fg-4) hover:text-(--deck-fg)" onClick={handleDelete}>
        <Icon className="size-3" name="x" stroke={2.1} />
      </button>
    </span>
  );
};

type PresetModalProps = {
  draftName: string;
  onClose: () => void;
  onDraftNameChange: (name: string) => void;
  onSubmit: (name: string) => boolean;
};

const PresetModal = ({ draftName, onClose, onDraftNameChange, onSubmit }: PresetModalProps) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const trimmedName = draftName.trim();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleInput = (event: FormEvent<HTMLInputElement>) => onDraftNameChange(event.currentTarget.value);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextName = trimmedName || DEFAULT_PRESET_NAME;
    onSubmit(nextName);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-3 backdrop-blur-[6px] sm:items-center">
      <button type="button" aria-label="Close preset modal" className="absolute inset-0" onClick={onClose} />
      <form className="remote-glass-drawer relative w-full max-w-[362px] rounded-[18px] border border-white/10 p-4" onSubmit={handleSubmit}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold text-(--deck-fg)">Add Preset</h3>
          </div>
          <button type="button" aria-label="Close preset modal" className="remote-glass-control flex size-8 shrink-0 items-center justify-center rounded-[8px] border text-(--deck-fg-2) hover:text-(--deck-fg)" onClick={onClose}>
            <Icon className="size-4" name="x" />
          </button>
        </div>
        <label className="mb-3 block">
          <span className="mb-1.5 block font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-(--deck-fg-4)">Name</span>
          <input
            ref={inputRef}
            value={draftName}
            placeholder="Preset name"
            maxLength={32}
            spellCheck={false}
            className="remote-glass-control h-11 w-full rounded-[10px] border px-3 text-[13px] font-semibold text-(--deck-fg) outline-none placeholder:text-(--deck-fg-4)"
            onInput={handleInput}
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="remote-glass-control h-10 rounded-[10px] border text-[12px] font-semibold text-(--deck-fg-2)" onClick={onClose}>Cancel</button>
          <button type="submit" className="h-10 rounded-[10px] bg-(--deck-accent) text-[12px] font-bold text-black shadow-[0_8px_24px_-8px_var(--deck-accent)]">Save</button>
        </div>
      </form>
    </div>
  );
};

function getChipVariantClass(variant: ChipProps['variant']): string {
  if (variant === 'danger') {
    return 'border-red-400/30 bg-red-500/10 text-red-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]';
  }

  return 'border-white/10 bg-white/[0.055] text-(--deck-fg-2) shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]';
}
