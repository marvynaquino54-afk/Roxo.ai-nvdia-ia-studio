import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface AppErrorBoundaryProps {
  children: React.ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    const message =
      error instanceof Error && error.message
        ? error.message
        : 'Erro inesperado ao renderizar esta tela.';
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('Falha de interface isolada pelo ErrorBoundary:', error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="bg-[#120a28]/90 border border-rose-500/30 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-300 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h2 className="text-sm font-extrabold text-white">Esta tela encontrou um erro</h2>
            <p className="text-xs text-violet-300/80 leading-relaxed">
              O restante do aplicativo continua isolado. Nenhum dado foi enviado a servidores externos.
              Recarregue a página para tentar novamente; se o erro persistir, informe a mensagem abaixo.
            </p>
          </div>
        </div>

        <pre className="text-[11px] font-mono text-rose-200/80 bg-black/40 border border-rose-500/20 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap">
          {this.state.message}
        </pre>

        <button
          onClick={this.handleReload}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-xs font-bold flex items-center gap-2 hover:opacity-95"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Recarregar aplicativo
        </button>
      </div>
    );
  }
}
