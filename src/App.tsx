/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Download, Plus, RotateCcw } from 'lucide-react';
import { DispatchLedgerTable } from './components/DispatchLedgerTable';
import { DispatchRequestModal } from './components/DispatchRequestModal';
import { KakaoAndBatchView } from './components/KakaoAndBatchView';
import { StandardCriteriaView } from './components/StandardCriteriaView';
import { INITIAL_DISPATCHES, TONNAGE_ORDER } from './data/standards';
import { DispatchEntry } from './types/dispatch';
import {
  calculateRecommendedTonnage,
  detectRouteOverlaps,
  exportDispatchesToCsv,
  formatConsolidatedTonnage,
  renumberDispatchesByMonth,
} from './utils/dispatchEngine';

type ActiveView = 'ledger' | 'standards' | 'kakao_batch';

const STORAGE_KEY = 'advanced_eng_freight_ledger_v1';

function getCurrentSopPhase(): { stage: string; timeInfo: string } {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  if (mins < 15 * 60) {
    const rem = 15 * 60 - mins;
    const h = Math.floor(rem / 60);
    const m = rem % 60;
    return {
      stage: '1단계: 요청 접수 중',
      timeInfo: `15:00 마감까지 ${h}시간 ${m}분`,
    };
  }
  if (mins < 16 * 60) {
    return { stage: '2단계: 취합·검증', timeInfo: '15:00 ~ 16:00 검증 구간' };
  }
  if (mins < 16 * 60 + 30) {
    return { stage: '3단계: 일괄 발주', timeInfo: '16:00 ~ 16:30 발주 구간' };
  }
  return { stage: '4단계: 긴급 예외 구간', timeInfo: '16:30 이후 (파트장/팀장 승인)' };
}

