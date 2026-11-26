import React, { useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { KAKAO_BLANK_TEMPLATE } from '../data/standards';
import { DispatchEntry } from '../types/dispatch';
import {
  formatMonthlyNo,
  generateCarrierBatchOrderText,
  generateKakaoRequestText,
} from '../utils/dispatchEngine';

interface KakaoAndBatchViewProps {
  entries: DispatchEntry[];
  selectedEntryForKakao: DispatchEntry | null;
}

export const KakaoAndBatchView: React.FC<KakaoAndBatchViewProps> = ({
  entries,
  selectedEntryForKakao,
}) => {
  const uniqueDates = useMemo(() => {
    const dates = Array.from(new Set(entries.map((e) => e.loadingDate))).sort();
    return dates;
  }, [entries]);

  const [targetDate, setTargetDate] = useState<string>(uniqueDates[0] || '2026-11-27');
  const [kakaoMode, setKakaoMode] = useState<'blank' | 'entry'>(
    selectedEntryForKakao ? 'entry' : 'blank'
  );
  const [selectedEntryId, setSelectedEntryId] = useState<string>(
    selectedEntryForKakao?.id || entries[0]?.id || ''
  );
  const [copiedBlank, setCopiedBlank] = useState(false);
  const [copiedBatch, setCopiedBatch] = useState(false);

  const activeEntry = useMemo(
    () => entries.find((e) => e.id === selectedEntryId) || selectedEntryForKakao || null,
    [entries, selectedEntryId, selectedEntryForKakao]
  );

  const kakaoOutputText =
    kakaoMode === 'blank' || !activeEntry
      ? KAKAO_BLANK_TEMPLATE
      : generateKakaoRequestText(activeEntry);

  const batchOrderText = useMemo(
    () => generateCarrierBatchOrderText(entries, targetDate),
    [entries, targetDate]
  );

  const handleCopy = async (text: string, which: 'kakao' | 'batch') => {
    try {
      await navigator.clipboard.writeText(text);
      if (which === 'kakao') {
        setCopiedBlank(true);
        setTimeout(() => setCopiedBlank(false), 2000);
      } else {
        setCopiedBatch(true);
        setTimeout(() => setCopiedBatch(false), 2000);
      }
    } catch {
      // Ignore clipboard failures in restricted frames
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left Panel: KakaoTalk Standard Notice Template */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 bg-[#1e3a8a] text-white flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold">
              3. 카카오톡 [선행기술팀 배차요청방] 공지 고정용 표준 양식
            </h2>
            <p className="text-xs text-blue-100 mt-0.5">
              전일 15:00 마감 · 팀원 요청 시 복사 후 사용
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleCopy(kakaoOutputText, 'kakao')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-white text-blue-950 hover:bg-blue-50 transition-colors whitespace-nowrap shrink-0"
          >
            {copiedBlank ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedBlank ? '복사 완료' : '양식 복사'}
          </button>
        </div>

        <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-md">
            <button
              type="button"
              onClick={() => setKakaoMode('blank')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                kakaoMode === 'blank' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              공지 고정용 빈 양식
            </button>
            <button
              type="button"
              onClick={() => setKakaoMode('entry')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                kakaoMode === 'entry' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              대장 항목 채워진 양식
            </button>
          </div>

          {kakaoMode === 'entry' && entries.length > 0 && (
            <select
              value={selectedEntryId}
              onChange={(e) => setSelectedEntryId(e.target.value)}
              className="h-8 px-2.5 text-xs rounded border border-slate-300 bg-white max-w-[220px]"
            >
              {entries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {formatMonthlyNo(entry)} {entry.requester} ({entry.loadingDate})
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="p-5 flex-1">
          <pre className="w-full h-full min-h-[320px] whitespace-pre-wrap font-mono-tabular text-xs leading-relaxed text-slate-800 bg-amber-50/70 border border-amber-200 rounded-lg p-4">
            {kakaoOutputText}
          </pre>
        </div>
      </section>

      {/* Right Panel: 3단계 일괄 발주 생성기 */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold">
              [운송사 배차발주방] 16:00~16:30 일일 일괄 발주서
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              상차일 기준 합차 건 통합 · 확정 톤수 반영 자동 생성
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleCopy(batchOrderText, 'batch')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-white text-slate-900 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
          >
            {copiedBatch ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedBatch ? '발주서 복사됨' : '발주서 복사'}
          </button>
        </div>

        <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-700">상차예정일 선택</label>
            <select
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="h-8 px-2.5 text-xs font-mono-tabular rounded border border-slate-300 bg-white"
            >
              {uniqueDates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <span className="text-xs text-slate-500">
            합차(NO.X) 건은 대표 차량 하위 내역으로 자동 병합됩니다
          </span>
        </div>

        <div className="p-5 flex-1">
          <pre className="w-full h-full min-h-[320px] whitespace-pre-wrap font-mono-tabular text-xs leading-relaxed text-slate-800 bg-slate-50 border border-slate-200 rounded-lg p-4">
            {batchOrderText}
          </pre>
        </div>
      </section>
    </div>
  );
};
