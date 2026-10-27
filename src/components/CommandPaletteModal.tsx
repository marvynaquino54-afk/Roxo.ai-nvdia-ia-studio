import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, CornerDownLeft } from 'lucide-react';
import { useModalFocus } from '../hooks/useModalFocus';

export interface PaletteCommand {
  id: string;
  title: string;
  subtitle?: string;
  group: string;
  icon?: React.ReactNode;
  perform: () => void;
}

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  commands: PaletteCommand[];
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({ isOpen, onClose, commands }) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useModalFocus(isOpen, onClose);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setActiveIndex(0);
  }, [isOpen]);

  const normalized = query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const filtered = useMemo(() => {
    if (!normalized.trim()) return commands;
    return commands.filter((c) => {
      const haystack = `${c.title} ${c.subtitle || ''} ${c.group}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      return haystack.includes(normalized);
    });
  }, [commands, normalized]);

  useEffect(() => {
    setActiveIndex((idx) => (filtered.length === 0 ? 0 : Math.min(idx, filtered.length - 1)));
  }, [filtered.length]);

  useEffect(() => {
    if (!isOpen) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-command-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, isOpen]);

  if (!isOpen) return null;

  const run = (cmd: PaletteCommand) => {
    onClose();
    cmd.perform();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (filtered.length ? (i + 1) % filtered.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filtered[activeIndex];
      if (cmd) run(cmd);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  let lastGroup = '';

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh] px-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Paleta de comandos"
      tabIndex={-1}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl bg-[#120a28] border border-violet-500/30 rounded-2xl shadow-2xl overflow-hidden animate-fadeIn">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-violet-500/20">
          <Search className="w-4 h-4 text-violet-400 shrink-0" />
          <input
            data-autofocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite um comando ou o nome de uma aba..."
            aria-label="Buscar comandos"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-violet-400/50 focus:outline-none"
          />
          <kbd className="px-1.5 py-0.5 rounded-md bg-violet-950 border border-violet-500/30 text-[10px] font-mono text-violet-300 shrink-0">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-1.5">
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-violet-400">
              Nenhum comando encontrado para “{query}”.
            </div>
          )}

          {filtered.map((cmd, i) => {
            const showGroup = cmd.group !== lastGroup;
            lastGroup = cmd.group;
            return (
              <React.Fragment key={cmd.id}>
                {showGroup && (
                  <div className="px-4 pt-3 pb-1 text-[9px] font-bold uppercase tracking-wider text-violet-400/70">
                    {cmd.group}
                  </div>
                )}
                <button
                  data-command-index={i}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => run(cmd)}
                  className={`w-full text-left px-4 py-2 flex items-center gap-3 transition-colors ${
                    i === activeIndex ? 'bg-violet-600/25' : 'hover:bg-white/5'
                  }`}
                >
                  <span className="w-6 h-6 rounded-md bg-violet-500/15 border border-violet-500/20 flex items-center justify-center text-violet-300 shrink-0">
                    {cmd.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-violet-100 truncate">{cmd.title}</span>
                    {cmd.subtitle && (
                      <span className="block text-[10px] text-violet-400/80 truncate">{cmd.subtitle}</span>
                    )}
                  </span>
                  {i === activeIndex && <CornerDownLeft className="w-3.5 h-3.5 text-violet-400 shrink-0" />}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        <div className="px-4 py-2 border-t border-violet-500/15 text-[10px] text-violet-400/70 flex items-center justify-between">
          <span>↑ ↓ para navegar · Enter para executar</span>
          <span className="font-mono">Ctrl/⌘ + K</span>
        </div>
      </div>
    </div>
  );
};