export default function App() {
  const [entries, setEntries] = useState<DispatchEntry[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return renumberDispatchesByMonth(parsed);
        }
      }
    } catch {
      // Ignore storage error
    }
    return renumberDispatchesByMonth(INITIAL_DISPATCHES);
  });

  const [activeView, setActiveView] = useState<ActiveView>('ledger');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<DispatchEntry | null>(null);
  const [selectedEntryForKakao, setSelectedEntryForKakao] = useState<DispatchEntry | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [sopPhase, setSopPhase] = useState(getCurrentSopPhase);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // Ignore quota errors
    }
  }, [entries]);

  useEffect(() => {
    const timer = setInterval(() => setSopPhase(getCurrentSopPhase()), 60000);
    return () => clearInterval(timer);
  }, []);

  const overlapMap = useMemo(() => detectRouteOverlaps(entries), [entries]);

  const summary = useMemo(() => {
    let downsizedCount = 0;
    let consolidatedCount = 0;
    let overlapWarningCount = 0;
    let pendingCount = 0;

    for (const entry of entries) {
      const rec = calculateRecommendedTonnage(
        entry.pltCount,
        entry.jigSpec,
        entry.totalWeightKg,
        entry.loadingMethod,
        entry.itemName,
        entry.jigQty ?? 1
      );
      const reqIdx = TONNAGE_ORDER.indexOf(entry.requestedTonnage as (typeof TONNAGE_ORDER)[number]);
      const recIdx = TONNAGE_ORDER.indexOf(rec.recommendedTonnage);

      if (entry.confirmedTonnage.startsWith('합차')) {
        consolidatedCount += 1;
      } else if (
        reqIdx !== -1 &&
        reqIdx > recIdx &&
        entry.confirmedTonnage !== '검증대기' &&
        !entry.confirmedTonnage.startsWith(entry.requestedTonnage)
      ) {
        downsizedCount += 1;
      }

      if (entry.confirmedTonnage === '검증대기') {
        pendingCount += 1;
      }

      const ov = overlapMap[entry.id];
      if (ov && (ov.status === '합차권장' || ov.status === '중복주의')) {
        overlapWarningCount += 1;
      }
    }

    return {
      total: entries.length,
      downsizedCount,
      consolidatedCount,
      overlapWarningCount,
      pendingCount,
    };
  }, [entries, overlapMap]);

  const handleSaveEntry = (data: Omit<DispatchEntry, 'id' | 'no'>, existingId?: string) => {
    if (existingId) {
      setEntries((prev) =>
        renumberDispatchesByMonth(
          prev.map((item) => (item.id === existingId ? { ...item, ...data } : item))
        )
      );
    } else {
      setEntries((prev) => {
        const newEntry: DispatchEntry = {
          id: `disp-${Date.now()}`,
          no: prev.length + 1,
          ...data,
        };
        return renumberDispatchesByMonth([...prev, newEntry]);
      });
    }
    setEditingEntry(null);
  };

  const handleDeleteEntry = (id: string) => {
    setEntries((prev) => renumberDispatchesByMonth(prev.filter((item) => item.id !== id)));
  };

  const handleUpdateConfirmedTonnage = (id: string, confirmed: string, noteAppend?: string) => {
    setEntries((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const nextNotes = noteAppend
          ? item.notes
            ? `${item.notes} / ${noteAppend}`
            : noteAppend
          : item.notes;
        return {
          ...item,
          confirmedTonnage: confirmed,
          notes: nextNotes,
        };
      })
    );
  };

  const handleConsolidate = (id: string, anchorEntry: DispatchEntry, combinedNote: string) => {
    setEntries((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        return {
          ...item,
          confirmedTonnage: formatConsolidatedTonnage(item, anchorEntry),
          notes: combinedNote,
        };
      })
    );
  };

  const handleResetSamples = () => {
    setEntries(renumberDispatchesByMonth(INITIAL_DISPATCHES));
    setConfirmReset(false);
  };

  const handleOpenNewModal = () => {
    setEditingEntry(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (entry: DispatchEntry) => {
    setEditingEntry(entry);
    setIsModalOpen(true);
  };

  const handleOpenKakaoCopy = (entry: DispatchEntry) => {
    setSelectedEntryForKakao(entry);
    setActiveView('kakao_batch');
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* 3-Zone Top Navigation Bar */}
      <header className="bg-white border-b border-slate-200 md:sticky md:top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between gap-4 md:gap-8 h-14 md:h-16">
            <a
              href="#top"
              onClick={(e) => {
                e.preventDefault();
                setActiveView('ledger');
              }}
              className="text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
            >
              선행기술팀 용차 배차 관리대장
            </a>

            <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
              <button
                type="button"
                onClick={() => setActiveView('ledger')}
                className={`py-5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  activeView === 'ledger'
                    ? 'border-blue-900 text-blue-950 font-semibold'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                배차 관리대장
              </button>
              <button
                type="button"
                onClick={() => setActiveView('standards')}
                className={`py-5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  activeView === 'standards'
                    ? 'border-blue-900 text-blue-950 font-semibold'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                표준 적재 기준·SOP
              </button>
              <button
                type="button"
                onClick={() => setActiveView('kakao_batch')}
                className={`py-5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  activeView === 'kakao_batch'
                    ? 'border-blue-900 text-blue-950 font-semibold'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                단톡방 양식·일괄발주
              </button>
            </nav>

            <div className="shrink-0">
              <button
                type="button"
                onClick={handleOpenNewModal}
                className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-[#1e3a8a] rounded-lg hover:bg-blue-900 transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">신규 배차 요청</span>
                <span className="sm:hidden">배차 요청</span>
              </button>
            </div>
          </div>

          {/* Mobile Secondary Navigation Row (< md) */}
          <nav className="md:hidden grid grid-cols-3 border-t border-slate-100 -mx-4 px-2 text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveView('ledger')}
              className={`py-2.5 text-center border-b-2 transition-colors whitespace-nowrap ${
                activeView === 'ledger'
                  ? 'border-blue-900 text-blue-950 font-semibold'
                  : 'border-transparent text-slate-600'
              }`}
            >
              배차 관리대장
            </button>
            <button
              type="button"
              onClick={() => setActiveView('standards')}
              className={`py-2.5 text-center border-b-2 transition-colors whitespace-nowrap ${
                activeView === 'standards'
                  ? 'border-blue-900 text-blue-950 font-semibold'
                  : 'border-transparent text-slate-600'
              }`}
            >
              적재 기준·SOP
            </button>
            <button
              type="button"
              onClick={() => setActiveView('kakao_batch')}
              className={`py-2.5 text-center border-b-2 transition-colors whitespace-nowrap ${
                activeView === 'kakao_batch'
                  ? 'border-blue-900 text-blue-950 font-semibold'
                  : 'border-transparent text-slate-600'
              }`}
            >
              양식·일괄발주
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content Container */}
      <main id="top" className="flex-1 max-w-[1600px] w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-5">
        {/* Operational Rules Strip & Utility Actions */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 bg-[#eef2ff] border border-blue-200/80 rounded-lg px-3.5 sm:px-4 py-3">
          <p className="text-xs text-slate-700 font-medium leading-relaxed">
            ※ 운영 기준: 익일 배차는 전일 <span className="font-bold text-slate-900">15:00</span>까지 [배차요청방] 취합 마감
            <span className="mx-2 text-slate-400" aria-hidden="true">|</span>
            1100×1100 PLT 및 지그 규격 필수 기재
            <span className="mx-2 text-slate-400" aria-hidden="true">|</span>
            동일 상·하차지 ±1일 중복 자동 감지 (4 PLT 이하 5톤 요청 금지)
          </p>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => exportDispatchesToCsv(entries, overlapMap)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              엑셀(CSV) 내보내기
            </button>

            {confirmReset ? (
              <div className="inline-flex items-center gap-1.5 bg-white border border-red-200 rounded px-2.5 py-1 text-xs">
                <span className="text-red-700 font-medium">초기화할까요?</span>
                <button
                  type="button"
                  onClick={handleResetSamples}
                  className="px-2 py-0.5 rounded bg-red-600 text-white font-semibold hover:bg-red-700"
                >
                  확인
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 hover:bg-slate-200"
                >
                  취소
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-slate-300 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                예시 대장 복원
              </button>
            )}
          </div>
        </div>

        {/* 4-Column Operational KPI Strip */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white border border-slate-200 rounded-lg p-3 sm:p-4">
            <div className="text-[11px] sm:text-xs font-medium text-slate-500">총 배차 관리 건수</div>
            <div className="mt-1 sm:mt-1.5 flex flex-wrap items-baseline justify-between gap-1">
              <span className="text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">
                {summary.total}건
              </span>
              <span className="text-[11px] sm:text-xs text-slate-500 tabular-nums">
                {summary.pendingCount > 0 ? `검증대기 ${summary.pendingCount}건` : '전건 검증 반영'}
              </span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-3 sm:p-4">
            <div className="text-[11px] sm:text-xs font-medium text-slate-500">적정 톤수 하향 절감</div>
            <div className="mt-1 sm:mt-1.5 flex flex-wrap items-baseline justify-between gap-1">
              <span className="text-xl sm:text-2xl font-bold text-blue-900 tabular-nums">
                {summary.downsizedCount}건
              </span>
              <span className="text-[11px] sm:text-xs text-slate-500">표준 적재 검증</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-3 sm:p-4">
            <div className="text-[11px] sm:text-xs font-medium text-slate-500">±1일 동일 노선 합차</div>
            <div className="mt-1 sm:mt-1.5 flex flex-wrap items-baseline justify-between gap-1">
              <span className="text-xl sm:text-2xl font-bold text-emerald-700 tabular-nums">
                합차 {summary.consolidatedCount}건
              </span>
              <span
                className={`text-[11px] sm:text-xs font-medium tabular-nums ${
                  summary.overlapWarningCount > 0 ? 'text-amber-700' : 'text-slate-500'
                }`}
              >
                {summary.overlapWarningCount > 0
                  ? `합차 검토 ${summary.overlapWarningCount}건`
                  : '중복 없음'}
              </span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-3 sm:p-4">
            <div className="text-[11px] sm:text-xs font-medium text-slate-500">일일 배차 SOP 구간</div>
            <div className="mt-1 sm:mt-1.5 flex flex-col sm:flex-row sm:items-baseline justify-between gap-0.5 sm:gap-2">
              <span className="text-sm sm:text-base font-bold text-slate-900 truncate">{sopPhase.stage}</span>
              <span className="text-[11px] sm:text-xs text-slate-500 tabular-nums whitespace-nowrap">
                {sopPhase.timeInfo}
              </span>
            </div>
          </div>
        </div>

        {/* Active View Content */}
        {activeView === 'ledger' && (
          <DispatchLedgerTable
            entries={entries}
            overlapMap={overlapMap}
            onEdit={handleOpenEditModal}
            onDelete={handleDeleteEntry}
            onUpdateConfirmedTonnage={handleUpdateConfirmedTonnage}
            onConsolidate={handleConsolidate}
            onOpenKakaoCopy={handleOpenKakaoCopy}
          />
        )}

        {activeView === 'standards' && <StandardCriteriaView />}

        {activeView === 'kakao_batch' && (
          <KakaoAndBatchView
            entries={entries}
            selectedEntryForKakao={selectedEntryForKakao}
          />
        )}
      </main>

      {/* Create / Edit & Live Load Verification Modal */}
      <DispatchRequestModal
        isOpen={isModalOpen}
        editingEntry={editingEntry}
        existingEntries={entries}
        onClose={() => {
          setIsModalOpen(false);
          setEditingEntry(null);
        }}
        onSave={handleSaveEntry}
      />
    </div>
  );
}
