import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useModalFocus } from '../hooks/useModalFocus';
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Database,
  History,
  ImagePlus,
  Loader2,
  Lock,
  MessageSquare,
  Plug,
  Plus,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import {
  BankrollManagement,
  Candle,
  FilterConfig,
  MarketType,
  Setup,
  TradeRecord,
  UserProfile,
} from '../types';
import {
  AIConnection,
  AI_CONNECTIONS_EVENT,
  clearActiveConnection,
  getActiveConnection,
  loadConnections,
  sendAgentChat,
  setActiveConnection,
} from '../services/aiClient';
import {
  AI_STATE_LABELS,
  AIConnectionState,
  deriveProviderCapabilities,
  getProviderDefinition,
} from '../services/aiProviders';
import {
  AGENT_TOOL_DEFINITIONS,
  AgentPreferences,
  AgentToolContext,
  AgentToolId,
  AgentToolResult,
  DEFAULT_AGENT_PREFERENCES,
  buildAgentSystemPrompt,
  buildLocalAgentAnswer,
  runAgentTools,
} from '../services/agentTools';
import {
  AGENT_PREFERENCES_EVENT,
  AGENT_STORAGE_ERROR_EVENT,
  AgentStoredMessage,
  AgentThread,
  appendMessage,
  clearPreferences,
  clearThreads,
  createThread,
  deleteThread,
  loadPreferences,
  loadThreads,
  makeMessage,
  savePreferences,
  saveThreads,
  updateThread,
} from '../services/agentStore';
import { AIConnectionsPanel } from './AIConnectionsPanel';

const AGENT_TOOL_SELECTION_KEY = 'roxoia_agent_tool_selection_v1';
const MAX_THREADS_UI = 20;
const MAX_IMAGE_FILE_BYTES = 4 * 1024 * 1024;
const MAX_INPUT_CHARS = 8_000;

interface AgentTabProps {
  currentUser: UserProfile | null;
  symbol: string;
  timeframe: string;
  marketType: MarketType;
  feedStatus: string;
  candles: Candle[];
  setups: Setup[];
  activeSetup: Setup;
  filters: FilterConfig[];
  management: BankrollManagement;
  trades?: TradeRecord[];
}

interface PendingImage {
  base64: string;
  mimeType: string;
  name: string;
  previewUrl: string;
}

interface QuickAction {
  id: string;
  label: string;
  text: string;
  tools: AgentToolId[];
}

const DEFAULT_TOOL_IDS: AgentToolId[] = AGENT_TOOL_DEFINITIONS.filter((definition) => definition.defaultEnabled).map(
  (definition) => definition.id
);

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'scenario',
    label: 'Analisar cenário',
    text: 'Analise o cenário atual deste ativo com base nas ferramentas executadas. Separe fatos, inferências e incertezas.',
    tools: ['market_snapshot', 'indicators', 'setup_evaluation', 'filters', 'data_quality'],
  },
  {
    id: 'backtest',
    label: 'Rodar backtest',
    text: 'Rode o backtest do setup ativo e explique o resultado, incluindo tamanho da amostra e intervalo de confiança.',
    tools: ['backtest'],
  },
  {
    id: 'compare',
    label: 'Comparar setups',
    text: 'Compare os setups disponíveis na amostra atual e ranqueie por EV histórico, avisando se a amostra é suficiente.',
    tools: ['compare_setups'],
  },
  {
    id: 'risk',
    label: 'Simular risco',
    text: 'Simule a gestão de banca com a taxa histórica real disponível. Se não houver amostra mínima, diga que não é possível.',
    tools: ['risk_simulation'],
  },
  {
    id: 'diary',
    label: 'Resumo do diário',
    text: 'Resuma as operações registradas no diário local, separando fatos e limitações.',
    tools: ['session_summary'],
  },
  {
    id: 'quality',
    label: 'Checar dados',
    text: 'Avalie a qualidade dos dados de mercado carregados e diga se há bloqueios.',
    tools: ['data_quality'],
  },
];

function readToolSelection(): AgentToolId[] {
  try {
    const raw = localStorage.getItem(AGENT_TOOL_SELECTION_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const valid = parsed.filter((id): id is AgentToolId =>
          AGENT_TOOL_DEFINITIONS.some((definition) => definition.id === id)
        );
        return Array.from(new Set(valid));
      }
    }
  } catch {}
  return [...DEFAULT_TOOL_IDS];
}

function normalizeToolIds(ids: AgentToolId[]): AgentToolId[] {
  const selected = new Set(ids);
  return AGENT_TOOL_DEFINITIONS.filter((definition) => selected.has(definition.id)).map(
    (definition) => definition.id
  );
}

function statusChipClasses(state: AIConnectionState): string {
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

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'nunca';
  try {
    return new Date(value).toLocaleString('pt-BR');
  } catch {
    return value;
  }
}

