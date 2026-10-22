import React, { useState, useRef } from 'react';
import { Candle } from '../types';
import { detectCandlesFromImage } from '../services/marketApi';
import { X, Camera, Upload, Monitor, CheckCircle2 } from 'lucide-react';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCandlesDetected: (candles: Candle[]) => void;
}

export const CameraModal: React.FC<CameraModalProps> = ({ isOpen, onClose, onCandlesDetected }) => {
  const [videoActive, setVideoActive] = useState(false);
  const [detectedCount, setDetectedCount] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setVideoActive(false);
  };

  const handleClose = () => {
    stopStream();
    onClose();
  };

  const handleStartCamera = async () => {
    try {
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
    } catch (err: any) {
      alert(`Não foi possível acessar a câmera: ${err.message}`);
    }
  };

  const handleStartScreen = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 5 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setVideoActive(true);
    } catch (err: any) {
      alert(`Captura de tela cancelada: ${err.message}`);
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
    const parsedCandles = detectCandlesFromImage(canvas);

    if (parsedCandles.length >= 6) {
      setDetectedCount(parsedCandles.length);
      onCandlesDetected(parsedCandles);
      setTimeout(() => {
        handleClose();
      }, 1200);
    } else {
      alert('Poucos candles identificados no enquadramento. Aponte diretamente para o gráfico com boa iluminação.');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(img, 0, 0);
        const parsedCandles = detectCandlesFromImage(canvas);
        if (parsedCandles.length >= 5) {
          setDetectedCount(parsedCandles.length);
          onCandlesDetected(parsedCandles);
          setTimeout(() => {
            handleClose();
          }, 1200);
        } else {
          alert('Não foi possível identificar os candles na imagem. Certifique-se de que o print mostra o gráfico com nitidez.');
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#150d2f] border border-violet-500/30 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative">
        <button onClick={handleClose} className="absolute top-4 right-4 text-violet-400 hover:text-white p-1">
          <X className="w-4 h-4" />
        </button>

        <div className="space-y-1">
          <h3 className="font-extrabold text-sm text-white uppercase tracking-wide">
            Leitura Visual de Gráficos (OCR / Visão Computacional)
          </h3>
          <p className="text-xs text-violet-300/80">
            Envie uma captura de tela da corretora ou TradingView para extrair os candles e calcular a probabilidade.
          </p>
        </div>

        {/* Video or Upload Viewport */}
        <div className="relative aspect-video bg-black/70 rounded-xl overflow-hidden border border-violet-500/30 flex items-center justify-center">
          <video
            ref={videoRef}
            playsInline
            muted
            className={`w-full h-full object-contain ${videoActive ? 'block' : 'hidden'}`}
          />

          {!videoActive && (
            <div className="text-center p-6 space-y-3">
              <Camera className="w-10 h-10 text-violet-400/50 mx-auto" />
              <p className="text-xs text-violet-300/60 max-w-xs">
                Escolha uma das opções abaixo para ler os candles via visão computacional:
              </p>
            </div>
          )}

          {detectedCount !== null && (
            <div className="absolute inset-0 bg-violet-950/90 flex flex-col items-center justify-center text-center p-4 animate-fadeIn">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-2" />
              <span className="font-bold text-white text-sm">
                {detectedCount} Velas Detectadas com Sucesso!
              </span>
              <span className="text-xs text-violet-300">Carregando no terminal analítico...</span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />

          {!videoActive ? (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md hover:opacity-95"
              >
                <Upload className="w-3.5 h-3.5" /> Enviar Print do Gráfico
              </button>
              <button
                onClick={handleStartCamera}
                className="py-2 px-3 rounded-xl bg-white/5 border border-violet-500/20 text-violet-200 hover:bg-white/10 font-bold text-xs flex items-center justify-center gap-1.5"
              >
                <Camera className="w-3.5 h-3.5" /> Câmera
              </button>
              <button
                onClick={handleStartScreen}
                className="py-2 px-3 rounded-xl bg-white/5 border border-violet-500/20 text-violet-200 hover:bg-white/10 font-bold text-xs flex items-center justify-center gap-1.5"
              >
                <Monitor className="w-3.5 h-3.5" /> Gravar Tela
              </button>
            </>
          ) : (
            <button
              onClick={handleCaptureFrame}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg hover:opacity-95"
            >
              <Camera className="w-4 h-4" /> Capturar Gráfico Agora
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
