import React, { useState } from 'react';
import { SOP_STEPS, TONNAGE_ORDER, VEHICLE_SPECS } from '../data/standards';
import { LoadingMethod, TonnageClass } from '../types/dispatch';
import { calculateRecommendedTonnage } from '../utils/dispatchEngine';
import { CargoBedVisualizer } from './CargoBedVisualizer';

export const StandardCriteriaView: React.FC = () => {
  const [simPlt, setSimPlt] = useState(2);
  const [simHasJig, setSimHasJig] = useState(true);
  const [simJigL, setSimJigL] = useState(1800);
  const [simJigW, setSimJigW] = useState(1200);
  const [simWeight, setSimWeight] = useState(1050);
  const [simMethod, setSimMethod] = useState<LoadingMethod>('지게차');
  const [previewTonnage, setPreviewTonnage] = useState<TonnageClass>('3.5톤');

  const jigSpec = simHasJig ? `${simJigL}×${simJigW}×1500` : '-';
  const rec = calculateRecommendedTonnage(simPlt, jigSpec, simWeight, simMethod, '', 1);

  return (
    <div className="space-y-8">
      {/* 1. Standard Loading Table */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 bg-[#1e3a8a] text-white">
          <h2 className="text-sm font-bold">
            1. 차량 톤수별 표준 적재 기준표 (1100×1100 표준 파렛트 및 지그·설비)
          </h2>
        </div>
        {/* Mobile Cards (< md) */}
        <div className="md:hidden divide-y divide-slate-200">
          {VEHICLE_SPECS.map((spec) => (
            <div
              key={`m-spec-${spec.tonnage}`}
              onClick={() => setPreviewTonnage(spec.tonnage)}
              className={`p-4 space-y-2 text-xs ${
                previewTonnage === spec.tonnage ? 'bg-blue-50/60' : 'bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900">{spec.tonnage}</span>
                <span className="font-bold text-blue-900">{spec.maxPltLabel}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-600 tabular-nums bg-slate-50 rounded p-2">
                <div>
                  <span className="block text-slate-400">내경 (mm)</span>
                  <span className="font-mono-tabular font-medium text-slate-800">{spec.bedLabel}</span>
                </div>
                <div>
                  <span className="block text-slate-400">배열</span>
                  <span className="font-mono-tabular font-medium text-slate-800">{spec.arrangement}</span>
                </div>
                <div className="text-right">
                  <span className="block text-slate-400">허용 중량</span>
                  <span className="font-mono-tabular font-medium text-slate-800">{spec.weightLabel}</span>
                </div>
              </div>
              <div className="text-slate-800 leading-relaxed">
                <span className="font-semibold text-slate-900">지그·설비:</span> {spec.jigCriteria}
              </div>
              <div className="text-slate-600 leading-relaxed">
                <span className="font-semibold text-slate-800">차종 원칙:</span> {spec.bodyPrinciple}
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Table (>= md) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-800 border-b border-slate-200">
                <th className="py-3 px-4 font-bold text-center whitespace-nowrap">차량 톤수</th>
                <th className="py-3 px-4 font-bold text-center whitespace-nowrap">적재함 내경 (장×폭 mm)</th>
                <th className="py-3 px-4 font-bold text-center whitespace-nowrap">1100×1100 PLT 최대 적재 수량</th>
                <th className="py-3 px-4 font-bold text-center whitespace-nowrap">배열 방식</th>
                <th className="py-3 px-4 font-bold text-center whitespace-nowrap">권장 허용 중량</th>
                <th className="py-3 px-4 font-bold whitespace-nowrap">용접지그·설비 적재 기준</th>
                <th className="py-3 px-4 font-bold whitespace-nowrap">차종 선택 원칙 (카고 vs 윙바디)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {VEHICLE_SPECS.map((spec) => (
                <tr
                  key={spec.tonnage}
                  onClick={() => setPreviewTonnage(spec.tonnage)}
                  className={`cursor-pointer transition-colors ${
                    previewTonnage === spec.tonnage ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                  }`}
                >
                  <td className="py-3 px-4 text-center font-bold text-slate-900 whitespace-nowrap">
                    {spec.tonnage}
                  </td>
                  <td className="py-3 px-4 text-center font-mono-tabular text-slate-700 whitespace-nowrap">
                    {spec.bedLabel}
                  </td>
                  <td className="py-3 px-4 text-center font-bold text-blue-900 whitespace-nowrap">
                    {spec.maxPltLabel}
                  </td>
                  <td className="py-3 px-4 text-center font-mono-tabular text-slate-700 whitespace-nowrap">
                    {spec.arrangement}
                  </td>
                  <td className="py-3 px-4 text-center font-mono-tabular text-slate-700 whitespace-nowrap">
                    {spec.weightLabel}
                  </td>
                  <td className="py-3 px-4 text-slate-800">{spec.jigCriteria}</td>
                  <td className="py-3 px-4 text-slate-700">{spec.bodyPrinciple}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Interactive Load Simulator */}
      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              표준 적재 기준 실시간 시뮬레이터
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              요청 전 PLT 수량, 지그 치수, 중량을 입력하여 적정 톤수와 2D 적재함 배치를 미리 확인하세요.
            </p>
          </div>
          <div className="text-xs font-semibold text-blue-900 bg-blue-50 border border-blue-200 rounded-md px-3 py-1.5">
            자동 산출 권장: {rec.recommendedTonnage} ({rec.suggestedBodyType})
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-4">
          <div className="lg:col-span-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  1100×1100 PLT 수량 (매)
                </label>
                <input
                  type="number"
                  min={0}
                  max={16}
                  value={simPlt}
                  onChange={(e) => setSimPlt(Number(e.target.value))}
                  className="w-full h-9 px-3 text-xs font-mono-tabular text-right rounded-md border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">총 중량 (kg)</label>
                <input
                  type="number"
                  min={0}
                  step={50}
                  value={simWeight}
                  onChange={(e) => setSimWeight(Number(e.target.value))}
                  className="w-full h-9 px-3 text-xs font-mono-tabular text-right rounded-md border border-slate-300"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 items-center">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">상·하차 방식</label>
                <select
                  value={simMethod}
                  onChange={(e) => setSimMethod(e.target.value as LoadingMethod)}
                  className="w-full h-9 px-2.5 text-xs rounded-md border border-slate-300 bg-white"
                >
                  <option value="지게차">지게차</option>
                  <option value="호이스트">호이스트</option>
                  <option value="크레인">크레인</option>
                </select>
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 pt-5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={simHasJig}
                  onChange={(e) => setSimHasJig(e.target.checked)}
                  className="rounded border-slate-300 text-blue-900"
                />
                용접지그·설비 포함
              </label>
            </div>

            {simHasJig && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">지그 길이 (mm)</label>
                  <input
                    type="number"
                    min={500}
                    step={100}
                    value={simJigL}
                    onChange={(e) => setSimJigL(Number(e.target.value))}
                    className="w-full h-9 px-3 text-xs font-mono-tabular text-right rounded-md border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">지그 폭 (mm)</label>
                  <input
                    type="number"
                    min={500}
                    step={50}
                    value={simJigW}
                    onChange={(e) => setSimJigW(Number(e.target.value))}
                    className="w-full h-9 px-3 text-xs font-mono-tabular text-right rounded-md border border-slate-300"
                  />
                </div>
              </div>
            )}

            <div className="rounded-md bg-slate-50 border border-slate-200 p-3 text-xs text-slate-700 space-y-1">
              <div className="font-semibold text-slate-900">판정 사유</div>
              <p>{rec.reason}</p>
              <p className="text-slate-500">{rec.bodyReason}</p>
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-700 mb-1.5">
                시뮬레이션 비교 차량 선택
              </span>
              <div className="flex flex-wrap gap-1.5">
                {TONNAGE_ORDER.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setPreviewTonnage(t)}
                    className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors ${
                      previewTonnage === t
                        ? 'bg-blue-900 text-white border-blue-900'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {t}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPreviewTonnage(rec.recommendedTonnage)}
                  className="px-3 py-1.5 text-xs font-semibold rounded border border-blue-200 bg-blue-50 text-blue-900 hover:bg-blue-100"
                >
                  권장({rec.recommendedTonnage}) 적용
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7">
            <CargoBedVisualizer
              tonnage={previewTonnage}
              pltCount={simPlt}
              jigSpec={jigSpec}
              totalWeightKg={simWeight}
            />
          </div>
        </div>
      </section>

      {/* 2. Dual KakaoTalk & Daily Batch Dispatch SOP */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 bg-[#1e3a8a] text-white">
          <h2 className="text-sm font-bold">2. 단톡방 이원화 및 일일 일괄 배차 프로세스 (SOP)</h2>
        </div>
        {/* Mobile Cards (< md) */}
        <div className="md:hidden divide-y divide-slate-200">
          {SOP_STEPS.map((step) => (
            <div key={`m-sop-${step.stepNumber}`} className="p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-slate-900">{step.title}</span>
                <span className="font-mono-tabular font-medium text-blue-900 whitespace-nowrap">
                  {step.timeWindow}
                </span>
              </div>
              <div className="text-slate-800 font-medium">{step.channelOwner}</div>
              <p className="text-slate-700 leading-relaxed">{step.coreAction}</p>
              <div className="bg-slate-50 border border-slate-200/80 rounded px-2.5 py-2 text-slate-800 leading-relaxed">
                <span className="font-semibold text-slate-900">차단 포인트:</span> {step.blockPoint}
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Table (>= md) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-800 border-b border-slate-200">
                <th className="py-3 px-4 font-bold whitespace-nowrap">단계</th>
                <th className="py-3 px-4 font-bold text-center whitespace-nowrap">운영 시간</th>
                <th className="py-3 px-4 font-bold whitespace-nowrap">채널 / 담당자</th>
                <th className="py-3 px-4 font-bold">핵심 수행 내용</th>
                <th className="py-3 px-4 font-bold">중복·과다 톤수 차단 포인트</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {SOP_STEPS.map((step) => (
                <tr key={step.stepNumber} className="hover:bg-slate-50">
                  <td className="py-3.5 px-4 font-bold text-slate-900 whitespace-nowrap">
                    {step.title}
                  </td>
                  <td className="py-3.5 px-4 text-center font-mono-tabular font-medium text-slate-700 whitespace-nowrap">
                    {step.timeWindow}
                  </td>
                  <td className="py-3.5 px-4 text-slate-800 font-medium">{step.channelOwner}</td>
                  <td className="py-3.5 px-4 text-slate-700 leading-relaxed">{step.coreAction}</td>
                  <td className="py-3.5 px-4 text-slate-800 leading-relaxed">{step.blockPoint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
