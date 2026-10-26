import React, { useRef, useEffect, useState } from 'react';
import { EquityPoint } from '../types';

interface EquityCurveChartProps {
  equityPoints: EquityPoint[];
  initialCapital: number;
  height?: number;
}

export const EquityCurveChart: React.FC<EquityCurveChartProps> = ({
  equityPoints,
  initialCapital,
  height = 280,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || equityPoints.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const padding = { top: 25, right: 60, bottom: 30, left: 20 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const balances = equityPoints.map((p) => p.balance);
    const minVal = Math.min(initialCapital * 0.85, ...balances);
    const maxVal = Math.max(initialCapital * 1.15, ...balances);
    const range = Math.max(maxVal - minVal, 10);

    const getX = (idx: number) => {
      if (equityPoints.length <= 1) return padding.left + chartW / 2;
      return padding.left + (idx / (equityPoints.length - 1)) * chartW;
    };

    const getY = (val: number) => {
      return padding.top + chartH - ((val - minVal) / range) * chartH;
    };

    // 1. Gridlines & Y-Axis Labels
    const numGridLines = 4;
    ctx.font = '10px monospace';
    ctx.fillStyle = 'rgba(167, 139, 250, 0.4)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    for (let i = 0; i <= numGridLines; i++) {
      const lineVal = minVal + (i / numGridLines) * range;
      const y = getY(lineVal);

      ctx.beginPath();
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.1)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillText(`$${lineVal.toFixed(0)}`, width - padding.right + 8, y);
    }

    // 2. Initial Capital Baseline
    const baseY = getY(initialCapital);
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.moveTo(padding.left, baseY);
    ctx.lineTo(width - padding.right, baseY);
    ctx.stroke();
    ctx.setLineDash([]);

    // 3. Area Fill under Equity Curve
    const isProfitable = equityPoints[equityPoints.length - 1].balance >= initialCapital;
    const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
    if (isProfitable) {
      gradient.addColorStop(0, 'rgba(16, 185, 129, 0.28)');
      gradient.addColorStop(0.7, 'rgba(139, 92, 246, 0.12)');
      gradient.addColorStop(1, 'rgba(139, 92, 246, 0.0)');
    } else {
      gradient.addColorStop(0, 'rgba(244, 63, 94, 0.28)');
      gradient.addColorStop(0.7, 'rgba(139, 92, 246, 0.12)');
      gradient.addColorStop(1, 'rgba(139, 92, 246, 0.0)');
    }

    ctx.beginPath();
    ctx.moveTo(getX(0), baseY);
    for (let i = 0; i < equityPoints.length; i++) {
      ctx.lineTo(getX(i), getY(equityPoints[i].balance));
    }
    ctx.lineTo(getX(equityPoints.length - 1), baseY);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // 4. Draw Main Equity Curve
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(equityPoints[0].balance));
    for (let i = 1; i < equityPoints.length; i++) {
      ctx.lineTo(getX(i), getY(equityPoints[i].balance));
    }
    ctx.strokeStyle = isProfitable ? '#10b981' : '#f43f5e';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = isProfitable ? 'rgba(16, 185, 129, 0.6)' : 'rgba(244, 63, 94, 0.6)';
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 5. Draw trade dots for wins & losses
    equityPoints.forEach((p, idx) => {
      if (idx === 0) return;
      const x = getX(idx);
      const y = getY(p.balance);

      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = p.result === 'WIN' ? '#34d399' : p.result === 'LOSS' ? '#fb7185' : '#a78bfa';
      ctx.fill();
    });

    // 6. Draw hover indicator if mouse is over
    if (hoverIndex !== null && equityPoints[hoverIndex]) {
      const hp = equityPoints[hoverIndex];
      const hx = getX(hoverIndex);
      const hy = getY(hp.balance);

      // Vertical guide line
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.moveTo(hx, padding.top);
      ctx.lineTo(hx, height - padding.bottom);
      ctx.stroke();
      ctx.setLineDash([]);

      // Outer focus ring
      ctx.beginPath();
      ctx.arc(hx, hy, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }, [equityPoints, initialCapital, height, hoverIndex]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || equityPoints.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const paddingLeft = 20;
    const paddingRight = 60;
    const chartW = rect.width - paddingLeft - paddingRight;

    const relativeX = Math.max(0, Math.min(x - paddingLeft, chartW));
    const ratio = chartW > 0 ? relativeX / chartW : 0;
    const index = Math.round(ratio * (equityPoints.length - 1));

    if (index >= 0 && index < equityPoints.length) {
      setHoverIndex(index);
      setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
    setTooltipPos(null);
  };

  const activePoint = hoverIndex !== null ? equityPoints[hoverIndex] : null;

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-2xl bg-black/40 border border-violet-500/20 p-2 overflow-hidden select-none"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <canvas ref={canvasRef} className="block w-full cursor-crosshair" />

      {/* Interactive Tooltip Card */}
      {activePoint && tooltipPos && (
        <div
          className="absolute z-20 pointer-events-none transform -translate-x-1/2 -translate-y-full -top-2 bg-[#190f38]/95 border border-violet-500/40 backdrop-blur-md rounded-xl p-2.5 shadow-2xl text-[11px] min-w-[170px]"
          style={{
            left: `${Math.max(90, Math.min(tooltipPos.x, (containerRef.current?.clientWidth || 300) - 90))}px`,
            top: `${Math.max(10, tooltipPos.y - 12)}px`,
          }}
        >
          <div className="flex items-center justify-between border-b border-violet-500/20 pb-1 mb-1.5 font-bold">
            <span className="text-violet-200">
              {activePoint.tradeNum === 0 ? 'Início do Teste' : `Operação #${activePoint.tradeNum}`}
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-black ${
                activePoint.result === 'WIN'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : activePoint.result === 'LOSS'
                  ? 'bg-rose-500/20 text-rose-300'
                  : 'bg-violet-500/20 text-violet-300'
              }`}
            >
              {activePoint.result}
            </span>
          </div>

          <div className="space-y-1 font-mono">
            <div className="flex justify-between">
              <span className="text-violet-400">Saldo:</span>
              <span className="font-bold text-white">${activePoint.balance.toFixed(2)}</span>
            </div>
            {activePoint.tradeNum > 0 && (
              <div className="flex justify-between">
                <span className="text-violet-400">Resultado:</span>
                <span className={`font-bold ${activePoint.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {activePoint.pnl >= 0 ? `+$${activePoint.pnl.toFixed(2)}` : `-$${Math.abs(activePoint.pnl).toFixed(2)}`}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-violet-400">Drawdown:</span>
              <span className="font-bold text-amber-300">
                ${activePoint.drawdown.toFixed(2)} ({activePoint.drawdownPct.toFixed(1)}%)
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
