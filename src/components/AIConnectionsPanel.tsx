import React, { useEffect, useMemo, useState } from 'react';
import {
  AIConnection,
  AIConnectionDraft,
  AI_CONNECTIONS_EVENT,
  AITestResult,
  getActiveConnection,
  loadConnections,
  removeConnection,
  setActiveConnection,
  setConnectionEnabled,
  setDefaultConnection,
  testConnection,
  upsertConnection,
} from '../services/aiClient';
import {
  AI_PROVIDER_CATALOG,
  AI_STATE_LABELS,
  AIConnectionState,
  deriveProviderCapabilities,
  getProviderDefinition,
} from '../services/aiProviders';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Key,
  Loader2,
  Lock,
  Pencil,
  Play,
  Plug,
  Plus,
  RefreshCw,
  ShieldCheck,
  Star,
  Trash2,
  X,
  Zap,
} from 'lucide-react';

interface AIConnectionsPanelProps {
  onConnectionsChange?: (connections: AIConnection[], active: AIConnection | null) => void;
}

const EMPTY_DRAFT: AIConnectionDraft = {
  name: '',
  provider: 'gemini',
  model: 'gemini-3.6-flash',
  endpoint: '',
  apiKey: '',
  enabled: true,
  isDefault: false,
};

function statusClasses(state: AIConnectionState): string {
  switch (state) {
    case 'connected':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    case 'testing':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    case 'auth_error':
    case 'provider_unavailable':
      return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
    case 'model_missing':
    case 'incompatible_model':
    case 'rate_limited':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    case 'config_error':
      return 'bg-orange-500/15 text-orange-300 border-orange-500/30';
    default:
      return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
  }
}

function providerLabel(id: string): string {
  return getProviderDefinition(id)?.name || id;
}

function formatCheckedAt(value: string | null): string {
  if (!value) return 'nunca testada';
  try {
    return new Date(value).toLocaleString('pt-BR');
  } catch {
    return value;
  }
}

