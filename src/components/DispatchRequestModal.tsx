import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, ClipboardPaste, Copy, GitMerge, X } from 'lucide-react';
import { KAKAO_BLANK_TEMPLATE, KNOWN_LOCATIONS, TONNAGE_ORDER } from '../data/standards';
import {
  BodyType,
  DispatchEntry,
  ItemCategory,
  LoadingMethod,
  TonnageClass,
} from '../types/dispatch';
import {
  detectRouteOverlaps,
  formatShortTonnage,
  generateKakaoRequestText,
  parseKakaoRequestText,
  validateDispatchRequest,
} from '../utils/dispatchEngine';
import { CargoBedVisualizer } from './CargoBedVisualizer';

interface DispatchRequestModalProps {
  isOpen: boolean;
  editingEntry: DispatchEntry | null;
  existingEntries: DispatchEntry[];
  onClose: () => void;
  onSave: (data: Omit<DispatchEntry, 'id' | 'no'>, existingId?: string) => void;
}

const getTodayIso = () => new Date().toISOString().slice(0, 10);
const getTomorrowIso = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

export const DispatchRequestModal: React.FC<DispatchRequestModalProps> = ({
  isOpen,
  editingEntry,
  existingEntries,
  onClose,
  onSave,
}) => {
  const [activeTab, setActiveTab] = useState<'form' | 'kakao_paste'>('form');
  const [kakaoRawText, setKakaoRawText] = useState('');
  const [parseFeedback, setParseFeedback] = useState<string | null>(null);
  const [copiedKakao, setCopiedKakao] = useState(false);

  const [requestDate, setRequestDate] = useState(getTodayIso());
  const [loadingDate, setLoadingDate] = useState(getTomorrowIso());
  const [loadingTime, setLoadingTime] = useState('오전 09시');
  const [unloadingDate, setUnloadingDate] = useState(getTomorrowIso());
  const [unloadingTime, setUnloadingTime] = useState('오후 02시');
  const [requester, setRequester] = useState('');
  const [contact, setContact] = useState('');
  const [itemCategory, setItemCategory] = useState<ItemCategory>('부품');
  const [itemName, setItemName] = useState('');
  const [pltCount, setPltCount] = useState<number>(2);
  const [hasJig, setHasJig] = useState<boolean>(false);
  const [jigLength, setJigLength] = useState<number>(1800);
  const [jigWidth, setJigWidth] = useState<number>(1200);
  const [jigHeight, setJigHeight] = useState<number>(1500);
  const [jigQty, setJigQty] = useState<number>(1);
  const [totalWeightKg, setTotalWeightKg] = useState<number>(500);
  const [origin, setOrigin] = useState('다올이엔지');
  const [waypoints, setWaypoints] = useState('-');
  const [destination, setDestination] = useState('NKS');
  const [requestedTonnage, setRequestedTonnage] = useState<string>('1톤');
  const [isCustomTonnage, setIsCustomTonnage] = useState<boolean>(false);
  const [requestedBodyType, setRequestedBodyType] = useState<BodyType>('카고');
  const [confirmedTonnage, setConfirmedTonnage] = useState<string>('검증대기');
  const [loadingMethod, setLoadingMethod] = useState<LoadingMethod>('지게차');
  const [isUrgentException, setIsUrgentException] = useState(false);
  const [urgentApprover, setUrgentApprover] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab('form');
    setParseFeedback(null);
    setCopiedKakao(false);

    if (editingEntry) {
      setRequestDate(editingEntry.requestDate);
      setLoadingDate(editingEntry.loadingDate);
      setLoadingTime(editingEntry.loadingTime || '오전 09시');
      setUnloadingDate(editingEntry.unloadingDate || editingEntry.loadingDate);
      setUnloadingTime(editingEntry.unloadingTime || '오후 02시');
      setRequester(editingEntry.requester);
      setContact(editingEntry.contact || '');
      setItemCategory(editingEntry.itemCategory);
      setItemName(editingEntry.itemName);
      setPltCount(editingEntry.pltCount);

      const dims = editingEntry.jigSpec !== '-' ? editingEntry.jigSpec.match(/\d+/g) : null;
      if (dims && dims.length >= 2) {
        setHasJig(true);
        setJigLength(Number(dims[0]));
        setJigWidth(Number(dims[1]));
        setJigHeight(dims[2] ? Number(dims[2]) : 1500);
        setJigQty(editingEntry.jigQty || 1);
      } else {
        setHasJig(false);
      }

      setTotalWeightKg(editingEntry.totalWeightKg);
      setOrigin(editingEntry.origin);
      setWaypoints(editingEntry.waypoints);
      setDestination(editingEntry.destination);
      setRequestedTonnage(editingEntry.requestedTonnage);
      setIsCustomTonnage(!TONNAGE_ORDER.includes(editingEntry.requestedTonnage as TonnageClass));
      setRequestedBodyType(editingEntry.requestedBodyType);
      setConfirmedTonnage(editingEntry.confirmedTonnage);
      setLoadingMethod(editingEntry.loadingMethod);
      setIsUrgentException(Boolean(editingEntry.isUrgentException));
      setUrgentApprover(editingEntry.urgentApprover || '');
      setNotes(editingEntry.notes);
    } else {
      setRequestDate(getTodayIso());
      setLoadingDate(getTomorrowIso());
      setLoadingTime('오전 09시');
      setUnloadingDate(getTomorrowIso());
      setUnloadingTime('오후 02시');
      setRequester('');
      setContact('');
      setItemCategory('부품');
      setItemName('');
      setPltCount(2);
      setHasJig(false);
      setJigLength(1800);
      setJigWidth(1200);
      setJigHeight(1500);
      setJigQty(1);
      setTotalWeightKg(450);
      setOrigin('다올이엔지');
      setWaypoints('-');
      setDestination('NKS');
      setRequestedTonnage('1톤');
      setIsCustomTonnage(false);
      setRequestedBodyType('카고');
      setConfirmedTonnage('검증대기');
      setLoadingMethod('지게차');
      setIsUrgentException(false);
      setUrgentApprover('');
      setNotes('');
    }
  }, [isOpen, editingEntry]);

  const jigSpecString = hasJig ? `${jigLength}×${jigWidth}×${jigHeight}` : '-';

  const { recommendation, issues } = useMemo(
    () =>
      validateDispatchRequest({
        pltCount,
        jigSpec: jigSpecString,
        jigQty: hasJig ? jigQty : 0,
        totalWeightKg,
        requestedTonnage,
        requestedBodyType,
        loadingMethod,
        loadingDate,
        requestDate,
        isUrgentException,
      }),
    [
      pltCount,
      jigSpecString,
      hasJig,
      jigQty,
      totalWeightKg,
      requestedTonnage,
      requestedBodyType,
      loadingMethod,
      loadingDate,
      requestDate,
      isUrgentException,
    ]
  );

  // Live ±1 day overlap preview against existing ledger entries
  const previewOverlaps = useMemo(() => {
    if (!origin.trim() || !destination.trim() || !loadingDate) return [];
    const tempId = editingEntry?.id || '__draft__';
    const draft: DispatchEntry = {
      id: tempId,
      no: editingEntry?.no || 999,
      requestDate,
      loadingDate,
      requester: requester || '신규 요청자',
      itemCategory,
      itemName: itemName || '신규 품목',
      pltCount,
      jigSpec: jigSpecString,
      jigQty: hasJig ? jigQty : 0,
      totalWeightKg,
      origin,
      waypoints,
      destination,
      requestedTonnage,
      requestedBodyType,
      confirmedTonnage,
      loadingMethod,
      notes,
    };
    const pool = editingEntry
      ? existingEntries.map((e) => (e.id === editingEntry.id ? draft : e))
      : [...existingEntries, draft];
    const map = detectRouteOverlaps(pool);
    return map[tempId]?.candidates || [];
  }, [
    editingEntry,
    existingEntries,
    requestDate,
    loadingDate,
    requester,
    itemCategory,
    itemName,
    pltCount,
    jigSpecString,
    hasJig,
    jigQty,
    totalWeightKg,
    origin,
    waypoints,
    destination,
    requestedTonnage,
    requestedBodyType,
    confirmedTonnage,
    loadingMethod,
    notes,
  ]);

  if (!isOpen) return null;

  const handleApplyKakaoParse = () => {
    if (!kakaoRawText.trim()) {
      setParseFeedback('붙여넣을 카카오톡 양식 텍스트를 입력해 주세요.');
      return;
    }
    const parsed = parseKakaoRequestText(kakaoRawText);
    if (parsed.requester) setRequester(parsed.requester);
    if (parsed.contact) setContact(parsed.contact);
    if (parsed.loadingDate) setLoadingDate(parsed.loadingDate);
    if (parsed.loadingTime) setLoadingTime(parsed.loadingTime);
    if (parsed.unloadingDate) setUnloadingDate(parsed.unloadingDate);
    if (parsed.unloadingTime) setUnloadingTime(parsed.unloadingTime);
    if (parsed.origin) setOrigin(parsed.origin);
    if (parsed.waypoints) setWaypoints(parsed.waypoints);
    if (parsed.destination) setDestination(parsed.destination);
    if (parsed.itemCategory) setItemCategory(parsed.itemCategory);
    if (parsed.itemName) setItemName(parsed.itemName);
    if (typeof parsed.pltCount === 'number') setPltCount(parsed.pltCount);
    if (parsed.jigSpec && parsed.jigSpec !== '-') {
      const dims = parsed.jigSpec.match(/\d+/g);
      if (dims && dims.length >= 2) {
        setHasJig(true);
        setJigLength(Number(dims[0]));
        setJigWidth(Number(dims[1]));
        setJigHeight(dims[2] ? Number(dims[2]) : 1500);
        setJigQty(parsed.jigQty || 1);
      }
    } else {
      setHasJig(false);
    }
    if (typeof parsed.totalWeightKg === 'number' && parsed.totalWeightKg > 0) {
      setTotalWeightKg(parsed.totalWeightKg);
    }
    if (parsed.requestedTonnage) {
      setRequestedTonnage(parsed.requestedTonnage);
      setIsCustomTonnage(!TONNAGE_ORDER.includes(parsed.requestedTonnage as TonnageClass));
    }
    if (parsed.requestedBodyType) setRequestedBodyType(parsed.requestedBodyType);
    if (parsed.loadingMethod) setLoadingMethod(parsed.loadingMethod);
    if (parsed.notes) setNotes(parsed.notes);

    setParseFeedback('카카오톡 양식 항목이 입력 폼에 자동 반영되었습니다. 적재 검증 결과를 확인해 주세요.');
    setActiveTab('form');
  };

  const handleCopyKakaoOutput = async () => {
    const text = generateKakaoRequestText({
      requester,
      contact,
      loadingDate,
      loadingTime,
      unloadingDate,
      unloadingTime,
      origin,
      waypoints,
      destination,
      itemName,
      pltCount,
      jigSpec: jigSpecString,
      jigQty: hasJig ? jigQty : 0,
      totalWeightKg,
      requestedTonnage,
      requestedBodyType,
      loadingMethod,
      notes,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKakao(true);
      setTimeout(() => setCopiedKakao(false), 2000);
    } catch {
      // Fallback ignored
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalNotes =
      isUrgentException && urgentApprover
        ? `[긴급예외 승인: ${urgentApprover}] ${notes}`.trim()
        : notes.trim();

    onSave(
      {
        requestDate,
        loadingDate,
        loadingTime,
        unloadingDate,
        unloadingTime,
        requester: requester.trim() || '미지정',
        contact: contact.trim(),
        itemCategory,
        itemName: itemName.trim() || '품목 미입력',
        pltCount: Math.max(0, Number(pltCount) || 0),
        jigSpec: jigSpecString,
        jigQty: hasJig ? Math.max(1, Number(jigQty) || 1) : 0,
        totalWeightKg: Math.max(0, Number(totalWeightKg) || 0),
        origin: origin.trim() || '-',
        waypoints: waypoints.trim() || '-',
        destination: destination.trim() || '-',
        requestedTonnage: requestedTonnage.trim() || '1톤',
        requestedBodyType,
        confirmedTonnage: confirmedTonnage.trim() || '검증대기',
        loadingMethod,
        isUrgentException,
        urgentApprover: urgentApprover.trim(),
        notes: finalNotes,
      },
      editingEntry?.id
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden shadow-xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {editingEntry ? `배차 내역 수정 · NO.${editingEntry.no}` : '신규 용차 배차 요청 및 표준 적재 검증'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              1100×1100 PLT 및 지그 치수 기반 권장톤수 자동 산출 · ±1일 동일 노선 중복 감지
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="flex items-center justify-between px-6 py-2.5 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
            <button
              type="button"
              onClick={() => setActiveTab('form')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                activeTab === 'form' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              배차 정보 입력 · 적재 검증
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('kakao_paste')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap inline-flex items-center gap-1.5 ${
                activeTab === 'kakao_paste'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              카카오톡 요청 양식 붙여넣기 (자동 입력)
            </button>
          </div>

          <button
            type="button"
            onClick={handleCopyKakaoOutput}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            {copiedKakao ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedKakao ? '카톡 양식 복사됨' : '현재 입력값 카톡 양식 복사'}
          </button>
        </div>

        {/* Modal Body */}
        {activeTab === 'kakao_paste' ? (
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3.5 leading-relaxed">
              카카오톡 <span className="font-semibold text-slate-900">[선행기술팀 배차요청방]</span>에 올라온 표준 양식 메시지를 그대로 복사해 아래에 붙여넣으면 요청자, 상차일, 출발·도착지, PLT 수량, 지그 규격, 중량, 요청톤수가 자동으로 파싱됩니다.
            </div>
            <textarea
              value={kakaoRawText}
              onChange={(e) => setKakaoRawText(e.target.value)}
              rows={12}
              placeholder={KAKAO_BLANK_TEMPLATE}
              className="w-full rounded-lg border border-slate-300 p-3.5 text-xs font-mono-tabular leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-800/20 focus:border-blue-800"
            />
            {parseFeedback && (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                {parseFeedback}
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  setKakaoRawText(`[선행기술팀 배차 요청] (익일 배차 전일 15:00 마감)
1) 요청자 / 연락처 : 이찬호 매니저 / 010-1234-5678
2) 희망 상차일시 : 11월 29일 오전 09시
3) 희망 하차일시 : 11월 29일 오후 02시
4) 출발지 (업체명 / 주소 / 담당자·연락처) : 다올이엔지 / 화성시 / 김담당
5) 경유지 (있을 경우 기재, 없으면 생략) : 탑런몰드텍
6) 도착지 (업체명 / 주소 / 담당자·연락처) : NKS / 평택시 / 박담당
7) 품목 및 적재 물량 (필수 기재) : NQ6e 리벳팅 지그 및 샘플
  - 부품 (1100×1100 PLT) : 2 매 (총 중량 약 450 kg)
  - 지그·설비 (가로×세로×높이) : 1800×1200×1500 mm / 1 대 (총 중량 약 600 kg)
8) 차종 / 요청 톤수 : 윙바디 / 5톤 ※ 4 PLT 이하 5톤 요청 불가
9) 상·하차 방식 및 특이사항 : 지게차 / 우천 대비 윙 요청`)
                }
                className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-md"
              >
                예시 텍스트 채우기
              </button>
              <button
                type="button"
                onClick={handleApplyKakaoParse}
                className="px-4 py-2 text-xs font-semibold rounded-md bg-blue-900 text-white hover:bg-blue-800 transition-colors"
              >
                양식 자동 분석 및 입력 반영
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
            {parseFeedback && (
              <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3.5 py-2.5">
                {parseFeedback}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Structured Form Fields */}
              <div className="lg:col-span-7 space-y-5">
                {/* Section 1: Schedule & Requester */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">요청일</label>
                    <input
                      type="date"
                      required
                      value={requestDate}
                      onChange={(e) => setRequestDate(e.target.value)}
                      className="w-full h-9 px-2.5 text-xs font-mono-tabular rounded-md border border-slate-300 focus:outline-none focus:border-blue-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">상차예정일 *</label>
                    <input
                      type="date"
                      required
                      value={loadingDate}
                      onChange={(e) => setLoadingDate(e.target.value)}
                      className="w-full h-9 px-2.5 text-xs font-mono-tabular rounded-md border border-slate-300 focus:outline-none focus:border-blue-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">희망 상차시간</label>
                    <input
                      type="text"
                      value={loadingTime}
                      onChange={(e) => setLoadingTime(e.target.value)}
                      placeholder="오전 09시"
                      className="w-full h-9 px-2.5 text-xs rounded-md border border-slate-300 focus:outline-none focus:border-blue-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">희망 하차시간</label>
                    <input
                      type="text"
                      value={unloadingTime}
                      onChange={(e) => setUnloadingTime(e.target.value)}
                      placeholder="오후 02시"
                      className="w-full h-9 px-2.5 text-xs rounded-md border border-slate-300 focus:outline-none focus:border-blue-800"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs font-medium text-slate-700 mb-1">요청자 *</label>
                    <input
                      type="text"
                      required
                      value={requester}
                      onChange={(e) => setRequester(e.target.value)}
                      placeholder="예: 이찬호 매니저"
                      className="w-full h-9 px-2.5 text-xs rounded-md border border-slate-300 focus:outline-none focus:border-blue-800"
                    />
                  </div>
                </div>

                {/* Section 2: Route */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">출발지 *</label>
                    <input
                      type="text"
                      required
                      list="known-sites-list"
                      value={origin}
                      onChange={(e) => setOrigin(e.target.value)}
                      placeholder="업체명"
                      className="w-full h-9 px-2.5 text-xs rounded-md border border-slate-300 focus:outline-none focus:border-blue-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">경유지 (없으면 -)</label>
                    <input
                      type="text"
                      list="known-sites-list"
                      value={waypoints}
                      onChange={(e) => setWaypoints(e.target.value)}
                      placeholder="예: 탑런몰드텍, 아자텍"
                      className="w-full h-9 px-2.5 text-xs rounded-md border border-slate-300 focus:outline-none focus:border-blue-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">도착지 *</label>
                    <input
                      type="text"
                      required
                      list="known-sites-list"
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      placeholder="업체명"
                      className="w-full h-9 px-2.5 text-xs rounded-md border border-slate-300 focus:outline-none focus:border-blue-800"
                    />
                  </div>
                  <datalist id="known-sites-list">
                    {KNOWN_LOCATIONS.map((loc) => (
                      <option key={loc} value={loc} />
                    ))}
                  </datalist>
                </div>

                {/* Section 3: Cargo Details */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-3">
                    <label className="block text-xs font-medium text-slate-700 mb-1">품목구분</label>
                    <select
                      value={itemCategory}
                      onChange={(e) => setItemCategory(e.target.value as ItemCategory)}
                      className="w-full h-9 px-2.5 text-xs rounded-md border border-slate-300 bg-white focus:outline-none focus:border-blue-800"
                    >
                      <option value="부품">부품</option>
                      <option value="용접지그">용접지그</option>
                      <option value="혼적">혼적</option>
                      <option value="설비">설비</option>
                      <option value="기타">기타</option>
                    </select>
                  </div>
                  <div className="sm:col-span-6">
                    <label className="block text-xs font-medium text-slate-700 mb-1">사용내역 (품명) *</label>
                    <input
                      type="text"
                      required
                      value={itemName}
                      onChange={(e) => setItemName(e.target.value)}
                      placeholder="예: NQ6e RECL 부품, 리벳팅 지그"
                      className="w-full h-9 px-2.5 text-xs rounded-md border border-slate-300 focus:outline-none focus:border-blue-800"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-xs font-medium text-slate-700 mb-1">총중량 (kg) *</label>
                    <input
                      type="number"
                      min={0}
                      step={10}
                      required
                      value={totalWeightKg}
                      onChange={(e) => setTotalWeightKg(Number(e.target.value))}
                      className="w-full h-9 px-2.5 text-xs font-mono-tabular text-right rounded-md border border-slate-300 focus:outline-none focus:border-blue-800"
                    />
                  </div>
                </div>

                {/* Section 4: PLT & Jig Dimensions */}
                <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3.5 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        1100×1100 PLT 수량 (매)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={20}
                        value={pltCount}
                        onChange={(e) => setPltCount(Number(e.target.value))}
                        className="w-full h-9 px-2.5 text-xs font-mono-tabular text-right rounded-md border border-slate-300 bg-white focus:outline-none focus:border-blue-800"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">상·하차 방식</label>
                      <select
                        value={loadingMethod}
                        onChange={(e) => setLoadingMethod(e.target.value as LoadingMethod)}
                        className="w-full h-9 px-2.5 text-xs rounded-md border border-slate-300 bg-white focus:outline-none focus:border-blue-800"
                      >
                        <option value="지게차">지게차</option>
                        <option value="호이스트">호이스트 (카고 필수)</option>
                        <option value="크레인">크레인 (카고 필수)</option>
                        <option value="수작업">수작업</option>
                      </select>
                    </div>
                    <div className="flex items-center h-9">
                      <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={hasJig}
                          onChange={(e) => setHasJig(e.target.checked)}
                          className="rounded border-slate-300 text-blue-900 focus:ring-blue-800"
                        />
                        설비·용접지그 적재 포함
                      </label>
                    </div>
                  </div>

                  {hasJig && (
                    <div className="grid grid-cols-4 gap-2.5 pt-2 border-t border-slate-200">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">장 (L mm)</label>
                        <input
                          type="number"
                          min={100}
                          step={50}
                          value={jigLength}
                          onChange={(e) => setJigLength(Number(e.target.value))}
                          className="w-full h-8 px-2 text-xs font-mono-tabular text-right rounded border border-slate-300 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">폭 (W mm)</label>
                        <input
                          type="number"
                          min={100}
                          step={50}
                          value={jigWidth}
                          onChange={(e) => setJigWidth(Number(e.target.value))}
                          className="w-full h-8 px-2 text-xs font-mono-tabular text-right rounded border border-slate-300 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">고 (H mm)</label>
                        <input
                          type="number"
                          min={100}
                          step={50}
                          value={jigHeight}
                          onChange={(e) => setJigHeight(Number(e.target.value))}
                          className="w-full h-8 px-2 text-xs font-mono-tabular text-right rounded border border-slate-300 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">수량 (대)</label>
                        <input
                          type="number"
                          min={1}
                          max={5}
                          value={jigQty}
                          onChange={(e) => setJigQty(Number(e.target.value))}
                          className="w-full h-8 px-2 text-xs font-mono-tabular text-right rounded border border-slate-300 bg-white"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Section 5: Tonnage & Body Type Selection */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">요청 톤수</label>
                    <select
                      value={isCustomTonnage ? '__CUSTOM__' : requestedTonnage}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '__CUSTOM__') {
                          setIsCustomTonnage(true);
                          if (TONNAGE_ORDER.includes(requestedTonnage as TonnageClass)) {
                            setRequestedTonnage('');
                          }
                        } else {
                          setIsCustomTonnage(false);
                          setRequestedTonnage(val);
                        }
                      }}
                      className="w-full h-9 px-2.5 text-xs rounded-md border border-slate-300 bg-white focus:outline-none focus:border-blue-800"
                    >
                      {TONNAGE_ORDER.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                      <option value="__CUSTOM__">직접입력</option>
                    </select>
                    {isCustomTonnage && (
                      <input
                        type="text"
                        required
                        value={requestedTonnage}
                        onChange={(e) => setRequestedTonnage(e.target.value)}
                        placeholder="예: 11톤, 1.4톤, 다마스"
                        className="mt-1.5 w-full h-9 px-2.5 text-xs rounded-md border border-slate-300 focus:outline-none focus:border-blue-800"
                      />
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">요청 차종</label>
                    <select
                      value={requestedBodyType}
                      onChange={(e) => setRequestedBodyType(e.target.value as BodyType)}
                      className="w-full h-9 px-2.5 text-xs rounded-md border border-slate-300 bg-white focus:outline-none focus:border-blue-800"
                    >
                      <option value="카고">카고</option>
                      <option value="윙바디">윙바디</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      확정 톤수 (배차담당)
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={confirmedTonnage}
                        onChange={(e) => setConfirmedTonnage(e.target.value)}
                        placeholder="예: 3.5톤 윙 / 합차(NO.1)"
                        className="w-full h-9 px-2.5 text-xs rounded-md border border-slate-300 focus:outline-none focus:border-blue-800"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmedTonnage(
                            formatShortTonnage(
                              recommendation.recommendedTonnage,
                              recommendation.suggestedBodyType
                            )
                          )
                        }
                        title="권장 톤수·차종 즉시 적용"
                        className="px-2.5 h-9 text-xs font-medium rounded border border-blue-200 bg-blue-50 text-blue-900 hover:bg-blue-100 whitespace-nowrap shrink-0"
                      >
                        권장적용
                      </button>
                    </div>
                  </div>
                </div>

                {/* Section 6: Notes & Urgent Exception */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-medium text-slate-700">
                      비고 (절감사유 / 특이사항)
                    </label>
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isUrgentException}
                        onChange={(e) => setIsUrgentException(e.target.checked)}
                        className="rounded border-slate-300 text-red-600 focus:ring-red-600"
                      />
                      4단계 긴급 예외 배차 (16:30 이후/당일)
                    </label>
                  </div>

                  {isUrgentException && (
                    <input
                      type="text"
                      value={urgentApprover}
                      onChange={(e) => setUrgentApprover(e.target.value)}
                      placeholder="승인자 (파트장/팀장 성명) 및 라인 정지 등 긴급 사유 필수 기재"
                      className="w-full h-9 px-2.5 text-xs rounded-md border border-red-300 bg-red-50/40 focus:outline-none focus:border-red-600"
                    />
                  )}

                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="예: 실적재량 검증 후 5톤→3.5톤 하향 조정 / 우천 대비 윙 요청"
                    className="w-full h-9 px-2.5 text-xs rounded-md border border-slate-300 focus:outline-none focus:border-blue-800"
                  />
                </div>
              </div>

              {/* Right Column: Live Verification & 2D Visualizer */}
              <div className="lg:col-span-5 space-y-4">
                <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-blue-900">
                      표준 적재 자동 산출 결과
                    </span>
                    <span className="text-sm font-bold text-blue-950">
                      권장: {recommendation.recommendedTonnage} ({recommendation.suggestedBodyType})
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">{recommendation.reason}</p>
                  <p className="text-xs text-slate-600">{recommendation.bodyReason}</p>
                </div>

                <CargoBedVisualizer
                  tonnage={
                    TONNAGE_ORDER.includes(requestedTonnage as TonnageClass)
                      ? (requestedTonnage as TonnageClass)
                      : recommendation.recommendedTonnage
                  }
                  pltCount={pltCount}
                  jigSpec={jigSpecString}
                  jigQty={hasJig ? jigQty : 0}
                  totalWeightKg={totalWeightKg}
                />

                {issues.length > 0 && (
                  <div className="space-y-2">
                    {issues.map((issue, idx) => (
                      <div
                        key={idx}
                        className={`flex items-start gap-2 text-xs p-3 rounded-lg border ${
                          issue.level === 'error'
                            ? 'bg-red-50 border-red-200 text-red-800'
                            : 'bg-amber-50 border-amber-200 text-amber-900'
                        }`}
                      >
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span className="leading-relaxed">{issue.message}</span>
                      </div>
                    ))}
                  </div>
                )}

                {previewOverlaps.length > 0 && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50/70 p-3.5 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                      <GitMerge className="w-4 h-4" />
                      ±1일 동일·경유 노선 사전 감지 ({previewOverlaps.length}건)
                    </div>
                    {previewOverlaps.map((ov) => (
                      <div key={ov.targetId} className="text-xs text-amber-800">
                        · {ov.suggestion}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
              >
                취소
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-semibold rounded-md bg-blue-900 text-white hover:bg-blue-800 transition-colors"
              >
                {editingEntry ? '수정 내역 저장' : '배차 관리대장에 등록'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
