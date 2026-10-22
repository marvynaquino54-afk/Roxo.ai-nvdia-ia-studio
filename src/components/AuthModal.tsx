import React, { useState } from 'react';
import { authService, DEFAULT_ADMIN } from '../services/firebase';
import { UserProfile } from '../types';
import { X, Lock, Mail, User, Shield, Sparkles } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: UserProfile) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onLoginSuccess }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) {
      setError('Preencha todos os campos obrigatórios.');
      return;
    }

    setLoading(true);
    try {
      const user = await authService.login(email, password);
      onLoginSuccess(user);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao autenticar');
    } finally {
      setLoading(false);
    }
  };

  const handleFillAdmin = () => {
    setEmail(DEFAULT_ADMIN.email);
    setPassword('admin123456');
    setIsRegister(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#150d2f] border border-violet-500/30 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-violet-400 hover:text-white p-1"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="text-center space-y-1">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600 to-fuchsia-500 flex items-center justify-center mx-auto text-white font-black text-lg shadow-[0_0_18px_rgba(168,85,247,0.4)]">
            ◈
          </div>
          <h3 className="font-extrabold text-base text-white tracking-wide">
            {isRegister ? 'Criar Conta no roxo.ia' : 'Acessar Terminal roxo.ia'}
          </h3>
          <p className="text-xs text-violet-300/70">
            {isRegister
              ? 'Sincronize seus setups e histórico em qualquer dispositivo'
              : 'Entre com seu e-mail para carregar seus setups na nuvem'}
          </p>
        </div>

        {error && (
          <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs text-center font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          {isRegister && (
            <div>
              <label className="text-[10px] font-bold text-violet-400 uppercase block mb-1">Seu Nome / Apelido</label>
              <div className="relative">
                <User className="w-3.5 h-3.5 text-violet-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Seu nome"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-black/50 border border-violet-500/30 rounded-xl pl-8 pr-3 py-2 text-white outline-none focus:border-violet-400"
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-[10px] font-bold text-violet-400 uppercase block mb-1">E-mail</label>
            <div className="relative">
              <Mail className="w-3.5 h-3.5 text-violet-400 absolute left-3 top-2.5" />
              <input
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-black/50 border border-violet-500/30 rounded-xl pl-8 pr-3 py-2 text-white outline-none focus:border-violet-400"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-violet-400 uppercase block mb-1">Senha</label>
            <div className="relative">
              <Lock className="w-3.5 h-3.5 text-violet-400 absolute left-3 top-2.5" />
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black/50 border border-violet-500/30 rounded-xl pl-8 pr-3 py-2 text-white outline-none focus:border-violet-400"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-violet-600 hover:opacity-95 text-white font-bold text-xs shadow-md transition-all disabled:opacity-50"
          >
            {loading ? 'Entrando...' : isRegister ? 'Concluir Cadastro' : 'Entrar no Terminal'}
          </button>
        </form>

        {/* Quick Admin Auto-fill Button */}
        <div className="pt-2 border-t border-violet-500/15">
          <button
            onClick={handleFillAdmin}
            className="w-full py-2 px-3 rounded-xl bg-amber-400/10 border border-amber-400/20 text-amber-300 hover:bg-amber-400/20 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
          >
            <Shield className="w-3.5 h-3.5" /> Preencher Login do Dono (Admin)
          </button>
        </div>

        <div className="text-center text-xs text-violet-400">
          {isRegister ? (
            <span>
              Já possui conta?{' '}
              <button
                type="button"
                onClick={() => setIsRegister(false)}
                className="text-fuchsia-400 font-bold underline ml-1"
              >
                Faça login
              </button>
            </span>
          ) : (
            <span>
              Não tem conta?{' '}
              <button
                type="button"
                onClick={() => setIsRegister(true)}
                className="text-fuchsia-400 font-bold underline ml-1"
              >
                Cadastre-se grátis
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
