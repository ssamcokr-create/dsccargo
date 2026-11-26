import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  CheckCircle2,
  Edit3,
  GitMerge,
  MessageSquare,
  Search,
  Trash2,
} from 'lucide-react';
import { TONNAGE_ORDER } from '../data/standards';
import { DispatchEntry, OverlapAnalysis } from '../types/dispatch';
import {
  calculateRecommendedTonnage,
  doesConsolidatedMatchAnchor,
  formatDispatchMonthLabel,
  formatMonthlyNo,
  formatShortTonnage,
  getCombinedLoadCheck,
  validateDispatchRequest,
} from '../utils/dispatchEngine';

interface DispatchLedgerTableProps {
  entries: DispatchEntry[];
  overlapMap: Record<string, OverlapAnalysis>;
  onEdit: (entry: DispatchEntry) => void;
  onDelete: (id: string) => void;
  onUpdateConfirmedTonnage: (id: string, confirmed: string, noteAppend?: string) => void;
  onConsolidate: (id: string, anchorEntry: DispatchEntry, combinedNote: string) => void;
  onOpenKakaoCopy: (entry: DispatchEntry) => void;
}

type FilterMode = 'all' | 'action_needed' | 'consolidated' | 'normal';

export const DispatchLedgerTable: React.FC<DispatchLedgerTableProps> = ({
  entries,
  overlapMap,
  onEdit,
  onDelete,
  onUpdateConfirmedTonnage,
  onConsolidate,
  onOpenKakaoCopy,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [originFilter, setOriginFilter] = useState('');
  const [destinationFilter, setDestinationFilter] = useState('');
  const [itemNameFilter, setItemNameFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('전체');
  const [statusFilter, setStatusFilter] = useState<FilterMode>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const enriched = useMemo(() => {
    return entries.map((entry) => {
      const { recommendation, issues } = validateDispatchRequest(entry);
      const overlap = overlapMap[entry.id] || { status: '정상', candidates: [] };
      const reqIdx = TONNAGE_ORDER.indexOf(entry.requestedTonnage as (typeof TONNAGE_ORDER)[number]);
      const recIdx = TONNAGE_ORDER.indexOf(recommendation.recommendedTonnage);
      const isOverRequested = reqIdx !== -1 && reqIdx > recIdx && !entry.confirmedTonnage.startsWith('합차');
      const needsReview =
        entry.confirmedTonnage === '검증대기' ||
        overlap.status === '합차권장' ||
        overlap.status === '중복주의' ||
        issues.some((i) => i.level === 'error');

      return {
        entry,
        recommendation,
        issues,
        overlap,
        isOverRequested,
        needsReview,
      };
    });
  }, [entries, overlapMap]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const oq = originFilter.trim().toLowerCase();
    const dq = destinationFilter.trim().toLowerCase();
    const iq = itemNameFilter.trim().toLowerCase();

    return enriched.filter(({ entry, overlap, needsReview }) => {
      if (categoryFilter !== '전체' && entry.itemCategory !== categoryFilter) {
        return false;
      }
      if (statusFilter === 'action_needed' && !needsReview) return false;
      if (statusFilter === 'consolidated' && !entry.confirmedTonnage.startsWith('합차')) return false;
      if (statusFilter === 'normal' && (needsReview || entry.confirmedTonnage.startsWith('합차'))) {
        return false;
      }
      if (oq && !entry.origin.toLowerCase().includes(oq)) return false;
      if (dq && !entry.destination.toLowerCase().includes(dq)) return false;
      if (iq && !entry.itemName.toLowerCase().includes(iq)) return false;
      if (!q) return true;
      const haystack = [
        entry.requester,
        entry.itemName,
        entry.origin,
        entry.waypoints,
        entry.destination,
        entry.notes,
        entry.loadingDate,
        entry.confirmedTonnage,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [
    enriched,
    searchQuery,
    originFilter,
    destinationFilter,
    itemNameFilter,
    categoryFilter,
    statusFilter,
  ]);

  const selectedItem = useMemo(
    () => enriched.find((item) => item.entry.id === selectedId) || null,
    [enriched, selectedId]
  );

  return (
    <div className="space-y-4">
      {/* Filter & Search Bar */}
      <div className="bg-white border border-slate-200 rounded-lg px-3.5 sm:px-4 py-3 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md overflow-x-auto max-w-full">
              {(
                [
                  { id: 'all', label: `전체 (${entries.length})` },
                  {
                    id: 'action_needed',
                    label: `검증·합차 필요 (${enriched.filter((x) => x.needsReview).length})`,
                  },
                  {
                    id: 'consolidated',
                    label: `합차완료 (${enriched.filter((x) => x.entry.confirmedTonnage.startsWith('합차')).length})`,
                  },
                  {
                    id: 'normal',
                    label: `정상 확정`,
                  },
                ] as Array<{ id: FilterMode; label: string }>
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    statusFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="품목구분 필터"
              className="h-9 sm:h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-800/20 focus:border-blue-800"
            >
              <option value="전체">품목구분: 전체</option>
              <option value="부품">부품</option>
              <option value="용접지그">용접지그</option>
              <option value="혼적">혼적</option>
              <option value="설비">설비</option>
              <option value="기타">기타</option>
            </select>
          </div>

          <div className="relative w-full lg:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="전체 통합 검색 (요청자, 경유지, 비고...)"
              className="w-full h-9 pl-9 pr-3 text-xs rounded-md border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-800/20 focus:border-blue-800"
            />
          </div>
        </div>

        {/* Instant Filter Inputs: 상차지 / 하차지 / 품목명 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-12 gap-2 pt-2.5 border-t border-slate-100">
          <div className="lg:col-span-3 relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={originFilter}
              onChange={(e) => setOriginFilter(e.target.value)}
              aria-label="상차지 즉시 필터"
              placeholder="상차지(출발지) 검색..."
              className="w-full h-8 pl-8 pr-2.5 text-xs rounded-md border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-800/20 focus:border-blue-800"
            />
          </div>
          <div className="lg:col-span-3 relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={destinationFilter}
              onChange={(e) => setDestinationFilter(e.target.value)}
              aria-label="하차지 즉시 필터"
              placeholder="하차지(도착지) 검색..."
              className="w-full h-8 pl-8 pr-2.5 text-xs rounded-md border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-800/20 focus:border-blue-800"
            />
          </div>
          <div className="lg:col-span-5 relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={itemNameFilter}
              onChange={(e) => setItemNameFilter(e.target.value)}
              aria-label="품목명 즉시 필터"
              placeholder="품목명(사용내역) 검색..."
              className="w-full h-8 pl-8 pr-2.5 text-xs rounded-md border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-800/20 focus:border-blue-800"
            />
          </div>
          <div className="lg:col-span-1 flex items-center justify-end">
            {(originFilter || destinationFilter || itemNameFilter || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setOriginFilter('');
                  setDestinationFilter('');
                  setItemNameFilter('');
                  setSearchQuery('');
                }}
                className="w-full h-8 px-2.5 text-xs font-medium rounded-md border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                초기화
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Stacked Ledger Cards (< md) */}
      <div className="md:hidden space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-lg py-10 px-4 text-center text-xs text-slate-500">
            조건에 해당하는 배차 내역이 없습니다. 검색어나 필터를 초기화해 보세요.
          </div>
        ) : (
          filtered.map(({ entry, recommendation, issues, overlap, isOverRequested }) => {
            const isSelected = selectedId === entry.id;
            const reqShort = formatShortTonnage(entry.requestedTonnage, entry.requestedBodyType);
            const recShort = formatShortTonnage(
              recommendation.recommendedTonnage,
              recommendation.suggestedBodyType
            );
            const isConsolidated = entry.confirmedTonnage.startsWith('합차');
            const hasError = issues.some((i) => i.level === 'error');

            const overlapTextStyle =
              overlap.status === '중복주의'
                ? 'bg-red-50 text-red-700 border-red-200'
                : overlap.status === '합차권장'
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : overlap.status === '합차완료'
                    ? 'bg-blue-50 text-blue-800 border-blue-200'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200';

            return (
              <div
                key={`mobile-${entry.id}`}
                onClick={() => setSelectedId(isSelected ? null : entry.id)}
                className={`bg-white border rounded-lg overflow-hidden transition-colors ${
                  isSelected ? 'border-blue-800 ring-1 ring-blue-800/20' : 'border-slate-200'
                }`}
              >
                {/* Card Top Header */}
                <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 bg-[#1e3a8a] text-white">
                  <div className="flex items-center gap-2 text-xs font-mono-tabular min-w-0">
                    <span className="font-bold">
                      {formatDispatchMonthLabel(entry)} · NO.{entry.no}
                    </span>
                    <span className="text-blue-200" aria-hidden="true">·</span>
                    <span className="font-semibold whitespace-nowrap">상차 {entry.loadingDate}</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 text-[11px] font-semibold rounded border whitespace-nowrap shrink-0 ${overlapTextStyle}`}
                  >
                    {overlap.status}
                  </span>
                </div>

                {/* Card Body */}
                <div className="p-3.5 space-y-3 text-xs">
                  {/* Requester & Item */}
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                      <span className="font-medium text-slate-800">{entry.requester}</span>
                      <span aria-hidden="true">·</span>
                      <span>{entry.itemCategory}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">요청 {entry.requestDate}</span>
                    </div>
                    <div className="mt-1 text-sm font-bold text-slate-900 leading-snug">
                      {entry.itemName}
                    </div>
                  </div>

                  {/* Route Line */}
                  <div className="bg-slate-50 border border-slate-200/80 rounded px-3 py-2 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="font-semibold text-slate-900">{entry.origin}</span>
                    <span className="text-slate-400">→</span>
                    {entry.waypoints && entry.waypoints !== '-' && (
                      <>
                        <span className="text-slate-600">(경유: {entry.waypoints})</span>
                        <span className="text-slate-400">→</span>
                      </>
                    )}
                    <span className="font-semibold text-slate-900">{entry.destination}</span>
                  </div>

                  {/* Load Specs Grid */}
                  <div className="grid grid-cols-3 gap-2 py-2 border-y border-slate-100 tabular-nums">
                    <div>
                      <div className="text-[11px] text-slate-500">PLT (1100각)</div>
                      <div className="font-mono-tabular font-semibold text-slate-900 mt-0.5">
                        {entry.pltCount} 매
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500">지그 규격 (mm)</div>
                      <div className="font-mono-tabular font-medium text-slate-800 mt-0.5 truncate">
                        {entry.jigSpec}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-slate-500">총중량</div>
                      <div className="font-mono-tabular font-semibold text-slate-900 mt-0.5">
                        {entry.totalWeightKg.toLocaleString()} kg
                      </div>
                    </div>
                  </div>

                  {/* Tonnage Comparison Grid */}
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <div>
                      <div className="text-[11px] text-slate-500">요청톤수 · 대수</div>
                      <div
                        className={`mt-0.5 ${
                          hasError
                            ? 'text-red-700 font-semibold'
                            : isOverRequested
                              ? 'text-amber-700 font-medium'
                              : 'text-slate-700 font-medium'
                        }`}
                      >
                        {reqShort} · {entry.vehicleCount ?? 1}대
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500">권장(자동산출)</div>
                      <div className="mt-0.5 font-bold text-blue-800">
                        {recommendation.recommendedTonnage}
                      </div>
                    </div>
                    <div className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="text-[11px] text-slate-500">확정톤수</div>
                      <div className="mt-0.5 flex items-center justify-end gap-1">
                        <span
                          className={`font-bold ${
                            isConsolidated
                              ? 'text-blue-800'
                              : entry.confirmedTonnage === '검증대기'
                                ? 'text-amber-700'
                                : 'text-slate-900'
                          }`}
                        >
                          {entry.confirmedTonnage}
                        </span>
                        {entry.confirmedTonnage === '검증대기' && (
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateConfirmedTonnage(
                                entry.id,
                                recShort,
                                isOverRequested
                                  ? `실적재량 검증 후 ${entry.requestedTonnage}→${recommendation.recommendedTonnage} 하향 조정`
                                  : `${recommendation.recommendedTonnage} 표준 적재 기준 적용`
                              )
                            }
                            title="권장톤수로 즉시 확정"
                            className="p-1 text-blue-700 bg-blue-50 hover:bg-blue-100 rounded transition-colors"
                          >
                            <ArrowDownRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Notes */}
                  {entry.notes && (
                    <div className="text-xs text-slate-600 bg-slate-50 rounded px-2.5 py-2 leading-relaxed">
                      <span className="font-semibold text-slate-700">비고:</span> {entry.notes}
                    </div>
                  )}

                  {/* Mobile Action Buttons */}
                  <div
                    className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-[11px] text-slate-400">
                      {isSelected ? '상세 검증 닫기' : '터치하여 상세 검증·합차 보기'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onOpenKakaoCopy(entry)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-blue-50 hover:text-blue-800 rounded transition-colors min-h-[36px]"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        카톡
                      </button>
                      <button
                        type="button"
                        onClick={() => onEdit(entry)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors min-h-[36px]"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(entry.id)}
                        aria-label="삭제"
                        className="inline-flex items-center justify-center px-2.5 py-1.5 text-xs text-slate-500 bg-slate-100 hover:bg-red-50 hover:text-red-600 rounded transition-colors min-h-[36px]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop 16-Column Operational Ledger Table (>= md) */}
      <div className="hidden md:block bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="bg-[#1e3a8a] text-white border-b border-blue-950">
                <th className="py-2.5 px-2.5 font-semibold text-center whitespace-nowrap border-r border-blue-800/60">
                  NO
                </th>
                <th className="py-2.5 px-2.5 font-semibold text-center whitespace-nowrap border-r border-blue-800/60">
                  요청일
                </th>
                <th className="py-2.5 px-2.5 font-semibold text-center whitespace-nowrap border-r border-blue-800/60">
                  상차예정일
                </th>
                <th className="py-2.5 px-2.5 font-semibold whitespace-nowrap border-r border-blue-800/60">
                  요청자
                </th>
                <th className="py-2.5 px-2.5 font-semibold text-center whitespace-nowrap border-r border-blue-800/60">
                  품목구분
                </th>
                <th className="py-2.5 px-3 font-semibold whitespace-nowrap border-r border-blue-800/60 min-w-[180px]">
                  사용내역(품명)
                </th>
                <th className="py-2.5 px-2.5 font-semibold text-right whitespace-nowrap border-r border-blue-800/60">
                  PLT수량<span className="block text-[10px] font-normal text-blue-200">(1100각)</span>
                </th>
                <th className="py-2.5 px-2.5 font-semibold text-center whitespace-nowrap border-r border-blue-800/60">
                  설비·지그규격<span className="block text-[10px] font-normal text-blue-200">(장×폭×고 mm)</span>
                </th>
                <th className="py-2.5 px-2.5 font-semibold text-right whitespace-nowrap border-r border-blue-800/60">
                  총중량<span className="block text-[10px] font-normal text-blue-200">(kg)</span>
                </th>
                <th className="py-2.5 px-2.5 font-semibold whitespace-nowrap border-r border-blue-800/60">
                  출발지
                </th>
                <th className="py-2.5 px-2.5 font-semibold whitespace-nowrap border-r border-blue-800/60">
                  경유지
                </th>
                <th className="py-2.5 px-2.5 font-semibold whitespace-nowrap border-r border-blue-800/60">
                  도착지
                </th>
                <th className="py-2.5 px-2.5 font-semibold text-center whitespace-nowrap border-r border-blue-800/60">
                  요청톤수
                </th>
                <th className="py-2.5 px-2.5 font-semibold text-center whitespace-nowrap border-r border-blue-800/60">
                  차량대수
                </th>
                <th className="py-2.5 px-2.5 font-semibold text-center whitespace-nowrap border-r border-blue-800/60">
                  권장톤수<span className="block text-[10px] font-normal text-blue-200">(자동산출)</span>
                </th>
                <th className="py-2.5 px-2.5 font-semibold text-center whitespace-nowrap border-r border-blue-800/60">
                  확정톤수
                </th>
                <th className="py-2.5 px-2.5 font-semibold text-center whitespace-nowrap border-r border-blue-800/60">
                  중복/합차체크<span className="block text-[10px] font-normal text-blue-200">(±1일 자동감지)</span>
                </th>
                <th className="py-2.5 px-3 font-semibold whitespace-nowrap border-r border-blue-800/60 min-w-[230px]">
                  비고(절감사유/특이사항)
                </th>
                <th className="py-2.5 px-2.5 font-semibold text-center whitespace-nowrap">
                  관리
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={19} className="py-12 text-center text-slate-500">
                    조건에 해당하는 배차 내역이 없습니다. 검색어나 필터를 초기화해 보세요.
                  </td>
                </tr>
              ) : (
                filtered.map(({ entry, recommendation, issues, overlap, isOverRequested }) => {
                  const isSelected = selectedId === entry.id;
                  const reqShort = formatShortTonnage(
                    entry.requestedTonnage,
                    entry.requestedBodyType
                  );
                  const recShort = formatShortTonnage(
                    recommendation.recommendedTonnage,
                    recommendation.suggestedBodyType
                  );
                  const isConsolidated = entry.confirmedTonnage.startsWith('합차');
                  const hasError = issues.some((i) => i.level === 'error');

                  const overlapCellStyle =
                    overlap.status === '중복주의'
                      ? 'bg-red-50 text-red-700 font-semibold'
                      : overlap.status === '합차권장'
                        ? 'bg-amber-50 text-amber-800 font-semibold'
                        : overlap.status === '합차완료'
                          ? 'bg-blue-50 text-blue-800 font-semibold'
                          : 'bg-emerald-50/80 text-emerald-800 font-semibold';

                  return (
                    <tr
                      key={entry.id}
                      onClick={() => setSelectedId(isSelected ? null : entry.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-blue-50/60'
                          : 'hover:bg-slate-50/90'
                      }`}
                    >
                      <td className="py-2.5 px-2.5 text-center font-mono-tabular border-r border-slate-100 whitespace-nowrap">
                        <span className="block text-[10px] font-normal text-slate-400 leading-tight">
                          {formatDispatchMonthLabel(entry)}
                        </span>
                        <span className="font-semibold text-slate-700">{entry.no}</span>
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-mono-tabular text-slate-600 whitespace-nowrap border-r border-slate-100">
                        {entry.requestDate}
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-mono-tabular font-medium text-slate-900 whitespace-nowrap border-r border-slate-100">
                        {entry.loadingDate}
                      </td>
                      <td className="py-2.5 px-2.5 text-slate-800 whitespace-nowrap border-r border-slate-100">
                        {entry.requester}
                      </td>
                      <td className="py-2.5 px-2.5 text-center text-slate-700 whitespace-nowrap border-r border-slate-100">
                        {entry.itemCategory}
                      </td>
                      <td className="py-2.5 px-3 text-slate-900 font-medium border-r border-slate-100">
                        {entry.itemName}
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono-tabular font-medium text-slate-900 border-r border-slate-100">
                        {entry.pltCount}
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-mono-tabular text-slate-700 whitespace-nowrap border-r border-slate-100">
                        {entry.jigSpec}
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono-tabular text-slate-900 border-r border-slate-100">
                        {entry.totalWeightKg.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-2.5 text-slate-800 whitespace-nowrap border-r border-slate-100">
                        {entry.origin}
                      </td>
                      <td className="py-2.5 px-2.5 text-slate-600 border-r border-slate-100">
                        {entry.waypoints}
                      </td>
                      <td className="py-2.5 px-2.5 text-slate-800 font-medium whitespace-nowrap border-r border-slate-100">
                        {entry.destination}
                      </td>
                      <td className="py-2.5 px-2.5 text-center whitespace-nowrap border-r border-slate-100">
                        <span
                          className={
                            hasError
                              ? 'text-red-700 font-semibold'
                              : isOverRequested
                                ? 'text-amber-700 font-medium'
                                : 'text-slate-700'
                          }
                        >
                          {reqShort}
                        </span>
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-mono-tabular font-medium text-slate-900 whitespace-nowrap border-r border-slate-100">
                        {entry.vehicleCount ?? 1}대
                      </td>
                      <td className="py-2.5 px-2.5 text-center whitespace-nowrap font-bold text-blue-800 border-r border-slate-100">
                        {recommendation.recommendedTonnage}
                      </td>
                      <td
                        className="py-2.5 px-2.5 text-center whitespace-nowrap border-r border-slate-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span
                            className={`font-bold ${
                              isConsolidated
                                ? 'text-blue-800'
                                : entry.confirmedTonnage === '검증대기'
                                  ? 'text-amber-700'
                                  : 'text-slate-900'
                            }`}
                          >
                            {entry.confirmedTonnage}
                          </span>
                          {entry.confirmedTonnage === '검증대기' && (
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateConfirmedTonnage(
                                  entry.id,
                                  recShort,
                                  isOverRequested
                                    ? `실적재량 검증 후 ${entry.requestedTonnage}→${recommendation.recommendedTonnage} 하향 조정`
                                    : `${recommendation.recommendedTonnage} 표준 적재 기준 적용`
                                )
                              }
                              title="권장톤수로 즉시 확정"
                              className="p-1 text-blue-700 hover:bg-blue-100 rounded transition-colors"
                            >
                              <ArrowDownRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td
                        className={`py-2.5 px-2.5 text-center whitespace-nowrap border-r border-slate-100 ${overlapCellStyle}`}
                      >
                        {overlap.status}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 leading-snug border-r border-slate-100">
                        {entry.notes || '-'}
                      </td>
                      <td
                        className="py-2.5 px-2.5 text-center whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onOpenKakaoCopy(entry)}
                            title="카톡 요청 양식 복사"
                            className="p-1.5 text-slate-500 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onEdit(entry)}
                            title="수정 및 적재 검증"
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(entry.id)}
                            title="삭제"
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Row Inspection & Quick Actions Panel */}
      {selectedItem && (
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div className="space-y-2 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-semibold text-slate-900 text-sm">
                  {formatMonthlyNo(selectedItem.entry)} {selectedItem.entry.itemName}
                </span>
                <span aria-hidden="true">·</span>
                <span>{selectedItem.entry.requester}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {selectedItem.entry.origin} → {selectedItem.entry.destination}
                </span>
                <span aria-hidden="true">·</span>
                <span>상차 방식: {selectedItem.entry.loadingMethod}</span>
              </div>

              <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded px-3 py-2">
                <span className="font-semibold text-blue-900">자동산출 근거:</span>{' '}
                {selectedItem.recommendation.reason} ({selectedItem.recommendation.bodyReason})
              </div>

              {selectedItem.issues.length > 0 && (
                <div className="space-y-1.5">
                  {selectedItem.issues.map((issue, idx) => (
                    <div
                      key={idx}
                      className={`flex items-start gap-2 text-xs px-3 py-2 rounded border ${
                        issue.level === 'error'
                          ? 'bg-red-50 border-red-200 text-red-800'
                          : 'bg-amber-50 border-amber-200 text-amber-800'
                      }`}
                    >
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{issue.message}</span>
                    </div>
                  ))}
                </div>
              )}

              {selectedItem.overlap.candidates.length > 0 && (
                <div className="space-y-2 pt-1">
                  <div className="text-xs font-semibold text-slate-800">
                    ±1일 동일·경유 노선 감지 내역
                  </div>
                  {selectedItem.overlap.candidates.map((cand) => {
                    const anchor = entries.find((e) => e.id === cand.targetId);
                    if (!anchor) return null;
                    const combo = getCombinedLoadCheck(selectedItem.entry, anchor);
                    const alreadyMerged =
                      doesConsolidatedMatchAnchor(selectedItem.entry, anchor) ||
                      doesConsolidatedMatchAnchor(anchor, selectedItem.entry);

                    return (
                      <div
                        key={cand.targetId}
                        className="flex flex-wrap items-center justify-between gap-3 text-xs border border-slate-200 rounded px-3 py-2 bg-slate-50"
                      >
                        <div>
                          <div className="font-medium text-slate-900">{cand.suggestion}</div>
                          <div className="text-slate-500 mt-0.5 tabular-nums">
                            합산 물량: {combo.combinedPlt} PLT / {combo.combinedWeight.toLocaleString()} kg → 합차 시 권장{' '}
                            <span className="font-semibold text-blue-800">
                              {combo.recommendedCombinedTonnage}
                            </span>
                          </div>
                        </div>
                        {alreadyMerged ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            합차 처리됨
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              onConsolidate(
                                selectedItem.entry.id,
                                anchor,
                                `${anchor.loadingDate.slice(5).replace('-', '/')} ${formatDispatchMonthLabel(anchor)}-NO.${anchor.no} 차량과 동일 노선 → 일정 조율 합차 (${combo.recommendedCombinedTonnage} 혼적 검토)`
                              )
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-blue-900 text-white hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
                          >
                            <GitMerge className="w-3.5 h-3.5" />
                            {formatDispatchMonthLabel(anchor)}-NO.{anchor.no}과 합차 적용
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex flex-wrap lg:flex-col gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const rec = selectedItem.recommendation;
                  const confirmedStr = formatShortTonnage(
                    rec.recommendedTonnage,
                    selectedItem.entry.requestedBodyType
                  );
                  const note =
                    selectedItem.entry.requestedTonnage !== rec.recommendedTonnage
                      ? `실적재량 검증 후 ${selectedItem.entry.requestedTonnage}→${rec.recommendedTonnage} 조정`
                      : `표준 적재 기준(${rec.recommendedTonnage}) 확정`;
                  onUpdateConfirmedTonnage(selectedItem.entry.id, confirmedStr, note);
                }}
                className="px-3.5 py-2 text-xs font-medium rounded bg-slate-900 text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                권장톤수({selectedItem.recommendation.recommendedTonnage})로 확정
              </button>
              <button
                type="button"
                onClick={() => onEdit(selectedItem.entry)}
                className="px-3.5 py-2 text-xs font-medium rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                상세 수정 / 적재 시뮬레이터
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