function formatClock(value: string): string {
  try {
    return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function factsJson(facts: Record<string, unknown> | null): string {
  if (!facts) return 'Sem dados estruturados.';
  try {
    return JSON.stringify(facts, null, 2);
  } catch {
    return 'Dados não serializáveis.';
  }
}

function providerName(id: string | null | undefined): string {
  if (!id) return 'Modelo';
  return getProviderDefinition(id)?.shortName || id;
}

const ToolResultsBlock: React.FC<{ results: AgentToolResult[] }> = ({ results }) => {
  if (!results || results.length === 0) return null;
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[9px] uppercase font-bold tracking-wider text-violet-400 mr-1">
          Ferramentas desta resposta
        </span>
        {results.map((result) => (
          <span
            key={result.id}
            className={`text-[9px] px-1.5 py-0.5 rounded-full border font-semibold ${
              result.ok
                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200'
                : 'bg-rose-500/10 border-rose-500/25 text-rose-200'
            }`}
            title={result.summary}
          >
            {result.ok ? 'OK' : 'FALHOU'} · {result.label}
          </span>
        ))}
      </div>
      <details className="rounded-lg border border-violet-500/20 bg-black/30">
        <summary className="px-2.5 py-1.5 text-[10px] font-bold text-violet-200 cursor-pointer select-none flex items-center gap-1.5">
          <Database className="w-3 h-3 text-violet-400" />
          Ver dados locais usados ({results.length})
        </summary>
        <div className="px-2.5 pb-2.5 space-y-2">
          {results.map((result) => (
            <div key={result.id} className="rounded-lg bg-black/35 border border-violet-500/15 p-2 space-y-1">
              <p className="text-[10px] font-bold text-violet-100">
                {result.label} · {result.ok ? 'EXECUTADA' : 'FALHOU'} · {result.durationMs}ms
              </p>
              <p className="text-[10px] text-violet-200/85 whitespace-pre-wrap">{result.summary}</p>
              {result.warnings.length > 0 && (
                <ul className="text-[9px] text-amber-200/90 space-y-0.5">
                  {result.warnings.map((warning) => (
                    <li key={warning}>• {warning}</li>
                  ))}
                </ul>
              )}
              {result.facts && (
                <pre className="text-[9px] leading-relaxed text-violet-300/80 bg-black/50 border border-violet-500/15 rounded p-2 max-h-56 overflow-auto whitespace-pre-wrap">
                  {factsJson(result.facts)}
                </pre>
              )}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
};

export const AgentTab: React.FC<AgentTabProps> = ({
  currentUser,
  symbol,
  timeframe,
  marketType,
  feedStatus,
  candles,
  setups,
  activeSetup,
  filters,
  management,
  trades,
}) => {
  const [connections, setConnections] = useState<AIConnection[]>(() => loadConnections());
  const [activeConnection, setActiveConnectionState] = useState<AIConnection | null>(() => getActiveConnection());
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const connectionsDialogRef = useModalFocus(connectionsOpen, () => setConnectionsOpen(false));

  const [threads, setThreads] = useState<AgentThread[]>(() => loadThreads());
  const threadsRef = useRef<AgentThread[]>(threads);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);
  const [storageNotice, setStorageNotice] = useState<string | null>(null);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendFeedback, setSendFeedback] = useState<string | null>(null);
  const [enabledTools, setEnabledTools] = useState<AgentToolId[]>(() => readToolSelection());
  const [toolsOpen, setToolsOpen] = useState(false);

  const [preferences, setPreferences] = useState<AgentPreferences>(() => loadPreferences());
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [prefDraft, setPrefDraft] = useState<AgentPreferences>(() => loadPreferences());
  const [prefNotice, setPrefNotice] = useState<string | null>(null);

  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeThread = useMemo(
    () => (activeThreadId ? threads.find((thread) => thread.id === activeThreadId) || null : null),
    [threads, activeThreadId]
  );

  const capabilities = activeConnection
    ? deriveProviderCapabilities(activeConnection.provider, activeConnection.model)
    : null;
  const canSendImages = Boolean(activeConnection && capabilities?.vision);

  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  const refreshConnections = useCallback(() => {
    const list = loadConnections();
    setConnections(list);
    setActiveConnectionState(getActiveConnection(list));
  }, []);

  useEffect(() => {
    refreshConnections();
    window.addEventListener(AI_CONNECTIONS_EVENT, refreshConnections);
    return () => window.removeEventListener(AI_CONNECTIONS_EVENT, refreshConnections);
  }, [refreshConnections]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      setStorageNotice(String(detail || 'Não foi possível salvar o histórico neste navegador.'));
    };
    window.addEventListener(AGENT_STORAGE_ERROR_EVENT, handler);
    return () => window.removeEventListener(AGENT_STORAGE_ERROR_EVENT, handler);
  }, []);

  useEffect(() => {
    const sync = () => setPreferences(loadPreferences());
    window.addEventListener(AGENT_PREFERENCES_EVENT, sync);
    return () => window.removeEventListener(AGENT_PREFERENCES_EVENT, sync);
  }, []);

  useEffect(() => {
    if (!pendingImage || canSendImages) return;
    URL.revokeObjectURL(pendingImage.previewUrl);
    setPendingImage(null);
    setImageError('O modelo selecionado não declara visão. A imagem foi removida e não será enviada.');
  }, [pendingImage, canSendImages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [activeThread?.messages.length, sending]);

  const persistThreads = useCallback((list: AgentThread[]) => {
    const limited = [...list]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, MAX_THREADS_UI);
    threadsRef.current = limited;
    setThreads(limited);
    const result = saveThreads(limited);
    if (!result.ok) setStorageNotice(result.error || 'Não foi possível salvar o histórico neste navegador.');
  }, []);

  const commitThread = useCallback(
    (thread: AgentThread) => {
      persistThreads(updateThread(threadsRef.current, thread));
    },
    [persistThreads]
  );

  const toggleTool = (id: AgentToolId) => {
    setEnabledTools((previous) => {
      const next = previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id];
      try {
        localStorage.setItem(AGENT_TOOL_SELECTION_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleSelectConnection = (id: string) => {
    if (id === 'none') {
      clearActiveConnection();
      setActiveConnectionState(null);
      return;
    }
    setActiveConnection(id);
    const list = loadConnections();
    setConnections(list);
    setActiveConnectionState(getActiveConnection(list));
  };

  const clearPendingImage = useCallback(() => {
    setPendingImage((previous) => {
      if (previous) URL.revokeObjectURL(previous.previewUrl);
      return null;
    });
    setImageError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleImageFile = (file: File | null) => {
    setImageError(null);
    if (!file) return;
    if (!canSendImages) {
      setImageError('O modelo ativo não declara suporte a imagens. Escolha um modelo com visão ou use o modo local.');
      return;
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setImageError('Formato não aceito. Use PNG, JPEG ou WebP.');
      return;
    }
    if (file.size > MAX_IMAGE_FILE_BYTES) {
      setImageError('Imagem acima de 4 MB. Reduza o arquivo antes de anexar.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      if (comma < 0) {
        setImageError('Não foi possível extrair a imagem do arquivo.');
        return;
      }
      const base64 = result.slice(comma + 1);
      if (!base64) {
        setImageError('Arquivo de imagem vazio.');
        return;
      }
      setPendingImage((previous) => {
        if (previous) URL.revokeObjectURL(previous.previewUrl);
        return {
          base64,
          mimeType: file.type,
          name: file.name.slice(0, 100),
          previewUrl: URL.createObjectURL(file),
        };
      });
    };
    reader.onerror = () => setImageError('Não foi possível ler a imagem.');
    reader.readAsDataURL(file);
  };

  const buildToolContext = (): AgentToolContext => ({
    symbol,
    timeframe,
    marketType,
    feedStatus,
    candles,
    setups,
    activeSetup,
    filters,
    management,
    trades,
  });

  const handleSend = async (override?: { text: string; tools: AgentToolId[] }) => {
    if (sending) return;
    const text = (override?.text ?? draft).trim();
    const image = override ? null : pendingImage;
    if (!text && !image) {
      setSendFeedback('Digite uma pergunta ou anexe uma imagem para começar.');
      return;
    }
    if (image && !canSendImages) {
      setSendFeedback('O modelo ativo não declara visão. Remova a imagem ou troque de modelo.');
      return;
    }

    const toolIds = normalizeToolIds(override?.tools ?? enabledTools);
    if (!activeConnection && toolIds.length === 0) {
      setSendFeedback('Sem modelo conectado, selecione ao menos uma ferramenta local para gerar uma resposta factual.');
      return;
    }

    setSendFeedback(null);
    setSending(true);

    const connectionAtSend = activeConnection;
    const capabilitiesAtSend = connectionAtSend
      ? deriveProviderCapabilities(connectionAtSend.provider, connectionAtSend.model)
      : null;
    const canSeeAtSend = Boolean(capabilitiesAtSend?.vision);
    const attachedImage = image && canSeeAtSend ? image : null;
    const userContent = text || 'Analise a imagem anexada.';

    try {
      const baseThread =
        activeThread ||
        createThread(connectionAtSend?.provider || null, connectionAtSend?.model || null);
      const userMessage = makeMessage('user', userContent, {
        imageMeta: attachedImage ? { attached: true, mimeType: attachedImage.mimeType } : null,
      });
      const userThread = appendMessage(
        {
          ...baseThread,
          providerId: connectionAtSend?.provider || baseThread.providerId,
          model: connectionAtSend?.model || baseThread.model,
        },
        userMessage
      );

      commitThread(userThread);
      setActiveThreadId(userThread.id);
      setDraft('');
      clearPendingImage();

      await new Promise((resolve) => setTimeout(resolve, 30));

      const toolResults = runAgentTools(buildToolContext(), toolIds);

      let assistantMessage: AgentStoredMessage;
      if (connectionAtSend) {
        const system = buildAgentSystemPrompt({
          preferences,
          context: {
            symbol,
            timeframe,
            feedStatus,
            marketType,
            activeSetupName: activeSetup?.name || 'nenhum',
          },
          toolResults,
          canSeeImages: canSeeAtSend,
          hasAttachedImage: Boolean(attachedImage),
        });

        const history: { role: 'user' | 'assistant'; content: string }[] = [];
        let totalChars = userContent.length;
        for (let index = userThread.messages.length - 2; index >= 0 && history.length < 10; index -= 1) {
          const message = userThread.messages[index];
          if (message.errorState) continue;
          const content = message.content.slice(0, 8_000);
          if (totalChars + content.length > 40_000) break;
          history.unshift({ role: message.role, content });
          totalChars += content.length;
        }

        const result = await sendAgentChat({
          connection: connectionAtSend,
          messages: [...history, { role: 'user', content: userContent }],
          system,
          image: attachedImage ? { base64: attachedImage.base64, mimeType: attachedImage.mimeType } : null,
        });

        if (result.ok) {
          assistantMessage = makeMessage('assistant', result.text, {
            provider: result.provider,
            model: result.model,
            toolResults,
            durationMs: result.latencyMs,
          });
        } else {
          assistantMessage = makeMessage(
            'assistant',
            `Não foi possível obter resposta do modelo.\n\nEstado: ${AI_STATE_LABELS[result.state]}.\nMotivo: ${result.error}`,
            {
              provider: result.provider,
              model: result.model,
              toolResults,
              errorState: result.state,
              durationMs: result.latencyMs,
            }
          );
        }
      } else {
        assistantMessage = makeMessage('assistant', buildLocalAgentAnswer(toolResults), {
          toolResults,
          localOnly: true,
        });
      }

      const finishedThread = appendMessage(
        {
          ...userThread,
          providerId: connectionAtSend?.provider || null,
          model: connectionAtSend?.model || null,
        },
        assistantMessage
      );
      commitThread(finishedThread);
    } catch (error: any) {
      setSendFeedback(
        `Falha inesperada ao processar a mensagem: ${String(error?.message || 'erro interno')}. Nenhuma resposta foi inventada.`
      );
    } finally {
      setSending(false);
    }
  };

  const handleQuickAction = (action: QuickAction) => {
    void handleSend({ text: action.text, tools: action.tools });
  };

  const handleNewThread = () => {
    if (sending) return;
    setActiveThreadId(null);
    setDraft('');
    setSendFeedback(null);
    setHistoryOpen(false);
    clearPendingImage();
  };

  const handleSelectThread = (id: string) => {
    if (sending) return;
    setActiveThreadId(id);
    setSendFeedback(null);
    setHistoryOpen(false);
  };

  const handleDeleteThread = (id: string) => {
    if (sending) return;
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    setConfirmDeleteId(null);
    const next = deleteThread(threadsRef.current, id);
    persistThreads(next);
    if (activeThreadId === id) setActiveThreadId(null);
  };

  const handleClearHistory = () => {
    if (sending) return;
    if (!confirmClearHistory) {
      setConfirmClearHistory(true);
      return;
    }
    const result = clearThreads();
    if (!result.ok) {
      setStorageNotice(result.error || 'Não foi possível limpar o histórico.');
      return;
    }
    threadsRef.current = [];
    setThreads([]);
    setActiveThreadId(null);
    setConfirmClearHistory(false);
    setStorageNotice(null);
  };

  const handleOpenPreferences = () => {
    setPrefDraft(preferences);
    setPrefNotice(null);
    setPreferencesOpen((value) => !value);
  };

  const handleSavePreferences = () => {
    const result = savePreferences(prefDraft);
    if (!result.ok) {
      setPrefNotice(result.error || 'Não foi possível salvar as preferências.');
      return;
    }
    setPreferences(loadPreferences());
    setPrefNotice('Preferências salvas neste navegador. Elas não substituem as regras de honestidade do agente.');
  };

  const handleResetPreferences = () => {
    const result = clearPreferences();
    if (!result.ok) {
      setPrefNotice(result.error || 'Não foi possível restaurar as preferências.');
      return;
    }
    setPrefDraft({ ...DEFAULT_AGENT_PREFERENCES });
    setPreferences({ ...DEFAULT_AGENT_PREFERENCES });
    setPrefNotice('Preferências restauradas para o padrão.');
  };

  const activeMessages = activeThread?.messages || [];
  const activeState = activeConnection ? activeConnection.status : null;
  const sendingLabel = activeConnection
    ? 'Executando ferramentas e consultando o modelo...'
    : 'Executando ferramentas locais...';

  return (
    <div className="space-y-4">
      <section className="bg-gradient-to-r from-violet-950/80 via-[#150b2e] to-black/80 border border-violet-500/30 rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-violet-600 to-fuchsia-500 flex items-center justify-center text-white shadow-[0_0_20px_rgba(168,85,247,0.4)]">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-extrabold text-base sm:text-lg text-white tracking-wide">ROXO Agent</h2>
                <span className="text-[10px] bg-violet-500/20 text-violet-200 border border-violet-500/30 font-bold px-2 py-0.5 rounded">
                  FERRAMENTAS REAIS
                </span>
              </div>
              <p className="text-xs text-violet-300/80 mt-0.5 max-w-2xl">
                O agente executa ferramentas no seu navegador antes de responder. Sem modelo conectado, ele apenas
                reproduz os fatos locais; nunca simula uma interpretação de IA.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setHistoryOpen((value) => !value)}
              className="lg:hidden px-3 py-1.5 rounded-lg bg-white/5 border border-violet-500/25 text-violet-200 text-xs font-bold flex items-center gap-1.5"
            >
              <History className="w-3.5 h-3.5" /> Histórico
            </button>
            <button
              onClick={() => setConnectionsOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-white/5 border border-violet-500/25 text-violet-200 text-xs font-bold flex items-center gap-1.5 hover:bg-white/10"
            >
              <Plug className="w-3.5 h-3.5" /> Conexões de IA
            </button>
            <button
              onClick={handleOpenPreferences}
              className="px-3 py-1.5 rounded-lg bg-white/5 border border-violet-500/25 text-violet-200 text-xs font-bold flex items-center gap-1.5 hover:bg-white/10"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" /> Preferências
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-2.5 items-end">
          <label className="space-y-1 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-violet-400">
              Modelo desta conversa
            </span>
            <select
              value={activeConnection?.id || 'none'}
              onChange={(event) => handleSelectConnection(event.target.value)}
              disabled={sending}
              className="w-full bg-black/60 border border-violet-500/30 rounded-lg px-2.5 py-2 text-xs text-white outline-none focus:border-violet-400 disabled:opacity-60"
            >
              <option value="none" className="bg-[#120a28]">
                Modo local — sem modelo de IA
              </option>
              {connections.map((connection) => (
                <option
                  key={connection.id}
                  value={connection.id}
                  disabled={!connection.enabled}
                  className="bg-[#120a28]"
                >
                  {connection.name} · {connection.model}
                  {connection.enabled ? '' : ' (desativada)'}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap items-center gap-1.5 pb-0.5">
            <span
              className={`text-[10px] uppercase font-bold px-2 py-1 rounded-full border ${
                activeState ? statusChipClasses(activeState) : 'bg-slate-500/15 text-slate-300 border-slate-500/30'
              }`}
            >
              {activeState ? AI_STATE_LABELS[activeState] : 'MODO LOCAL'}
            </span>
            {activeConnection && (
              <span className="text-[10px] text-violet-300/70">
                {providerName(activeConnection.provider)} · <span className="font-mono">{activeConnection.model}</span>
              </span>
            )}
            {capabilities && (
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded-full border ${
                  capabilities.vision
                    ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200'
                    : 'bg-slate-500/10 border-slate-500/25 text-slate-300'
                }`}
              >
                {capabilities.vision ? 'Visão declarada' : 'Sem visão declarada'}
              </span>
            )}
          </div>
        </div>

        {activeConnection ? (
          <div className="text-[10px] text-violet-300/75 flex items-start gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0 text-violet-400" />
            <span>
              {activeConnection.status === 'connected'
                ? `Conexão confirmada por chamada real em ${formatDateTime(activeConnection.lastCheckedAt)}.`
                : activeConnection.lastError
                  ? `Último teste: ${AI_STATE_LABELS[activeConnection.status]} — ${activeConnection.lastError}`
                  : 'Esta conexão ainda não foi confirmada. O selo CONECTADO só aparece após uma chamada real bem-sucedida; enviar uma mensagem também é uma chamada real.'}
            </span>
          </div>
        ) : (
          <div className="text-[10px] text-violet-300/75 flex items-start gap-1.5">
            <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-violet-400" />
            <span>
              Nenhum modelo conectado. O agente opera com as ferramentas locais e o motor estatístico do app. Nenhuma
              chave é necessária para isso.
            </span>
          </div>
        )}

        {preferencesOpen && (
          <div className="p-3 rounded-xl bg-black/30 border border-violet-500/25 space-y-2.5 animate-fadeIn">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-fuchsia-400" /> Contexto e preferências do agente
              </span>
              <button
                onClick={() => setPreferencesOpen(false)}
                className="p-1 rounded-md text-violet-400 hover:text-white hover:bg-white/10"
                aria-label="Fechar preferências"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <label className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-violet-400">Ativos favoritos</span>
                <input
                  value={prefDraft.favoriteAssets}
                  onChange={(event) => setPrefDraft({ ...prefDraft, favoriteAssets: event.target.value })}
                  maxLength={300}
                  placeholder="ex.: EURUSD, BTCUSDT, PETR4"
                  className="w-full bg-black/60 border border-violet-500/30 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-violet-400"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-violet-400">Timeframes favoritos</span>
                <input
                  value={prefDraft.favoriteTimeframes}
                  onChange={(event) => setPrefDraft({ ...prefDraft, favoriteTimeframes: event.target.value })}
                  maxLength={120}
                  placeholder="ex.: 5m, 15m"
                  className="w-full bg-black/60 border border-violet-500/30 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-violet-400"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-violet-400">Indicadores preferidos</span>
                <input
                  value={prefDraft.favoriteIndicators}
                  onChange={(event) => setPrefDraft({ ...prefDraft, favoriteIndicators: event.target.value })}
                  maxLength={300}
                  placeholder="ex.: RSI, ADX, EMA9/21"
                  className="w-full bg-black/60 border border-violet-500/30 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-violet-400"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-violet-400">Estilo de resposta</span>
                <input
                  value={prefDraft.preferredStyle}
                  onChange={(event) => setPrefDraft({ ...prefDraft, preferredStyle: event.target.value })}
                  maxLength={300}
                  placeholder="ex.: respostas curtas, com foco em risco"
                  className="w-full bg-black/60 border border-violet-500/30 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-violet-400"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-violet-400">Regras de bloqueio pessoais</span>
                <input
                  value={prefDraft.blockingRules}
                  onChange={(event) => setPrefDraft({ ...prefDraft, blockingRules: event.target.value })}
                  maxLength={500}
                  placeholder="ex.: não sugerir operar contra EMA50"
                  className="w-full bg-black/60 border border-violet-500/30 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-violet-400"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-violet-400">Instruções personalizadas</span>
                <textarea
                  value={prefDraft.customInstructions}
                  onChange={(event) => setPrefDraft({ ...prefDraft, customInstructions: event.target.value })}
                  maxLength={800}
                  rows={2}
                  placeholder="Contexto que você quer que o agente considere"
                  className="w-full bg-black/60 border border-violet-500/30 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-violet-400 resize-y"
                />
              </label>
            </div>

            <p className="text-[9px] text-violet-400/70">
              Estas preferências entram no prompt como contexto editável. Elas nunca podem pedir para inventar dados,
              ignorar ferramentas que falharam ou prometer resultados.
            </p>

            {prefNotice && (
              <p className="text-[10px] text-emerald-200 bg-emerald-500/10 border border-emerald-500/25 rounded-lg px-2.5 py-1.5">
                {prefNotice}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleSavePreferences}
                className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-xs font-bold"
              >
                Salvar preferências
              </button>
              <button
                onClick={handleResetPreferences}
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-violet-500/25 text-violet-200 text-xs font-bold hover:bg-white/10"
              >
                Restaurar padrão
              </button>
              <button
                onClick={() => setPreferencesOpen(false)}
                className="px-3 py-1.5 rounded-lg text-violet-300 text-xs font-semibold hover:bg-white/5"
              >
                Fechar
              </button>
            </div>
          </div>
        )}
      </section>

      {storageNotice && (
        <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-[11px] text-rose-200 flex items-start justify-between gap-2">
          <span className="flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            {storageNotice}
          </span>
          <button
            onClick={() => setStorageNotice(null)}
            className="p-0.5 rounded text-rose-300 hover:text-white"
            aria-label="Fechar aviso de armazenamento"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[270px_minmax(0,1fr)] gap-3">
        <aside
          className={`${historyOpen ? 'block' : 'hidden lg:block'} bg-[#120a28]/80 border border-violet-500/25 rounded-2xl p-3 space-y-2.5 h-fit`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-violet-300" />
              <span className="text-xs font-extrabold text-white">Histórico</span>
            </div>
            <button
              onClick={handleNewThread}
              disabled={sending}
              className="px-2 py-1 rounded-lg bg-violet-600/30 border border-violet-500/30 text-violet-100 text-[10px] font-bold flex items-center gap-1 hover:bg-violet-600/50 disabled:opacity-50"
            >
              <Plus className="w-3 h-3" /> Nova
            </button>
          </div>

          <p className="text-[9px] text-violet-400/70">
            Conversas deste navegador. Imagens não são salvas; apenas o tipo do arquivo fica registrado.
          </p>

          {threads.length === 0 ? (
            <p className="text-[10px] text-violet-300/60 p-2 rounded-lg bg-black/25 border border-dashed border-violet-500/20">
              Nenhuma conversa salva.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-0.5">
              {threads.map((thread) => {
                const isActive = thread.id === activeThreadId;
                const userMessages = thread.messages.filter((message) => message.role === 'user').length;
                return (
                  <div
                    key={thread.id}
                    className={`rounded-xl border bg-black/30 p-2 space-y-1 ${
                      isActive ? 'border-fuchsia-500/40' : 'border-violet-500/15'
                    }`}
                  >
                    <button
                      onClick={() => handleSelectThread(thread.id)}
                      disabled={sending}
                      className="w-full text-left disabled:opacity-60"
                    >
                      <span className="block text-[11px] font-bold text-violet-100 truncate">{thread.title}</span>
                      <span className="block text-[9px] text-violet-400/70 truncate">
                        {thread.providerId
                          ? `${providerName(thread.providerId)} · ${thread.model || 'modelo'}`
                          : 'Modo local'}
                        {' · '}
                        {userMessages} pergunta{userMessages === 1 ? '' : 's'}
                      </span>
                      <span className="block text-[9px] text-violet-400/50">
                        {formatDateTime(thread.updatedAt)}
                      </span>
                    </button>
                    <div className="flex justify-end">
                      <button
                        onClick={() => handleDeleteThread(thread.id)}
                        disabled={sending}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-1 disabled:opacity-50 ${
                          confirmDeleteId === thread.id
                            ? 'bg-rose-600 text-white'
                            : 'text-rose-300 hover:bg-rose-500/10'
                        }`}
                        title="Excluir conversa"
                      >
                        <Trash2 className="w-3 h-3" />
                        {confirmDeleteId === thread.id ? 'Confirmar' : 'Excluir'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {threads.length > 0 && (
            <button
              onClick={handleClearHistory}
              disabled={sending}
              className={`w-full px-2 py-1.5 rounded-lg text-[10px] font-bold border disabled:opacity-50 ${
                confirmClearHistory
                  ? 'bg-rose-600 text-white border-rose-500'
                  : 'bg-white/5 text-rose-300 border-rose-500/20 hover:bg-rose-500/10'
              }`}
            >
              {confirmClearHistory ? 'Confirmar limpeza de todo o histórico' : 'Limpar todo o histórico'}
            </button>
          )}
        </aside>

        <section className="bg-[#100826]/85 border border-violet-500/25 rounded-2xl overflow-hidden flex flex-col min-h-[560px]">
          <div className="border-b border-violet-500/20 bg-black/25 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap text-[10px]">
                <span className="px-2 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/25 text-violet-200 font-semibold">
                  {symbol} · {timeframe}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-white/5 border border-violet-500/20 text-violet-300">
                  Feed: {feedStatus}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-white/5 border border-violet-500/20 text-violet-300">
                  Setup: {activeSetup?.name || 'nenhum'}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-white/5 border border-violet-500/20 text-violet-300">
                  Velas válidas: {candles.length}
                </span>
              </div>
              <button
                onClick={() => setToolsOpen((value) => !value)}
                className="px-2 py-1 rounded-lg bg-white/5 border border-violet-500/20 text-violet-200 text-[10px] font-bold flex items-center gap-1"
              >
                <Wrench className="w-3 h-3" /> Ferramentas ({enabledTools.length}/{AGENT_TOOL_DEFINITIONS.length})
              </button>
            </div>

            <p className="text-[9px] text-violet-400/70">
              Contexto da interface. Ele indica o que está carregado, mas não prova atualidade: os fatos vêm das
              ferramentas executadas abaixo.
            </p>

            {toolsOpen && (
              <div className="p-2 rounded-xl bg-black/30 border border-violet-500/15 space-y-2 animate-fadeIn">
                <div className="flex flex-wrap gap-1.5">
                  {AGENT_TOOL_DEFINITIONS.map((definition) => {
                    const active = enabledTools.includes(definition.id);
                    return (
                      <button
                        key={definition.id}
                        onClick={() => toggleTool(definition.id)}
                        title={definition.description}
                        className={`px-2 py-1 rounded-lg border text-[10px] font-semibold transition-colors ${
                          active
                            ? 'bg-violet-600/35 border-violet-400/50 text-white'
                            : 'bg-white/5 border-violet-500/20 text-violet-300/70 hover:text-white'
                        }`}
                      >
                        {definition.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[9px] text-violet-400/70">
                  As ferramentas selecionadas rodam no seu navegador antes de cada mensagem. Se uma delas falhar, o
                  motivo aparece na resposta; nenhum valor é completado por suposição.
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-1.5">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.id}
                  onClick={() => handleQuickAction(action)}
                  disabled={sending}
                  className="px-2 py-1 rounded-lg bg-white/5 border border-violet-500/20 text-violet-200 text-[10px] font-bold hover:bg-white/10 disabled:opacity-50"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 max-h-[58vh]">
            {activeMessages.length === 0 ? (
              <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center gap-2 px-4">
                <div className="w-12 h-12 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-300">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-extrabold text-white">Comece uma conversa</h3>
                <p className="text-[11px] text-violet-300/70 max-w-md">
                  Pergunte sobre o cenário atual, peça o backtest do setup ou simule a gestão de banca. O agente
                  executa as ferramentas selecionadas e mostra os dados usados em cada resposta.
                </p>
                <p className="text-[10px] text-violet-400/60 max-w-md">
                  {currentUser
                    ? `Sessão de ${currentUser.displayName}. O histórico fica apenas neste navegador.`
                    : 'Você está como visitante. O histórico fica apenas neste navegador.'}
                </p>
              </div>
            ) : (
              activeMessages.map((message) => {
                const isUser = message.role === 'user';
                return (
                  <div key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[92%] sm:max-w-[85%] rounded-2xl px-3 py-2 border ${
                        isUser
                          ? 'bg-gradient-to-br from-violet-700/60 to-fuchsia-800/40 border-violet-400/30 text-white'
                          : message.errorState
                            ? 'bg-rose-950/40 border-rose-500/30 text-rose-50'
                            : 'bg-black/40 border-violet-500/20 text-violet-50'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 flex-wrap mb-1 text-[9px] text-violet-300/70">
                        <span className="font-bold uppercase tracking-wider">{isUser ? 'Você' : 'ROXO Agent'}</span>
                        {!isUser && (
                          <>
                            <span>·</span>
                            <span>
                              {message.localOnly
                                ? 'Modo local (sem IA)'
                                : `${providerName(message.provider)} · ${message.model || 'modelo'}`}
                            </span>
                          </>
                        )}
                        <span>·</span>
                        <span>{formatClock(message.createdAt)}</span>
                        {typeof message.durationMs === 'number' && message.durationMs > 0 && (
                          <span>· {message.durationMs}ms</span>
                        )}
                      </div>

                      {message.imageMeta?.attached && (
                        <div className="mb-1.5 inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full bg-black/30 border border-violet-400/25 text-violet-200">
                          <ImagePlus className="w-3 h-3" /> Imagem anexada ({message.imageMeta.mimeType})
                        </div>
                      )}

                      {message.errorState && (
                        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-rose-200">
                          {AI_STATE_LABELS[message.errorState]}
                        </div>
                      )}

                      <div className="text-[12px] leading-relaxed whitespace-pre-wrap break-words">{message.content}</div>

                      {message.toolResults && message.toolResults.length > 0 && (
                        <ToolResultsBlock results={message.toolResults} />
                      )}

                      {message.localOnly && (
                        <p className="mt-1.5 text-[9px] text-violet-300/60">
                          Esta resposta não passou por um modelo de IA. Ela reproduz apenas os fatos das ferramentas.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {sending && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-3 py-2 border border-violet-500/20 bg-black/40 text-violet-200 text-[11px] flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {sendingLabel}
                </div>
              </div>
            )}

            <div ref={endRef} />
          </div>

          <div className="border-t border-violet-500/20 bg-black/20 p-3 space-y-2">
            {sendFeedback && (
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/25 text-[10px] text-amber-200 flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                {sendFeedback}
              </div>
            )}

            {imageError && (
              <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/25 text-[10px] text-rose-200 flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                {imageError}
              </div>
            )}

            {pendingImage && (
              <div className="flex items-center gap-2 p-2 rounded-xl bg-black/35 border border-violet-500/25">
                <img
                  src={pendingImage.previewUrl}
                  alt="Prévia da imagem anexada"
                  className="w-12 h-12 object-cover rounded-lg border border-violet-500/25"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold text-white truncate">{pendingImage.name || 'imagem'}</p>
                  <p className="text-[9px] text-violet-300/70">
                    {pendingImage.mimeType} · enviada somente nesta mensagem; não fica salva no histórico.
                  </p>
                </div>
                <button
                  onClick={clearPendingImage}
                  disabled={sending}
                  className="p-1 rounded-md text-violet-300 hover:text-white hover:bg-white/10 disabled:opacity-50"
                  aria-label="Remover imagem"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="flex items-end gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={!canSendImages || sending}
                title={
                  canSendImages
                    ? 'Anexar imagem (PNG, JPEG ou WebP até 4 MB)'
                    : 'O modelo ativo não declara visão. Escolha um modelo com visão para anexar imagens.'
                }
                className="p-2 rounded-xl bg-white/5 border border-violet-500/25 text-violet-200 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                aria-label="Anexar imagem"
              >
                <ImagePlus className="w-4 h-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => handleImageFile(event.target.files?.[0] || null)}
              />

              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value.slice(0, MAX_INPUT_CHARS))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void handleSend();
                  }
                }}
                disabled={sending}
                rows={2}
                maxLength={MAX_INPUT_CHARS}
                placeholder={
                  activeConnection
                    ? `Pergunte sobre ${symbol} ${timeframe}... (Enter envia, Shift+Enter quebra linha)`
                    : 'Peça uma leitura das ferramentas locais... (Enter envia, Shift+Enter quebra linha)'
                }
                className="flex-1 min-w-0 bg-black/55 border border-violet-500/30 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-violet-400 resize-none disabled:opacity-60"
              />

              <button
                onClick={() => void handleSend()}
                disabled={
                  sending ||
                  (!draft.trim() && !pendingImage) ||
                  (!activeConnection && enabledTools.length === 0)
                }
                className="px-3 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-md hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {activeConnection ? 'Enviar' : 'Executar local'}
              </button>
            </div>

            <div className="flex items-start gap-1.5 text-[9px] text-violet-400/60">
              <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" />
              <span>
                O agente não executa ordens financeiras. Score não é probabilidade. As chaves de API ficam neste
                navegador e são enviadas apenas ao gateway do próprio app, nunca no corpo da mensagem.
              </span>
            </div>
          </div>
        </section>
      </div>

      {connectionsOpen && (
        <div
          ref={connectionsDialogRef}
          className="fixed inset-0 z-[75] flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="agent-connections-title"
          tabIndex={-1}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setConnectionsOpen(false);
          }}
        >
          <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto bg-[#0d071f] border border-violet-500/30 rounded-2xl shadow-2xl p-3 sm:p-4 space-y-3 animate-fadeIn">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-violet-300">
                  <Plug className="w-4 h-4" />
                </div>
                <div>
                  <h2 id="agent-connections-title" className="text-sm font-extrabold text-white">Conexões de IA</h2>
                  <p className="text-[10px] text-violet-300/70">
                    Configure, teste e escolha o modelo usado pelo ROXO Agent.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setConnectionsOpen(false)}
                data-autofocus
                className="p-1.5 rounded-lg text-violet-300 hover:text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-violet-400"
                aria-label="Fechar conexões de IA"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <AIConnectionsPanel
              onConnectionsChange={(list, active) => {
                setConnections(list);
                setActiveConnectionState(active);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
