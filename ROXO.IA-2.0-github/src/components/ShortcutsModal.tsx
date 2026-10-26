import React, { useEffect, useRef } from 'react';
import { X, Keyboard } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ShortcutItem = { keys: string[]; description: string };

const GROUPS: { title: string; items: ShortcutItem[] }[] = [
  {
    title: 'Navegação global',
    items: [
      { keys: ['Ctrl', 'K'], description: 'Abrir / fechar a paleta de comandos (use ⌘ no Mac)' },
      { keys: ['?'], description: 'Abrir este painel de atalhos' },
      { keys: ['Esc'], description: 'Fechar o painel, a paleta ou qualquer janela aberta' },
      { keys: ['Alt', '1–8'], description: 'Trocar de aba: Terminal, Setups, Backtest, Gestão, Filtros, IA & Diário, Conexão, Admin' },
    ],
  },
  {
    title: 'No Terminal / Análise',
    items: [
      { keys: ['Enter'], description: 'No campo de ativo, carregar as velas do símbolo digitado' },
    ],
  },
  {
    title: 'Na paleta de comandos',
    items: [
      { keys: ['↑', '↓'], description: 'Mover a seleção entre os comandos' },
      { keys: ['Enter'], description: 'Executar o comando selecionado' },
      { keys: ['Esc'], description: 'Fechar a paleta' },
    ],
  },
];

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    closeButtonRef.current?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Atalhos de teclado"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg bg-[#120a28] border border-violet-500/30 rounded-2xl shadow-2xl overflow-hidden animate-fadeIn">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-violet-500/20 bg-gradient-to-r from-violet-900/50 to-fuchsia-950/30">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-violet-300">
              <Keyboard className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-white">Atalhos de Teclado</h2>
              <p className="text-[10px] text-violet-300/70">Somente atalhos realmente ativos nesta versão</p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Fechar painel de atalhos"
            className="p-1.5 rounded-lg text-violet-300 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {GROUPS.map((group) => (
            <section key={group.title} className="space-y-2">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-violet-400">{group.title}</h3>
              <ul className="divide-y divide-violet-500/10 rounded-xl border border-violet-500/15 bg-black/25">
                {group.items.map((item) => (
                  <li key={item.description} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-xs text-violet-200/90">{item.description}</span>
                    <span className="flex items-center gap-1 shrink-0">
                      {item.keys.map((k, i) => (
                        <React.Fragment key={k}>
                          {i > 0 && <span className="text-violet-500 text-[10px]">+</span>}
                          <kbd className="px-1.5 py-0.5 rounded-md bg-violet-950 border border-violet-500/30 text-[10px] font-mono text-violet-100">
                            {k}
                          </kbd>
                        </React.Fragment>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className="text-[10px] text-violet-400/70 leading-relaxed">
            Atalhos com letras não funcionam enquanto você digita em campos de texto, para não atrapalhar sua digitação.
          </p>
        </div>
      </div>
    </div>
  );
};