export const AIConnectionsPanel: React.FC<AIConnectionsPanelProps> = ({ onConnectionsChange }) => {
  const [connections, setConnections] = useState<AIConnection[]>(() => loadConnections());
  const [editing, setEditing] = useState<AIConnectionDraft | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, AITestResult>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const active = useMemo(() => getActiveConnection(connections), [connections]);

  const publish = (list: AIConnection[]) => {
    setConnections(list);
    onConnectionsChange?.(list, getActiveConnection(list));
  };

  const refresh = () => {
    const list = loadConnections();
    publish(list);
  };

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener(AI_CONNECTIONS_EVENT, onChange);
    return () => window.removeEventListener(AI_CONNECTIONS_EVENT, onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startNew = () => {
    setEditing({ ...EMPTY_DRAFT });
    setShowKey(false);
    setFormError(null);
    setSaveNotice(null);
  };

  const startEdit = (connection: AIConnection) => {
    setEditing({
      id: connection.id,
      name: connection.name,
      provider: connection.provider,
      model: connection.model,
      endpoint: connection.endpoint,
      apiKey: connection.apiKey,
      enabled: connection.enabled,
      isDefault: connection.isDefault,
    });
    setShowKey(false);
    setFormError(null);
    setSaveNotice(null);
  };

  const handleProviderChange = (providerId: string) => {
    const def = getProviderDefinition(providerId);
    if (!def) return;
    setEditing((prev) =>
      prev
        ? {
            ...prev,
            provider: def.id,
            model: def.defaultModel,
            endpoint: def.endpointMode === 'fixed' ? '' : def.defaultEndpoint,
            name: prev.name || def.shortName,
          }
        : prev
    );
    setFormError(null);
  };

  const handleSave = async (testAfterSave: boolean) => {
    if (!editing) return;
    const def = getProviderDefinition(editing.provider);
    if (!def) {
      setFormError('Provedor inválido.');
      return;
    }
    if (!editing.model.trim()) {
      setFormError('Informe o ID do modelo.');
      return;
    }
    if (def.endpointMode === 'required' && !editing.endpoint.trim()) {
      setFormError('Informe a URL base do servidor compatível com OpenAI.');
      return;
    }

    setSaving(true);
    setFormError(null);
    setSaveNotice(null);

    try {
      const list = upsertConnection(editing);
      const saved = (editing.id ? list.find((c) => c.id === editing.id) : list[list.length - 1]) || null;
      publish(list);
      setEditing(null);

      if (saved) {
        setSaveNotice(
          testAfterSave
            ? 'Conexão salva. Testando com uma chamada real ao modelo...'
            : 'Conexão salva. O estado só vira CONECTADO após um teste real bem-sucedido.'
        );
        if (testAfterSave) {
          await handleTest(saved);
        }
      }
    } catch (error: any) {
      setFormError(error?.message || 'Não foi possível salvar a conexão.');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (connection: AIConnection) => {
    setTestingId(connection.id);
    setTestResults((prev) => {
      const next = { ...prev };
      delete next[connection.id];
      return next;
    });
    try {
      const result = await testConnection(connection);
      setTestResults((prev) => ({ ...prev, [connection.id]: result }));
    } finally {
      setTestingId(null);
      refresh();
    }
  };

  const handleDelete = (connection: AIConnection) => {
    if (confirmDeleteId !== connection.id) {
      setConfirmDeleteId(connection.id);
      return;
    }
    setConfirmDeleteId(null);
    publish(removeConnection(connection.id));
    setTestResults((prev) => {
      const next = { ...prev };
      delete next[connection.id];
      return next;
    });
    setSaveNotice('Conexão removida deste navegador.');
  };

  const currentDef = editing ? getProviderDefinition(editing.provider) : null;
  const currentCapabilities = editing ? deriveProviderCapabilities(editing.provider, editing.model) : null;

  return (
    <section className="bg-[#120a28]/80 border border-violet-500/25 rounded-2xl p-4 shadow-xl space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-violet-600/25 border border-violet-500/30 flex items-center justify-center text-violet-200">
            <Plug className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-white">Central de Conexões de IA</h3>
            <p className="text-[11px] text-violet-300/70">
              Gemini, OpenAI, Claude, OpenRouter, compatíveis e Ollama. O selo CONECTADO exige uma chamada real bem-sucedida.
            </p>
          </div>
        </div>
        <button
          onClick={startNew}
          className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-xs font-bold flex items-center gap-1.5 hover:opacity-95"
        >
          <Plus className="w-3.5 h-3.5" /> Adicionar conexão
        </button>
      </div>

      <div className="p-2.5 rounded-xl bg-black/30 border border-violet-500/15 text-[10px] text-violet-300/70 flex items-start gap-2">
        <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-violet-400" />
        <span>
          As chaves ficam gravadas apenas no <b>localStorage deste navegador</b> e são enviadas no cabeçalho{' '}
          <code className="text-violet-200">x-ai-key</code> para o gateway do próprio app. Elas não entram no bundle público,
          não são exibidas em logs e não são devolvidas nas respostas. Evite configurar chaves em computador compartilhado.
        </span>
      </div>

      {saveNotice && (
        <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-[11px] text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>{saveNotice}</span>
        </div>
      )}

      {formError && (
        <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-[11px] text-rose-200 flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{formError}</span>
        </div>
      )}

      {editing && (
        <div className="p-3 rounded-xl bg-black/35 border border-violet-500/25 space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Pencil className="w-3.5 h-3.5 text-fuchsia-400" />
              {editing.id ? 'Editar conexão' : 'Nova conexão de IA'}
            </span>
            <button
              onClick={() => setEditing(null)}
              className="p-1 rounded-md text-violet-400 hover:text-white hover:bg-white/10"
              aria-label="Fechar formulário"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <label className="space-y-1">
              <span className="text-[10px] font-bold uppercase text-violet-400">Nome</span>
              <input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder={currentDef?.shortName || 'Minha conexão'}
                maxLength={60}
                className="w-full bg-black/60 border border-violet-500/30 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-violet-400"
              />
            </label>

            <label className="space-y-1">
              <span className="text-[10px] font-bold uppercase text-violet-400">Provedor</span>
              <select
                value={editing.provider}
                onChange={(e) => handleProviderChange(e.target.value)}
                className="w-full bg-black/60 border border-violet-500/30 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-violet-400"
              >
                {AI_PROVIDER_CATALOG.map((provider) => (
                  <option key={provider.id} value={provider.id} className="bg-[#120a28]">
                    {provider.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-[10px] font-bold uppercase text-violet-400">Modelo (ID exato)</span>
              <input
                value={editing.model}
                onChange={(e) => setEditing({ ...editing, model: e.target.value })}
                placeholder={currentDef?.defaultModel || 'ex.: modelo-do-provedor'}
                maxLength={120}
                list={`ai-models-${editing.provider}`}
                className="w-full bg-black/60 border border-violet-500/30 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white outline-none focus:border-violet-400"
              />
              <datalist id={`ai-models-${editing.provider}`}>
                {(currentDef?.suggestedModels || []).map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
              <span className="text-[9px] text-violet-400/70 block">
                Sugestões não garantem disponibilidade. O teste confirma o ID real.
              </span>
            </label>

            <label className="space-y-1">
              <span className="text-[10px] font-bold uppercase text-violet-400">
                Chave de API {currentDef?.keyRequired ? '(obrigatória)' : '(opcional)'}
              </span>
              <div className="relative">
                <Key className="w-3.5 h-3.5 text-violet-400 absolute left-2.5 top-2.5" />
                <input
                  type={showKey ? 'text' : 'password'}
                  value={editing.apiKey}
                  onChange={(e) => setEditing({ ...editing, apiKey: e.target.value })}
                  placeholder="Cole a chave aqui"
                  maxLength={500}
                  autoComplete="off"
                  className="w-full bg-black/60 border border-violet-500/30 rounded-lg pl-8 pr-16 py-1.5 text-xs font-mono text-white outline-none focus:border-violet-400"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-1.5 top-1.5 p-1 rounded text-violet-400 hover:text-white"
                  aria-label={showKey ? 'Ocultar chave' : 'Mostrar chave'}
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <span className="text-[9px] text-violet-400/70 block">
                Deixe em branco para usar uma chave configurada no servidor (se existir).{' '}
                <button
                  type="button"
                  onClick={() => setEditing({ ...editing, apiKey: '' })}
                  className="underline hover:text-violet-200"
                >
                  Limpar chave salva
                </button>
              </span>
            </label>

            {currentDef && currentDef.endpointMode !== 'fixed' && (
              <label className="space-y-1 md:col-span-2">
                <span className="text-[10px] font-bold uppercase text-violet-400">
                  URL base {currentDef.endpointMode === 'required' ? '(obrigatória)' : '(opcional)'}
                </span>
                <input
                  value={editing.endpoint}
                  onChange={(e) => setEditing({ ...editing, endpoint: e.target.value })}
                  placeholder={currentDef.defaultEndpoint || 'https://servidor/v1'}
                  maxLength={300}
                  className="w-full bg-black/60 border border-violet-500/30 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white outline-none focus:border-violet-400"
                />
                <span className="text-[9px] text-violet-400/70 block">
                  {currentDef.notes}
                </span>
              </label>
            )}
          </div>

          {currentCapabilities && (
            <div className="flex flex-wrap items-center gap-2 text-[10px]">
              <span className="px-2 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/25 text-violet-200">
                Texto: {currentCapabilities.text ? 'sim' : 'não'}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full border ${
                  currentCapabilities.vision
                    ? 'bg-emerald-500/15 border-emerald-500/25 text-emerald-200'
                    : 'bg-slate-500/15 border-slate-500/25 text-slate-300'
                }`}
              >
                Imagens: {currentCapabilities.vision ? 'sim' : 'não declarado'}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/25 text-violet-200">
                Ferramentas: executadas pelo app
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-violet-200">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={editing.enabled}
                onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })}
                className="w-3.5 h-3.5 rounded text-violet-600 bg-black/60 border-violet-500/40"
              />
              Ativa
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={editing.isDefault === true}
                onChange={(e) => setEditing({ ...editing, isDefault: e.target.checked })}
                className="w-3.5 h-3.5 rounded text-violet-600 bg-black/60 border-violet-500/40"
              />
              Usar como padrão
            </label>
            {connections.length === 0 && (
              <span className="text-[10px] text-violet-400/70">
                A primeira conexão vira padrão automaticamente.
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-violet-500/15">
            <button
              onClick={() => handleSave(true)}
              disabled={saving || testingId !== null}
              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
            >
              {saving || testingId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              Salvar e testar
            </button>
            <button
              onClick={() => handleSave(false)}
              disabled={saving || testingId !== null}
              className="px-3 py-1.5 rounded-lg bg-white/5 border border-violet-500/25 text-violet-200 text-xs font-bold hover:bg-white/10 disabled:opacity-50"
            >
              Salvar sem testar
            </button>
            <button
              onClick={() => setEditing(null)}
              className="px-3 py-1.5 rounded-lg text-violet-300 text-xs font-semibold hover:bg-white/5"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {connections.length === 0 ? (
        <div className="p-5 rounded-xl bg-black/25 border border-dashed border-violet-500/25 text-center space-y-2">
          <p className="text-xs text-violet-200 font-semibold">Nenhuma conexão de IA configurada.</p>
          <p className="text-[11px] text-violet-300/70">
            O ROXO Agent continua funcionando com as ferramentas locais e o motor estatístico, mas sem interpretação de um modelo.
          </p>
          <button
            onClick={startNew}
            className="px-3 py-1.5 rounded-lg bg-violet-600/30 border border-violet-500/30 text-white text-xs font-bold hover:bg-violet-600/50"
          >
            Configurar primeira conexão
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
          {connections.map((connection) => {
            const result = testResults[connection.id];
            const capabilities = deriveProviderCapabilities(connection.provider, connection.model);
            const isTesting = testingId === connection.id;
            const state = isTesting ? 'testing' : connection.status;

            return (
              <div
                key={connection.id}
                className={`p-3 rounded-xl border bg-black/30 space-y-2 ${
                  active?.id === connection.id ? 'border-fuchsia-500/40' : 'border-violet-500/20'
                } ${connection.enabled ? '' : 'opacity-70'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-extrabold text-white truncate max-w-[160px]">{connection.name}</span>
                      {connection.isDefault && (
                        <span className="text-[8px] uppercase font-bold px-1.5 py-0.5 rounded bg-fuchsia-500/20 border border-fuchsia-500/30 text-fuchsia-200 flex items-center gap-0.5">
                          <Star className="w-2.5 h-2.5" /> padrão
                        </span>
                      )}
                      {!connection.enabled && (
                        <span className="text-[8px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-500/20 border border-slate-500/30 text-slate-300">
                          desativada
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-violet-300/70">
                      {providerLabel(connection.provider)} · <span className="font-mono">{connection.model}</span>
                    </p>
                  </div>
                  <span className={`text-[8px] uppercase font-bold px-1.5 py-0.5 rounded border shrink-0 ${statusClasses(state)}`}>
                    {AI_STATE_LABELS[state]}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-[9px] text-violet-300/70">
                  <span className={`px-1.5 py-0.5 rounded border ${
                    capabilities.vision
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200'
                      : 'bg-slate-500/10 border-slate-500/20 text-slate-300'
                  }`}>
                    {capabilities.vision ? 'Aceita imagem' : 'Sem visão declarada'}
                  </span>
                  <span>Último teste: {formatCheckedAt(connection.lastCheckedAt)}</span>
                  {connection.lastLatencyMs !== null && <span>· {connection.lastLatencyMs}ms</span>}
                </div>

                {(connection.lastError || result?.message) && (
                  <p className={`text-[10px] p-1.5 rounded border ${
                    result?.ok
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200'
                      : 'bg-rose-500/10 border-rose-500/20 text-rose-200'
                  }`}>
                    {result?.message || connection.lastError}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-violet-500/15">
                  <button
                    onClick={() => handleTest(connection)}
                    disabled={isTesting}
                    className="px-2 py-1 rounded-lg bg-violet-600/30 border border-violet-500/30 text-violet-100 text-[10px] font-bold hover:bg-violet-600/50 disabled:opacity-50 flex items-center gap-1"
                  >
                    {isTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    {isTesting ? 'Testando...' : 'Testar'}
                  </button>
                  {!connection.isDefault && (
                    <button
                      onClick={() => publish(setDefaultConnection(connection.id))}
                      className="px-2 py-1 rounded-lg bg-white/5 border border-violet-500/20 text-violet-200 text-[10px] font-semibold hover:bg-white/10 flex items-center gap-1"
                    >
                      <Star className="w-3 h-3" /> Padrão
                    </button>
                  )}
                  {connection.isDefault && (
                    <button
                      onClick={() => setActiveConnection(connection.id)}
                      className="px-2 py-1 rounded-lg bg-white/5 border border-violet-500/20 text-violet-200 text-[10px] font-semibold hover:bg-white/10 flex items-center gap-1"
                    >
                      <Zap className="w-3 h-3" /> Usar agora
                    </button>
                  )}
                  <button
                    onClick={() => publish(setConnectionEnabled(connection.id, !connection.enabled))}
                    className="px-2 py-1 rounded-lg bg-white/5 border border-violet-500/20 text-violet-200 text-[10px] font-semibold hover:bg-white/10"
                  >
                    {connection.enabled ? 'Desativar' : 'Ativar'}
                  </button>
                  <button
                    onClick={() => startEdit(connection)}
                    className="px-2 py-1 rounded-lg bg-white/5 border border-violet-500/20 text-violet-200 text-[10px] font-semibold hover:bg-white/10 flex items-center gap-1"
                  >
                    <Pencil className="w-3 h-3" /> Editar
                  </button>
                  <button
                    onClick={() => handleDelete(connection)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 ${
                      confirmDeleteId === connection.id
                        ? 'bg-rose-600 text-white'
                        : 'bg-white/5 border border-rose-500/20 text-rose-300 hover:bg-rose-500/10'
                    }`}
                    title="Excluir conexão"
                  >
                    <Trash2 className="w-3 h-3" />
                    {confirmDeleteId === connection.id ? 'Confirmar exclusão' : 'Excluir'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="text-[9px] text-violet-400/60 flex items-start gap-1.5">
        <ShieldCheck className="w-3 h-3 mt-0.5 shrink-0" />
        <span>
          O gateway valida endpoint, tamanho e capacidades no servidor. Provedores conhecidos usam URL fixa; endpoints
          personalizados passam por bloqueio de SSRF. Imagens nunca são enviadas a modelos sem visão declarada.
        </span>
      </div>
    </section>
  );
};
