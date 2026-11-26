import React from 'react';
import { getSpecForTonnage, parseJigDimensions } from '../utils/dispatchEngine';
import { TonnageClass } from '../types/dispatch';

interface CargoBedVisualizerProps {
  tonnage: TonnageClass;
  pltCount: number;
  jigSpec: string;
  jigQty?: number;
  totalWeightKg: number;
}

export const CargoBedVisualizer: React.FC<CargoBedVisualizerProps> = ({
  tonnage,
  pltCount,
  jigSpec,
  jigQty = 1,
  totalWeightKg,
}) => {
  const spec = getSpecForTonnage(tonnage);
  const jig = parseJigDimensions(jigSpec);
  const effectiveJigQty = jig ? Math.max(1, jigQty) : 0;

  // SVG viewport in mm coordinates scaled cleanly
  const padX = 280;
  const padY = 260;
  const bedL = spec.innerLengthMm;
  const bedW = spec.innerWidthMm;
  const svgW = bedL + padX * 2;
  const svgH = bedW + padY * 2;

  // Compute placement rectangles inside [0..bedL, 0..bedW]
  const margin = 60;
  let cursorX = margin;
  const placedJigs: Array<{ x: number; y: number; w: number; h: number; label: string; overflow: boolean }> = [];
  const placedPlts: Array<{ x: number; y: number; w: number; h: number; idx: number; overflow: boolean }> = [];

  if (jig) {
    for (let i = 0; i < effectiveJigQty; i++) {
      const yPos = Math.max(20, (bedW - jig.width) / 2);
      const overflow = cursorX + jig.length > bedL || jig.width > bedW;
      placedJigs.push({
        x: cursorX,
        y: yPos,
        w: jig.length,
        h: jig.width,
        label: `지그 ${i + 1} (${jig.length}×${jig.width})`,
        overflow,
      });
      cursorX += jig.length + 80;
    }
  }

  const pltSize = 1100;
  const canTwoRows = bedW >= 2250; // 2 * 1100 = 2200mm
  if (pltCount > 0) {
    if (canTwoRows) {
      const rowGap = 60;
      const topY = (bedW - (pltSize * 2 + rowGap)) / 2;
      for (let i = 0; i < pltCount; i++) {
        const col = Math.floor(i / 2);
        const row = i % 2;
        const x = cursorX + col * (pltSize + 50);
        const y = topY + row * (pltSize + rowGap);
        const overflow = x + pltSize > bedL;
        placedPlts.push({ x, y, w: pltSize, h: pltSize, idx: i + 1, overflow });
      }
    } else {
      const centerY = (bedW - pltSize) / 2;
      for (let i = 0; i < pltCount; i++) {
        const x = cursorX + i * (pltSize + 50);
        const overflow = x + pltSize > bedL || pltSize > bedW;
        placedPlts.push({ x, y: centerY, w: pltSize, h: pltSize, idx: i + 1, overflow });
      }
    }
  }

  const hasDimensionOverflow =
    placedJigs.some((j) => j.overflow) || placedPlts.some((p) => p.overflow);
  const hasWeightOverflow = totalWeightKg > spec.maxWeightKg;
  const weightPct = Math.min(100, Math.round((totalWeightKg / spec.maxWeightKg) * 100));

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">
            적재함 평면 배치 시뮬레이터 · {spec.tonnage}
          </h4>
          <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
            내경 {spec.bedLabel} mm · 배열 {spec.arrangement} · 허용 {spec.weightLabel}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs tabular-nums">
          <span className={hasDimensionOverflow ? 'font-semibold text-red-600' : 'font-medium text-emerald-700'}>
            {hasDimensionOverflow ? '규격 초과' : '치수 적재 가능'}
          </span>
          <span className="text-slate-300" aria-hidden="true">|</span>
          <span className={hasWeightOverflow ? 'font-semibold text-red-600' : 'font-medium text-slate-700'}>
            중량 {totalWeightKg.toLocaleString()} / {spec.maxWeightKg.toLocaleString()} kg ({weightPct}%)
          </span>
        </div>
      </div>

      {/* Top-down SVG Cargo Bed */}
      <div className="mt-3 rounded border border-slate-200 bg-slate-50/70 p-2 overflow-x-auto">
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="w-full h-auto max-h-[200px] min-w-[420px]"
          role="img"
          aria-label={`${spec.tonnage} 적재함 평면 배치도`}
        >
          {/* Cab direction indicator on left */}
          <rect
            x={padX - 180}
            y={padY + 120}
            width={150}
            height={bedW - 240}
            rx={40}
            fill="#e2e8f0"
            stroke="#94a3b8"
            strokeWidth={14}
          />
          <text
            x={padX - 105}
            y={padY + bedW / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={120}
            fontWeight={600}
            fill="#475569"
            transform={`rotate(-90 ${padX - 105} ${padY + bedW / 2})`}
          >
            운전석
          </text>

          {/* Truck Bed Outline */}
          <rect
            x={padX}
            y={padY}
            width={bedL}
            height={bedW}
            fill="#ffffff"
            stroke={hasDimensionOverflow ? '#dc2626' : '#1e3a8a'}
            strokeWidth={22}
          />

          {/* Centerline */}
          <line
            x1={padX}
            y1={padY + bedW / 2}
            x2={padX + bedL}
            y2={padY + bedW / 2}
            stroke="#e2e8f0"
            strokeWidth={10}
            strokeDasharray="60 60"
          />

          {/* Dimension labels */}
          <text
            x={padX + bedL / 2}
            y={padY - 70}
            textAnchor="middle"
            fontSize={135}
            fontFamily="JetBrains Mono, monospace"
            fill="#475569"
          >
            L {bedL.toLocaleString()} mm
          </text>
          <text
            x={padX + bedL + 110}
            y={padY + bedW / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={135}
            fontFamily="JetBrains Mono, monospace"
            fill="#475569"
            transform={`rotate(90 ${padX + bedL + 110} ${padY + bedW / 2})`}
          >
            W {bedW.toLocaleString()} mm
          </text>

          {/* Placed Jigs */}
          {placedJigs.map((j, idx) => (
            <g key={`jig-${idx}`}>
              <rect
                x={padX + j.x}
                y={padY + j.y}
                width={j.w}
                height={j.h}
                rx={24}
                fill={j.overflow ? 'rgba(220, 38, 38, 0.16)' : 'rgba(217, 119, 6, 0.18)'}
                stroke={j.overflow ? '#dc2626' : '#d97706'}
                strokeWidth={18}
              />
              <text
                x={padX + j.x + j.w / 2}
                y={padY + j.y + j.h / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={130}
                fontWeight={600}
                fill={j.overflow ? '#991b1b' : '#92400e'}
              >
                {j.label}
              </text>
            </g>
          ))}

          {/* Placed 1100x1100 PLTs */}
          {placedPlts.map((p) => (
            <g key={`plt-${p.idx}`}>
              <rect
                x={padX + p.x}
                y={padY + p.y}
                width={p.w}
                height={p.h}
                rx={20}
                fill={p.overflow ? 'rgba(220, 38, 38, 0.16)' : 'rgba(30, 58, 138, 0.12)'}
                stroke={p.overflow ? '#dc2626' : '#1e3a8a'}
                strokeWidth={16}
              />
              <text
                x={padX + p.x + p.w / 2}
                y={padY + p.y + p.h / 2 - 60}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={130}
                fontWeight={700}
                fill={p.overflow ? '#991b1b' : '#1e3a8a'}
              >
                PLT {p.idx}
              </text>
              <text
                x={padX + p.x + p.w / 2}
                y={padY + p.y + p.h / 2 + 100}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={100}
                fontFamily="JetBrains Mono, monospace"
                fill={p.overflow ? '#991b1b' : '#475569'}
              >
                1100×1100
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* Weight Load Progress Bar */}
      <div className="mt-3">
        <div className="h-2 w-full rounded bg-slate-100 overflow-hidden">
          <div
            className={`h-full transition-all duration-200 ${
              hasWeightOverflow ? 'bg-red-600' : weightPct > 85 ? 'bg-amber-500' : 'bg-blue-800'
            }`}
            style={{ width: `${weightPct}%` }}
          />
        </div>
      </div>
    </div>
  );
};
