import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Candle, ChartVisionResult } from '../types';
import { geminiService } from '../services/geminiService';
import {
  X,
  Camera,
  Upload,
  Monitor,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Activity,
  Layers,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  Clipboard,
} from 'lucide-react';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'upload' | 'camera' | 'screen';
  onApplyDetectedChart?: (data: {
    symbol: string;
    timeframe: string;
    candles: Candle[];
    visionReport: ChartVisionResult;
  }) => void;
  onCandlesDetected?: (candles: Candle[]) => void;
}

export const CameraModal: React.FC<CameraModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'upload',
  onApplyDetectedChart,
  onCandlesDetected,
}) => {
  const [videoActive, setVideoActive] = useState(false);
  const [mode, setMode] = useState<'idle' | 'camera' | 'screen' | 'analyzing' | 'result'>('idle');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<(ChartVisionResult & { candles?: Candle[] }) | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setVideoActive(false);
  }, []);

  const handleClose = () => {
    stopStream();
    setPreviewImage(null);
    setAnalysisResult(null);
    setMode('idle');
    onClose();
  };

  // Clipboard paste listener (Ctrl+V)
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            processImageFile(file);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen]);

  // Auto-start the capture mode requested by the caller (camera / screen)
  useEffect(() => {
    if (!isOpen) return;
    if (initialMode === 'camera') {
      handleStartCamera();
    } else if (initialMode === 'screen') {
      handleStartScreen();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialMode]);

  if (!isOpen) return null;

  const processImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setPreviewImage(base64);
      runVisionAnalysis(base64, file.type || 'image/png');
    };
    reader.readAsDataURL(file);
  };

  const runVisionAnalysis = async (base64: string, mime: string) => {
    setMode('analyzing');
    stopStream();

    try {
      const result = await geminiService.analyzeChartImage(base64, mime);
      setAnalysisResult(result);
      setMode('result');
    } catch (err: any) {
      setAnalysisResult({
        isValidChart: false,
        confidence: 0,
        symbolDetected: null,
        timeframeDetected: null,
        priceScaleDetected: null,
        patternsDetected: [],
        trendDetected: 'INDEFINIDO',
        rejectionReason: 'Não foi possível validar esta imagem com segurança.',
        summary: `Falha na execução: ${err.message || 'Erro inesperado'}`,
      });
      setMode('result');
    }
  };

  const handleStartCamera = async () => {
    try {
      stopStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setVideoActive(true);
      setMode('camera');
      setCaptureError(null);
    } catch (err: any) {
      setCaptureError(`Não foi possível acessar a câmera: ${err?.message || 'permissão negada'}`);
    }
  };

  const handleStartScreen = async () => {
    try {
      stopStream();
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 10 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setVideoActive(true);
      setMode('screen');
      setCaptureError(null);
    } catch (err: any) {
      setCaptureError('Captura de tela cancelada ou bloqueada pelo navegador.');
    }
  };

  const handleCaptureFrame = () => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/png');
    setPreviewImage(dataUrl);
    runVisionAnalysis(dataUrl, 'image/png');
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      processImageFile(file);
    }
  };

  const handleApply = () => {
    if (!analysisResult || !analysisResult.isValidChart) return;

    const sym = analysisResult.symbolDetected || 'EURUSD';
    const tf = analysisResult.timeframeDetected || '5m';
    const candlesToApply = analysisResult.candles || [];

    if (onApplyDetectedChart) {
      onApplyDetectedChart({
        symbol: sym,
        timeframe: tf,
        candles: candlesToApply,
        visionReport: analysisResult,
      });
    } else if (onCandlesDetected && candlesToApply.length > 0) {
      onCandlesDetected(candlesToApply);
    }

    handleClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-[#100924] border border-violet-500/30 rounded-2xl max-w-2xl w-full p-5 sm:p-6 space-y-4 shadow-2xl relative my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-violet-500/20 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-300">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-sm text-white uppercase tracking-wider font-mono">
                  OCR & Reconhecimento Visual de Gráficos
                </h3>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 font-mono border border-violet-500/30">
                  GEMINI 2.5 FLASH
                </span>
              </div>
              <p className="text-[11px] text-violet-300/70">
                Auditoria de eixos, escala de preços, padrões de vela e conferência com o feed real.
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-violet-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {captureError && (
          <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-[11px] text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
            <span className="flex-1">{captureError}</span>
            <button onClick={() => setCaptureError(null)} className="text-rose-400 hover:text-white" aria-label="Fechar aviso">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Viewport Area */}
        <div className="relative aspect-video bg-black/80 rounded-xl overflow-hidden border border-violet-500/30 flex items-center justify-center">
          {/* Live Video (Camera or Screen Capture) */}
          <video
            ref={videoRef}
            playsInline
            muted
            className={`w-full h-full object-contain ${videoActive ? 'block' : 'hidden'}`}
          />

          {/* Analyzing State HUD overlay */}
          {mode === 'analyzing' && (
            <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center p-6 text-center z-20">
              <div className="relative w-20 h-20 mb-4 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-2 border-violet-500/30 animate-ping" />
                <div className="absolute inset-0 rounded-full border-2 border-t-violet-400 border-r-fuchsia-400 border-b-transparent border-l-transparent animate-spin" />
                <Activity className="w-8 h-8 text-fuchsia-400" />
              </div>
              <span className="font-mono text-xs uppercase tracking-widest text-violet-200 font-bold mb-1">
                Auditoria Visual em Execução...
              </span>
              <p className="text-[11px] text-violet-400/80 max-w-sm">
                Validando legibilidade dos eixos vertical e horizontal, cotas de preço e confluências de candlestick.
              </p>
            </div>
          )}

          {/* Idle / Drag & Drop Dropzone */}
          {!videoActive && mode !== 'analyzing' && !previewImage && (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`w-full h-full flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-all border-2 border-dashed ${
                isDragging
                  ? 'border-fuchsia-400 bg-fuchsia-950/20 scale-[0.99]'
                  : 'border-violet-500/20 hover:border-violet-500/50 hover:bg-white/[0.02]'
              }`}
            >
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600/20 to-fuchsia-600/20 border border-violet-500/30 flex items-center justify-center text-violet-300 mb-3 shadow-lg">
                <Upload className="w-6 h-6" />
              </div>
              <p className="text-xs font-semibold text-white mb-1">
                Arraste um print do gráfico ou clique para selecionar
              </p>
              <p className="text-[10px] text-violet-400/70 max-w-xs mb-3">
                Suporta TradingView, IQ Option, Exnova, MetaTrader 5 e Binance. Você também pode colar com{' '}
                <kbd className="px-1 py-0.5 rounded bg-violet-950 border border-violet-500/30 text-violet-300 font-mono">
                  Ctrl+V
                </kbd>
                .
              </p>
              <div className="flex items-center gap-2 text-[10px] text-violet-400/60">
                <Clipboard className="w-3 h-3" />
                <span>Colagem da área de transferência suportada</span>
              </div>
            </div>
          )}

          {/* Static Preview Image if not capturing live */}
          {previewImage && !videoActive && (
            <img
              src={previewImage}
              alt="Gráfico Enviado"
              className="w-full h-full object-contain"
            />
          )}

          {/* Live Capture Reticle when Video is active */}
          {videoActive && (
            <div className="absolute inset-0 pointer-events-none border border-violet-500/20 flex flex-col justify-between p-4">
              <div className="flex justify-between items-center text-[10px] font-mono text-emerald-400/80 bg-black/60 px-2 py-1 rounded backdrop-blur-sm self-start">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block mr-1.5" />
                SINAL DE VÍDEO ATIVO — ENQUADRE O GRÁFICO
              </div>
              <div className="self-center border border-dashed border-violet-400/40 w-4/5 h-3/5 rounded-lg flex items-center justify-center">
                <span className="text-[10px] text-violet-300/60 font-mono uppercase">
                  Área de Captura
                </span>
              </div>
              <div className="text-[10px] font-mono text-violet-400/70 text-center">
                Mantenha os eixos de preço nítidos e iluminados
              </div>
            </div>
          )}
        </div>

        {/* OCR Result Audit Card */}
        {mode === 'result' && analysisResult && (
          <div className="space-y-3">
            {analysisResult.isValidChart ? (
              <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-200 text-xs space-y-2.5 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span className="font-extrabold font-mono uppercase tracking-wider text-emerald-300">
                      Gráfico Validado com Sucesso ({analysisResult.confidence}% Confiança)
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-[10px] font-mono font-bold text-emerald-300 border border-emerald-500/40">
                    ANÁLISE VISUAL                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                  <div className="p-2 rounded-lg bg-black/40 border border-emerald-500/20">
                    <span className="text-emerald-400/60 block text-[9px] font-mono uppercase">Ativo</span>
                    <span className="font-bold font-mono text-white text-xs">
                      {analysisResult.symbolDetected || 'Detectado'}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-black/40 border border-emerald-500/20">
                    <span className="text-emerald-400/60 block text-[9px] font-mono uppercase">Timeframe</span>
                    <span className="font-bold font-mono text-white text-xs">
                      {analysisResult.timeframeDetected?.toUpperCase() || '5M'}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-black/40 border border-emerald-500/20">
                    <span className="text-emerald-400/60 block text-[9px] font-mono uppercase">Tendência</span>
                    <span className="font-bold font-mono text-xs flex items-center gap-1">
                      {analysisResult.trendDetected === 'ALTA' ? (
                        <span className="text-emerald-400 flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" /> Alta
                        </span>
                      ) : analysisResult.trendDetected === 'BAIXA' ? (
                        <span className="text-rose-400 flex items-center gap-1">
                          <TrendingDown className="w-3 h-3" /> Baixa
                        </span>
                      ) : (
                        <span className="text-amber-400">Lateral</span>
                      )}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-black/40 border border-emerald-500/20">
                    <span className="text-emerald-400/60 block text-[9px] font-mono uppercase">Eixo Preço</span>
                    <span className="font-mono text-white text-[11px] truncate block">
                      {analysisResult.priceScaleDetected
                        ? `${analysisResult.priceScaleDetected.min} — ${analysisResult.priceScaleDetected.max}`
                        : 'Eixos Nítidos'}
                    </span>
                  </div>
                </div>

                {/* Detected Patterns */}
                {analysisResult.patternsDetected && analysisResult.patternsDetected.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="text-[10px] text-emerald-400/80 font-mono">Padrões:</span>
                    {analysisResult.patternsDetected.map((p, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/30 text-[10px] font-mono text-emerald-300 font-semibold"
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                )}

                {/* Real Market Sync Guarantee */}
                <div className="p-2 rounded-lg bg-black/50 border border-emerald-500/20 flex items-center justify-between text-[10px]">
                  <span className="text-emerald-300/80 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    {analysisResult.syncedRealCandlesCount && analysisResult.syncedRealCandlesCount > 0
                      ? `Sincronizado: ${analysisResult.syncedRealCandlesCount} velas reais obtidas do feed oficial (${analysisResult.syncedProvider || 'Mercado'})`
                      : 'Nenhuma vela sintética foi gerada. As velas reais serão buscadas no terminal.'}
                  </span>
                  <span className="font-mono text-emerald-400 font-bold">VALIDADO PELA IA</span>
                </div>
              </div>
            ) : (
              /* Rejection Card - STRICT REQUIREMENT */
              <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs space-y-2 animate-fadeIn">
                <div className="flex items-center gap-2 text-rose-400">
                  <ShieldAlert className="w-5 h-5 flex-shrink-0" />
                  <span className="font-extrabold font-mono text-sm tracking-wide text-rose-300">
                    Não foi possível validar esta imagem com segurança.
                  </span>
                </div>
                <p className="text-[11px] text-rose-300/80 leading-relaxed">
                  {analysisResult.summary ||
                    'Os eixos de cotações numéricas ou tempo estão ilegíveis, cortados ou com resolução insuficiente. Para proteger a integridade matemática, o terminal bloqueia qualquer geração de dados incertos.'}
                </p>
                <div className="p-2.5 rounded-lg bg-black/40 border border-rose-500/20 text-[10px] text-rose-300/70 font-mono flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                  <span>Dica: Capture a tela inteira da corretora incluindo o topo com o nome do par e a régua de preços à direita.</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) processImageFile(file);
            }}
            className="hidden"
          />

          {!videoActive && mode !== 'result' && (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-all"
              >
                <Upload className="w-3.5 h-3.5" /> Enviar Print do Gráfico
              </button>
              <button
                onClick={handleStartCamera}
                className="py-2.5 px-3 rounded-xl bg-white/5 border border-violet-500/20 hover:bg-white/10 text-violet-200 font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
              >
                <Camera className="w-3.5 h-3.5" /> Câmera
              </button>
              <button
                onClick={handleStartScreen}
                className="py-2.5 px-3 rounded-xl bg-white/5 border border-violet-500/20 hover:bg-white/10 text-violet-200 font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
              >
                <Monitor className="w-3.5 h-3.5" /> Gravar Tela
              </button>
            </>
          )}

          {videoActive && (
            <div className="flex items-center gap-2 w-full">
              <button
                onClick={handleCaptureFrame}
                className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-all"
              >
                <Camera className="w-4 h-4" /> Congelar e Analisar Gráfico
              </button>
              <button
                onClick={stopStream}
                className="py-2.5 px-3 rounded-xl bg-white/5 border border-white/10 text-violet-300 hover:text-white text-xs font-semibold"
              >
                Cancelar
              </button>
            </div>
          )}

          {mode === 'result' && (
            <div className="flex items-center gap-2 w-full">
              <button
                onClick={() => {
                  setAnalysisResult(null);
                  setPreviewImage(null);
                  setMode('idle');
                }}
                className="py-2.5 px-3 rounded-xl bg-white/5 border border-violet-500/20 text-violet-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Enviar Outra Imagem
              </button>

              {analysisResult?.isValidChart ? (
                <button
                  onClick={handleApply}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-xl shadow-emerald-950/50 transition-all font-mono"
                >
                  <ArrowRight className="w-4 h-4" /> Sincronizar e Abrir no Terminal
                </button>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all"
                >
                  <Upload className="w-3.5 h-3.5" /> Selecionar Imagem Mais Nítida
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
