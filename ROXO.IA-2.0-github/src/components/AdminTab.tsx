import React, { useState, useEffect } from 'react';
import { UserProfile } from '../types';
import { authService } from '../services/firebase';
import { geminiService } from '../services/geminiService';
import { universalMarketData } from '../services/marketDataEngine';
import { Shield, Users, Activity, Server, Key, Trash2, CheckCircle2, Lock, AlertCircle, RefreshCw } from 'lucide-react';

interface AdminTabProps {
  currentUser: UserProfile | null;
  onOpenAuth?: () => void;
}

interface ServerMetrics {
  online: boolean;
  uptimeSec: number | null;
  runtime: string | null;
  aiKeyConfigured: boolean | null;
  error?: string;
}

export const AdminTab: React.FC<AdminTabProps> = ({ currentUser, onOpenAuth }) => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [server, setServer] = useState<ServerMetrics>({
    online: false,
    uptimeSec: null,
    runtime: null,
    aiKeyConfigured: null,
  });
  const [feedAudit, setFeedAudit] = useState(() => universalMarketData.getLatestAudit());

  // Password change form states
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [passStatus, setPassStatus] = useState<{ type: 'idle' | 'success' | 'error'; message: string }>({
    type: 'idle',
    message: '',
  });
  const [isChangingPass, setIsChangingPass] = useState(false);

  useEffect(() => {
    setUsers(authService.getAllUsers());

    // Real server health only — no fabricated visit counters.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    fetch('/api/admin/metrics', { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) =>
        setServer({
          online: true,
          uptimeSec: Number.isFinite(data.uptimeSec) ? data.uptimeSec : null,
          runtime: typeof data.runtime === 'string' ? data.runtime : null,
          aiKeyConfigured: typeof data.aiKeyConfigured === 'boolean' ? data.aiKeyConfigured : null,
        })
      )
      .catch((err) => setServer({ online: false, uptimeSec: null, runtime: null, aiKeyConfigured: null, error: err?.message || 'Sem resposta' }))
      .finally(() => clearTimeout(timer));

    const unsub = universalMarketData.onAuditChange((audit) => setFeedAudit(audit));
    return () => {
      clearTimeout(timer);
      controller.abort();
      unsub();
    };
  }, []);

  const handleDeleteUser = (uid: string) => {
    authService.deleteUser(uid);
    setUsers(authService.getAllUsers());
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassStatus({ type: 'idle', message: '' });

    if (!currentPass || !newPass || !confirmPass) {
      setPassStatus({ type: 'error', message: 'Preencha todos os campos para alterar a senha.' });
      return;
    }

    if (newPass.length < 6) {
      setPassStatus({ type: 'error', message: 'A nova senha deve ter no mínimo 6 caracteres.' });
      return;
    }

    if (newPass !== confirmPass) {
      setPassStatus({ type: 'error', message: 'A confirmação de senha não confere com a nova senha.' });
      return;
    }

    setIsChangingPass(true);
    try {
      const result = await authService.changeAdminPassword(currentPass, newPass);
      if (result.success) {
        setPassStatus({ type: 'success', message: result.message });
        setCurrentPass('');
        setNewPass('');
        setConfirmPass('');
      } else {
        setPassStatus({ type: 'error', message: result.message });
      }
    } catch {
      setPassStatus({ type: 'error', message: 'Erro ao processar alteração de senha.' });
    } finally {
      setIsChangingPass(false);
    }
  };

  if (currentUser?.role !== 'admin') {
    return (
      <div className="bg-[#120a28]/80 backdrop-blur-md border border-rose-500/30 rounded-2xl p-8 text-center space-y-4 max-w-lg mx-auto shadow-2xl">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-400">
          <Shield className="w-7 h-7" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-white">Acesso Restrito ao Dono do Sistema</h3>
          <p className="text-xs text-violet-300">
            Este painel requer credenciais de Administrador com privilégios MASTER.
          </p>
        </div>

        {onOpenAuth && (
          <button
            onClick={onOpenAuth}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-violet-600 text-white font-bold text-xs shadow-lg hover:opacity-95 transition-all"
          >
            Fazer Login como Administrador
          </button>
        )}
      </div>
    );
  }

  const fmtUptime = (s: number | null) =>
    s === null ? '—' : s < 60 ? `${Math.round(s)}s` : s < 3600 ? `${Math.floor(s / 60)}min` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}min`;

  const aiConfigured = Boolean(geminiService.getStoredKey()) || server.aiKeyConfigured === true;
  const feedLabel =
    feedAudit.status === 'online'
      ? 'Online'
      : feedAudit.status === 'error'
      ? 'Falha'
      : feedAudit.status === 'blocked'
      ? 'Bloqueado'
      : 'Aguardando';

  return (
    <div className="space-y-4">
      {/* Top Banner with Owner Info & Security Status */}
      <div className="bg-gradient-to-r from-violet-900/60 via-fuchsia-950/40 to-black/60 border border-violet-500/30 rounded-2xl p-5 shadow-xl flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-400/20 border border-amber-400/30 flex items-center justify-center text-amber-300">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm text-white">Painel do Dono do Sistema</span>
              <span className="text-[10px] bg-amber-400/20 text-amber-300 font-bold px-2 py-0.5 rounded border border-amber-400/30">
                MASTER ADMIN
              </span>
            </div>
            <p className="text-xs text-violet-300/80 mt-0.5">
              Gestão de acessos, segurança criptográfica e integridade dos dados.
            </p>
          </div>
        </div>

        {/* Security Vault Status Pill */}
        <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs font-mono flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <div>
            <div className="text-[10px] text-emerald-300 uppercase font-bold flex items-center gap-1">
              <Lock className="w-3 h-3" /> Hash local SHA-256 (sem servidor)
            </div>
            <div className="text-[11px] text-white/80">
              Sessão local: <b className="text-violet-200">{currentUser.email}</b>
            </div>
          </div>
        </div>
      </div>

      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-200/90 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <span>
          Esta autenticação é local (dados no seu navegador) e não substitui um login de servidor. Não use esta
          plataforma para custodiar dinheiro real. Troque a senha do dono abaixo antes de publicar o site.
        </span>
      </div>

      {/* Honest metrics (local + real server health only) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[#120a28]/80 backdrop-blur-md border border-violet-500/20 rounded-2xl p-4 shadow-xl">
          <div className="flex items-center gap-2 text-[10px] text-violet-400 uppercase font-bold tracking-wider">
            <Users className="w-3.5 h-3.5 text-violet-400" /> Usuários (navegador)
          </div>
          <span className="text-2xl font-black font-mono text-white mt-1 block tabular-nums">{users.length}</span>
          <span className="text-[10px] text-violet-400/70">Contas salvas neste dispositivo</span>
        </div>

        <div className="bg-[#120a28]/80 backdrop-blur-md border border-violet-500/20 rounded-2xl p-4 shadow-xl">
          <div className="flex items-center gap-2 text-[10px] text-violet-400 uppercase font-bold tracking-wider">
            <Server className="w-3.5 h-3.5 text-violet-400" /> Servidor
          </div>
          <span
            className={`text-2xl font-black font-mono mt-1 block tabular-nums ${
              server.online ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {server.online ? 'Online' : 'Offline'}
          </span>
          <span className="text-[10px] text-violet-400/70">
            {server.online ? `Uptime: ${fmtUptime(server.uptimeSec)}${server.runtime ? ` · ${server.runtime}` : ''}` : server.error || 'Sem resposta do servidor'}
          </span>
        </div>

        <div className="bg-[#120a28]/80 backdrop-blur-md border border-violet-500/20 rounded-2xl p-4 shadow-xl">
          <div className="flex items-center gap-2 text-[10px] text-violet-400 uppercase font-bold tracking-wider">
            <Activity className="w-3.5 h-3.5 text-violet-400" /> IA Configurada
          </div>
          <span className={`text-2xl font-black font-mono mt-1 block tabular-nums ${aiConfigured ? 'text-fuchsia-300' : 'text-slate-400'}`}>
            {aiConfigured ? 'Sim' : 'Não'}
          </span>
          <span className="text-[10px] text-violet-400/70">Chave local ou no servidor</span>
        </div>

        <div className="bg-[#120a28]/80 backdrop-blur-md border border-violet-500/20 rounded-2xl p-4 shadow-xl">
          <div className="flex items-center gap-2 text-[10px] text-violet-400 uppercase font-bold tracking-wider">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Feed de Mercado
          </div>
          <span
            className={`text-2xl font-black font-mono mt-1 block tabular-nums ${
              feedAudit.status === 'online' ? 'text-emerald-400' : feedAudit.status === 'error' || feedAudit.status === 'blocked' ? 'text-rose-400' : 'text-amber-300'
            }`}
          >
            {feedLabel}
          </span>
          <span className="text-[10px] text-violet-400/70">
            {feedAudit.status === 'online'
              ? `${feedAudit.providerName} · ${feedAudit.latencyMs}ms · ${feedAudit.candleCount} velas`
              : feedAudit.errorMessage || 'Sem consulta recente'}
          </span>
        </div>
      </div>

      <p className="text-[10px] text-violet-400/60">
        Não há contagem de visitantes nem telemetria de terceiros nesta versão. Os números acima são deste navegador
        e do endpoint real de saúde do servidor.
      </p>

      {/* Security & Password Management Card */}
      <div className="bg-[#120a28]/80 backdrop-blur-md border border-violet-500/20 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-violet-500/15">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-amber-300" />
            <span className="font-extrabold text-sm text-violet-100 uppercase tracking-wide">
              Segurança & Troca de Senha do Dono
            </span>
          </div>
          <span className="text-[10px] text-violet-400 font-mono">Hash SHA-256 + Salt</span>
        </div>

        <form onSubmit={handlePasswordChange} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end text-xs">
          <div>
            <label className="text-[10px] font-bold text-violet-400 uppercase block mb-1">
              Senha Atual
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={currentPass}
              onChange={(e) => setCurrentPass(e.target.value)}
              className="w-full bg-black/50 border border-violet-500/30 rounded-xl px-3 py-2 text-white outline-none focus:border-violet-400"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-violet-400 uppercase block mb-1">
              Nova Senha (mín. 6 chars)
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              className="w-full bg-black/50 border border-violet-500/30 rounded-xl px-3 py-2 text-white outline-none focus:border-violet-400"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-violet-400 uppercase block mb-1">
              Confirmar Nova Senha
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={confirmPass}
              onChange={(e) => setConfirmPass(e.target.value)}
              className="w-full bg-black/50 border border-violet-500/30 rounded-xl px-3 py-2 text-white outline-none focus:border-violet-400"
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={isChangingPass}
              className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:opacity-95 text-black font-extrabold text-xs shadow-md transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {isChangingPass ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Atualizando...
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5" /> Atualizar Senha
                </>
              )}
            </button>
          </div>
        </form>

        {passStatus.type !== 'idle' && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
              passStatus.type === 'success'
                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
            }`}
          >
            {passStatus.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{passStatus.message}</span>
          </div>
        )}
      </div>

      {/* User Management Table */}
      <div className="bg-[#120a28]/80 backdrop-blur-md border border-violet-500/20 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-violet-500/15">
          <span className="font-extrabold text-sm text-violet-100 uppercase tracking-wide">
            Gestão de Usuários e Permissões
          </span>
          <span className="text-xs text-violet-400 font-mono">{users.length} contas registradas</span>
        </div>

        <div className="overflow-x-auto text-xs">
          <table className="w-full text-left font-mono">
            <thead>
              <tr className="text-[10px] text-violet-400 border-b border-violet-500/20 uppercase font-bold">
                <th className="py-2">Nome / Usuário</th>
                <th className="py-2">E-mail</th>
                <th className="py-2">Papel / Acesso</th>
                <th className="py-2">Data de Criação</th>
                <th className="py-2 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-violet-500/10">
              {users.map((u) => (
                <tr key={u.uid}>
                  <td className="py-2.5 text-white font-bold">{u.displayName}</td>
                  <td className="py-2.5 text-violet-300">{u.email}</td>
                  <td className="py-2.5">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        u.role === 'admin'
                          ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30'
                          : 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                      }`}
                    >
                      {u.role === 'admin' ? 'DONO / ADMIN' : 'TRADER'}
                    </span>
                  </td>
                  <td className="py-2.5 text-violet-400 text-[11px]">
                    {new Date(u.createdAt).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="py-2.5 text-right">
                    {u.role !== 'admin' && (
                      <button
                        onClick={() => handleDeleteUser(u.uid)}
                        className="text-rose-400 hover:text-rose-300 p-1"
                        title="Remover usuário"
                      >
                        <Trash2 className="w-3.5 h-3.5 inline" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
