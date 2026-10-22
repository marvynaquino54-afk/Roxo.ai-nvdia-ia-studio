import React, { useState, useEffect } from 'react';
import { UserProfile } from '../types';
import { authService } from '../services/firebase';
import { Shield, Users, Activity, Server, Key, Trash2, CheckCircle2 } from 'lucide-react';

interface AdminTabProps {
  currentUser: UserProfile | null;
}

export const AdminTab: React.FC<AdminTabProps> = ({ currentUser }) => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [metrics, setMetrics] = useState<any>({
    totalVisits: 184,
    registeredUsers: 3,
    activeFeeds: ['Binance Vision (CORS OK)', 'Forex Synthetic Realtime (OK)', 'Equities Realtime (OK)'],
    systemStatus: 'Operacional',
  });

  useEffect(() => {
    setUsers(authService.getAllUsers());

    // Fetch server metrics
    fetch('/api/admin/metrics')
      .then((r) => r.json())
      .then((data) => setMetrics(data))
      .catch(() => {});
  }, []);

  const handleDeleteUser = (uid: string) => {
    authService.deleteUser(uid);
    setUsers(authService.getAllUsers());
  };

  if (currentUser?.role !== 'admin') {
    return (
      <div className="bg-[#120a28]/80 backdrop-blur-md border border-rose-500/30 rounded-2xl p-8 text-center space-y-3">
        <Shield className="w-12 h-12 text-rose-400 mx-auto" />
        <h3 className="text-base font-bold text-white">Acesso Restrito ao Dono do Sistema</h3>
        <p className="text-xs text-violet-300">
          Você precisa estar conectado como Administrador (admin@roxo.ia) para visualizar este painel.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top Banner with Owner Info */}
      <div className="bg-gradient-to-r from-violet-900/60 via-fuchsia-950/40 to-black/60 border border-violet-500/30 rounded-2xl p-5 shadow-xl flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-400/20 border border-amber-400/30 flex items-center justify-center text-amber-300">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm text-white">Painel do Dono do Sistema</span>
              <span className="text-[10px] bg-amber-400/20 text-amber-300 font-bold px-2 py-0.5 rounded">
                MASTER ADMIN
              </span>
            </div>
            <p className="text-xs text-violet-300/80 mt-0.5">
              Gestão de acessos, segurança, status dos feeds e monitoramento de tráfego.
            </p>
          </div>
        </div>

        {/* Master Credentials Reminder */}
        <div className="p-2.5 rounded-xl bg-black/50 border border-violet-500/20 text-xs font-mono space-y-0.5">
          <div className="text-[10px] text-violet-400 uppercase font-bold flex items-center gap-1">
            <Key className="w-3 h-3 text-amber-300" /> Login do Dono Padrão:
          </div>
          <div className="text-white">
            E-mail: <b className="text-violet-200">admin@roxo.ia</b>
          </div>
          <div className="text-white">
            Senha: <b className="text-violet-200">admin123456</b>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[#120a28]/80 backdrop-blur-md border border-violet-500/20 rounded-2xl p-4 shadow-xl">
          <div className="flex items-center gap-2 text-[10px] text-violet-400 uppercase font-bold tracking-wider">
            <Activity className="w-3.5 h-3.5 text-violet-400" /> Acessos Monitorados
          </div>
          <span className="text-2xl font-black font-mono text-white mt-1 block tabular-nums">
            {metrics.totalVisits}
          </span>
        </div>

        <div className="bg-[#120a28]/80 backdrop-blur-md border border-violet-500/20 rounded-2xl p-4 shadow-xl">
          <div className="flex items-center gap-2 text-[10px] text-violet-400 uppercase font-bold tracking-wider">
            <Users className="w-3.5 h-3.5 text-violet-400" /> Usuários Cadastrados
          </div>
          <span className="text-2xl font-black font-mono text-emerald-400 mt-1 block tabular-nums">
            {users.length}
          </span>
        </div>

        <div className="bg-[#120a28]/80 backdrop-blur-md border border-violet-500/20 rounded-2xl p-4 shadow-xl">
          <div className="flex items-center gap-2 text-[10px] text-violet-400 uppercase font-bold tracking-wider">
            <Server className="w-3.5 h-3.5 text-violet-400" /> Feeds em Tempo Real
          </div>
          <span className="text-2xl font-black font-mono text-fuchsia-300 mt-1 block tabular-nums">
            3 Ativos
          </span>
        </div>

        <div className="bg-[#120a28]/80 backdrop-blur-md border border-violet-500/20 rounded-2xl p-4 shadow-xl">
          <div className="flex items-center gap-2 text-[10px] text-violet-400 uppercase font-bold tracking-wider">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Status da Rede
          </div>
          <span className="text-2xl font-black font-mono text-emerald-400 mt-1 block tabular-nums">
            100% OK
          </span>
        </div>
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
