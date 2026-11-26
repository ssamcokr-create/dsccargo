import { TONNAGE_ORDER, VEHICLE_SPECS } from '../data/standards';
import {
  BodyType,
  DispatchEntry,
  ItemCategory,
  JigDimensions,
  LoadingMethod,
  OverlapAnalysis,
  OverlapCandidate,
  RecommendationResult,
  TonnageClass,
  ValidationIssue,
} from '../types/dispatch';

export function parseJigDimensions(spec: string): JigDimensions | null {
  if (!spec || spec.trim() === '-' || spec.trim() === '') return null;
  const nums = spec.match(/\d+/g);
  if (!nums || nums.length < 2) return null;
  const d1 = Number(nums[0]);
  const d2 = Number(nums[1]);
  const d3 = nums[2] ? Number(nums[2]) : 1200;
  if (!Number.isFinite(d1) || !Number.isFinite(d2) || d1 <= 0 || d2 <= 0) return null;
  // Normalize length >= width for footprint comparison
  return {
    length: Math.max(d1, d2),
    width: Math.min(d1, d2),
    height: d3,
  };
}

export function formatShortTonnage(tonnage: string, bodyType: string): string {
  const shortBody = bodyType === '윙바디' ? '윙' : bodyType === '카고' ? '카고' : bodyType;
  return `${tonnage} ${shortBody}`.trim();
}

export function getDispatchMonthKey(
  entry: Pick<DispatchEntry, 'loadingDate' | 'requestDate'>
): string {
  const raw = (entry.loadingDate || entry.requestDate || '').trim();
  if (/^\d{4}-\d{2}/.test(raw)) return raw.slice(0, 7);
  return '미지정';
}

export function formatDispatchMonthLabel(
  entry: Pick<DispatchEntry, 'loadingDate' | 'requestDate'>
): string {
  const key = getDispatchMonthKey(entry);
  if (key === '미지정') return '미지정';
  return `${key.slice(2, 4)}.${key.slice(5, 7)}`;
}

export function formatMonthlyNo(
  entry: Pick<DispatchEntry, 'no' | 'loadingDate' | 'requestDate'>
): string {
  return `${formatDispatchMonthLabel(entry)}-${entry.no}`;
}

function parseConsolidatedRef(
  confirmedTonnage: string
): { monthLabel?: string; targetNo: number } | null {
  const match = confirmedTonnage.trim().match(/^합차\((?:(\d{2}\.\d{2}|미지정)-)?NO\.(\d+)\)$/);
  if (!match) return null;
  return {
    monthLabel: match[1] || undefined,
    targetNo: Number(match[2]),
  };
}

export function formatConsolidatedTonnage(
  entry: Pick<DispatchEntry, 'loadingDate' | 'requestDate'>,
  anchor: Pick<DispatchEntry, 'no' | 'loadingDate' | 'requestDate'>
): string {
  if (getDispatchMonthKey(entry) === getDispatchMonthKey(anchor)) {
    return `합차(NO.${anchor.no})`;
  }
  return `합차(${formatDispatchMonthLabel(anchor)}-NO.${anchor.no})`;
}

export function doesConsolidatedMatchAnchor(
  consolidatedEntry: DispatchEntry,
  anchorEntry: DispatchEntry
): boolean {
  if (consolidatedEntry.id === anchorEntry.id) return false;
  const parsed = parseConsolidatedRef(consolidatedEntry.confirmedTonnage);
  if (!parsed || parsed.targetNo !== anchorEntry.no) return false;
  if (parsed.monthLabel) {
    return parsed.monthLabel === formatDispatchMonthLabel(anchorEntry);
  }
  return getDispatchMonthKey(consolidatedEntry) === getDispatchMonthKey(anchorEntry);
}

export function renumberDispatchesByMonth(entries: DispatchEntry[]): DispatchEntry[] {
  // Capture existing anchor entry IDs before renumbering so 합차(NO.X) pointers stay valid
  const anchorIdByEntryId = new Map<string, string>();
  for (const entry of entries) {
    const parsed = parseConsolidatedRef(entry.confirmedTonnage);
    if (!parsed) continue;
    const targetMonthLabel = parsed.monthLabel || formatDispatchMonthLabel(entry);
    const exactAnchor = entries.find(
      (candidate) =>
        candidate.id !== entry.id &&
        candidate.no === parsed.targetNo &&
        formatDispatchMonthLabel(candidate) === targetMonthLabel
    );
    const fallbackAnchor =
      exactAnchor ||
      entries.find((candidate) => candidate.id !== entry.id && candidate.no === parsed.targetNo);
    if (fallbackAnchor) {
      anchorIdByEntryId.set(entry.id, fallbackAnchor.id);
    }
  }

  // Group entries by month key (YYYY-MM) while preserving relative order inside each month
  const grouped = new Map<string, DispatchEntry[]>();
  for (const entry of entries) {
    const monthKey = getDispatchMonthKey(entry);
    const bucket = grouped.get(monthKey);
    if (bucket) {
      bucket.push(entry);
    } else {
      grouped.set(monthKey, [entry]);
    }
  }

  const sortedMonthKeys = Array.from(grouped.keys()).sort((a, b) => {
    if (a === '미지정') return 1;
    if (b === '미지정') return -1;
    return a.localeCompare(b);
  });

  const renumbered: DispatchEntry[] = [];
  for (const monthKey of sortedMonthKeys) {
    const bucket = grouped.get(monthKey) || [];
    bucket.forEach((entry, idx) => {
      renumbered.push({
        ...entry,
        no: idx + 1,
      });
    });
  }

  const byId = new Map(renumbered.map((e) => [e.id, e]));
  return renumbered.map((entry) => {
    const parsed = parseConsolidatedRef(entry.confirmedTonnage);
    if (!parsed) return entry;
    const anchorId = anchorIdByEntryId.get(entry.id);
    const anchor = anchorId ? byId.get(anchorId) : undefined;
    if (!anchor) {
      return {
        ...entry,
        confirmedTonnage: '검증대기',
      };
    }
    return {
      ...entry,
      confirmedTonnage: formatConsolidatedTonnage(entry, anchor),
    };
  });
}

export function calculateRecommendedTonnage(
  pltCount: number,
  jigSpec: string,
  totalWeightKg: number,
  loadingMethod: string = '지게차',
  itemName = '',
  jigQty = 1
): RecommendationResult {
  const jig = parseJigDimensions(jigSpec);
  const effectiveJigQty = jig ? Math.max(1, jigQty) : 0;

  // Determine suggested body type from SOP principles
  let suggestedBodyType: BodyType = '카고';
  let bodyReason = '부품·철구조물 기본 카고 원칙 적용';

  if (/호이스트|크레인/.test(loadingMethod)) {
    suggestedBodyType = '카고';
    bodyReason = '호이스트·크레인 상차 시 카고(천막) 필수 지정 원칙';
  } else if (/센서|전동|전자|샘플|우천|습기/.test(itemName)) {
    suggestedBodyType = '윙바디';
    bodyReason = '우천·습기 취약 정밀 부품으로 윙바디 권장';
  }

  // Evaluate smallest sufficient tonnage based on Standard Loading Table
  let recommended: TonnageClass = '5톤 축/플러스';
  let exceedsMaxSpec = false;
  let reason = '';

  const fits1t =
    totalWeightKg <= 1000 &&
    ((!jig && pltCount <= 2) ||
      (jig !== null && effectiveJigQty === 1 && pltCount === 0 && jig.length <= 2500 && jig.width <= 1400));

  const fits2_5t =
    totalWeightKg <= 2500 &&
    ((!jig && pltCount <= 3) ||
      (jig !== null &&
        effectiveJigQty === 1 &&
        ((pltCount === 0 && jig.length <= 3000 && jig.width <= 1550) ||
          (pltCount <= 1 && jig.length <= 2500 && jig.width <= 1400))));

  const fits3_5t =
    totalWeightKg <= 3500 &&
    ((!jig && pltCount <= 4) ||
      (jig !== null &&
        effectiveJigQty === 1 &&
        ((pltCount === 0 && jig.length <= 4400 && jig.width <= 1900) ||
          (pltCount <= 2 &&
            jig.length <= 3000 &&
            jig.width <= 1600 &&
            jig.length + pltCount * 1100 <= 4600))));

  // 5-ton allows 2-row parallel loading (width 2350mm >= 2200mm)
  const canFit5tMixed = (() => {
    if (totalWeightKg > 5000) return false;
    if (!jig) return pltCount <= 10;
    if (jig.width > 2150) return false;
    if (effectiveJigQty === 1) {
      const remLen = 6000 - jig.length;
      if (remLen < 0) return false;
      const baysBehind = Math.floor(remLen / 1100) * 2;
      const baysBeside = jig.width <= 1150 ? Math.floor(jig.length / 1100) : 0;
      return pltCount <= baysBehind + baysBeside;
    }
    if (effectiveJigQty === 2 && pltCount === 0) {
      // 2 large jigs side-by-side or end-to-end
      return jig.length * 2 <= 6000 || (jig.width * 2 <= 2200 && jig.length <= 6000);
    }
    return false;
  })();

  const canFit5tPlusMixed = (() => {
    if (totalWeightKg > 8000) return false;
    if (!jig) return pltCount <= 14;
    if (jig.width > 2200) return false;
    const totalJigLen = jig.length * effectiveJigQty;
    const remLen = 8200 - totalJigLen;
    if (remLen < 0) return false;
    const baysBehind = Math.floor(remLen / 1100) * 2;
    const baysBeside = jig.width <= 1150 ? Math.floor(totalJigLen / 1100) : 0;
    return pltCount <= baysBehind + baysBeside;
  })();

  if (fits1t) {
    recommended = '1톤';
    reason = jig
      ? `소형 지그(${jig.length}×${jig.width}mm) 및 중량 ${totalWeightKg.toLocaleString()}kg → 1톤(2,800×1,600) 적정`
      : `1100각 ${pltCount}PLT, 중량 ${totalWeightKg.toLocaleString()}kg → 1톤(최대 2PLT·1.0t) 적정`;
  } else if (fits2_5t) {
    recommended = '2.5톤';
    reason = jig
      ? `지그(${jig.length}×${jig.width}mm)${pltCount > 0 ? `+${pltCount}PLT` : ''} 및 ${totalWeightKg.toLocaleString()}kg → 2.5톤(4,300×1,900) 적정`
      : `1100각 ${pltCount}PLT, 중량 ${totalWeightKg.toLocaleString()}kg → 2.5톤(최대 3PLT·2.5t) 적정`;
  } else if (fits3_5t) {
    recommended = '3.5톤';
    reason = jig
      ? `지그(${jig.length}×${jig.width}mm)${pltCount > 0 ? `+${pltCount}PLT 혼적` : ''} 및 ${totalWeightKg.toLocaleString()}kg → 3.5톤(4,800×2,100) 적정`
      : `1100각 ${pltCount}PLT, 중량 ${totalWeightKg.toLocaleString()}kg → 3.5톤(최대 4PLT·3.5t) 적정`;
  } else if (canFit5tMixed) {
    recommended = '5톤';
    reason = jig
      ? `지그 ${effectiveJigQty}대+혼적 ${pltCount}PLT, ${totalWeightKg.toLocaleString()}kg → 5톤(2열 병렬 적재) 적정`
      : `1100각 ${pltCount}PLT(2열×5매 구간), ${totalWeightKg.toLocaleString()}kg → 5톤 적정`;
  } else if (canFit5tPlusMixed) {
    recommended = '5톤 축/플러스';
    reason = `대량 물량(${pltCount}PLT${jig ? ` + 지그 ${effectiveJigQty}대` : ''}, ${totalWeightKg.toLocaleString()}kg) → 5톤 축/플러스(최대 14PLT·8.0t) 필요`;
  } else {
    recommended = '5톤 축/플러스';
    exceedsMaxSpec = true;
    reason = `단일 차량 표준 허용치(14PLT / 8,000kg / 폭 2,200mm) 초과 → 차량 분할 또는 특수차 검토 필요`;
  }

  return {
    recommendedTonnage: recommended,
    exceedsMaxSpec,
    reason,
    suggestedBodyType,
    bodyReason,
    pltFitsIn1Row: !jig && pltCount <= 4,
  };
}

export function validateDispatchRequest(entry: {
  pltCount: number;
  jigSpec: string;
  jigQty?: number;
  totalWeightKg: number;
  requestedTonnage: string;
  requestedBodyType: string;
  loadingMethod: string;
  loadingDate: string;
  requestDate: string;
  isUrgentException?: boolean;
}): { recommendation: RecommendationResult; issues: ValidationIssue[] } {
  const recommendation = calculateRecommendedTonnage(
    entry.pltCount,
    entry.jigSpec,
    entry.totalWeightKg,
    entry.loadingMethod,
    '',
    entry.jigQty ?? 1
  );

  const issues: ValidationIssue[] = [];
  const reqIdx = TONNAGE_ORDER.indexOf(entry.requestedTonnage as TonnageClass);
  const recIdx = TONNAGE_ORDER.indexOf(recommendation.recommendedTonnage);
  const hasJig = parseJigDimensions(entry.jigSpec) !== null;

  // Rule 1: 4 PLT 이하 5톤 요청 금지 (standard tonnage classes)
  if (reqIdx !== -1) {
    if (!hasJig && entry.pltCount <= 4 && reqIdx >= 3) {
      issues.push({
        level: 'error',
        code: 'OVER_TONNAGE_4PLT',
        message: `4 PLT 이하(현재 ${entry.pltCount}PLT) 건은 5톤 이상 요청이 금지됩니다. ${recommendation.recommendedTonnage}으로 하향 조정하세요.`,
      });
    } else if (reqIdx > recIdx) {
      issues.push({
        level: 'warning',
        code: 'DOWNSIZE_AVAILABLE',
        message: `요청(${entry.requestedTonnage}) 대비 권장(${recommendation.recommendedTonnage})이 낮습니다. 하향 조정 시 운임 절감이 가능합니다.`,
      });
    } else if (reqIdx < recIdx) {
      issues.push({
        level: 'error',
        code: 'SPEC_EXCEEDED',
        message: `요청 차량(${entry.requestedTonnage})의 적재함 규격/중량 한도를 초과합니다. 최소 ${recommendation.recommendedTonnage} 이상 필요합니다.`,
      });
    }
  }

  if (recommendation.exceedsMaxSpec) {
    issues.push({
      level: 'error',
      code: 'SPEC_EXCEEDED',
      message: recommendation.reason,
    });
  }

  // Rule 2: 호이스트·크레인 상차 시 카고(천막) 필수 지정
  if (
    /호이스트|크레인/.test(entry.loadingMethod) &&
    entry.requestedBodyType === '윙바디'
  ) {
    issues.push({
      level: 'error',
      code: 'HOIST_CARGO_REQUIRED',
      message: `${entry.loadingMethod} 상·하차 작업 시 지붕 개방이 가능한 '카고(천막)' 차종을 필수로 지정해야 합니다.`,
    });
  }

  // Rule 3: 당일 배차 또는 긴급 예외
  if (entry.loadingDate && entry.requestDate && entry.loadingDate === entry.requestDate) {
    issues.push({
      level: 'warning',
      code: 'URGENT_CUTOFF',
      message: '당일 배차 건은 4단계 긴급 예외 절차(파트장/팀장 승인 및 비고란 사유 기재) 대상입니다.',
    });
  }

  return { recommendation, issues };
}

function normalizeSiteName(site: string): string {
  return site.trim().toLowerCase().replace(/\s+/g, '');
}

function getDateDiffDays(dateA: string, dateB: string): number {
  const a = new Date(`${dateA}T00:00:00`);
  const b = new Date(`${dateB}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 999;
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

export function detectRouteOverlaps(entries: DispatchEntry[]): Record<string, OverlapAnalysis> {
  const result: Record<string, OverlapAnalysis> = {};

  for (const current of entries) {
    const candidates: OverlapCandidate[] = [];
    const curOrigin = normalizeSiteName(current.origin);
    const curDest = normalizeSiteName(current.destination);
    const curWaypoints = current.waypoints && current.waypoints !== '-'
      ? current.waypoints.split(/[,/]/).map(normalizeSiteName).filter(Boolean)
      : [];

    for (const other of entries) {
      if (other.id === current.id) continue;
      const dayDiff = Math.abs(getDateDiffDays(current.loadingDate, other.loadingDate));
      if (dayDiff > 1) continue;

      const othOrigin = normalizeSiteName(other.origin);
      const othDest = normalizeSiteName(other.destination);
      const othWaypoints = other.waypoints && other.waypoints !== '-'
        ? other.waypoints.split(/[,/]/).map(normalizeSiteName).filter(Boolean)
        : [];

      const sameOriginDest = curOrigin && curDest && curOrigin === othOrigin && curDest === othDest;

      // Also detect if one route's origin->dest matches another route's origin->waypoint or waypoint->dest
      const curAllStops = [curOrigin, ...curWaypoints, curDest].filter(Boolean);
      const othAllStops = [othOrigin, ...othWaypoints, othDest].filter(Boolean);
      const sharedOriginAndStop =
        curOrigin === othOrigin &&
        (curAllStops.includes(othDest) || othAllStops.includes(curDest));

      if (sameOriginDest || sharedOriginAndStop) {
        const matchType = sameOriginDest
          ? dayDiff === 0
            ? 'exact_route'
            : 'adjacent_date'
          : 'waypoint_route';

        const dayLabel = dayDiff === 0 ? '동일 일자' : `±1일(${other.loadingDate})`;
        const otherLabel = `${formatDispatchMonthLabel(other)}-NO.${other.no}`;
        const suggestion = sameOriginDest
          ? `${otherLabel}(${other.requester})와 ${dayLabel} 동일 상·하차지 → 합차·혼적 검토`
          : `${otherLabel}(${other.requester})와 ${dayLabel} 경유 노선 중복 → 통합 배차 검토`;

        candidates.push({
          targetId: other.id,
          targetNo: other.no,
          targetLoadingDate: other.loadingDate,
          targetRequester: other.requester,
          targetRoute: `${other.origin} → ${other.destination}`,
          dayDiff,
          matchType,
          suggestion,
        });
      }
    }

    const isConsolidated = current.confirmedTonnage.startsWith('합차');
    const isAnchorOfConsolidated = entries.some((e) => doesConsolidatedMatchAnchor(e, current));

    let status: OverlapAnalysis['status'] = '정상';
    if (isConsolidated) {
      status = '합차완료';
    } else if (candidates.length > 0) {
      // Check if every candidate is already consolidated with this entry or vice versa
      const unresolved = candidates.filter((c) => {
        const partner = entries.find((e) => e.id === c.targetId);
        if (!partner) return true;
        const mergedTogether =
          doesConsolidatedMatchAnchor(partner, current) ||
          doesConsolidatedMatchAnchor(current, partner);
        return !mergedTogether;
      });

      if (unresolved.length > 0) {
        status = unresolved.some((u) => u.dayDiff === 0 && u.matchType === 'exact_route')
          ? '중복주의'
          : '합차권장';
      } else if (isAnchorOfConsolidated) {
        status = '정상';
      }
    }

    result[current.id] = { status, candidates };
  }

  return result;
}

export function getCombinedLoadCheck(a: DispatchEntry, b: DispatchEntry): {
  combinedPlt: number;
  combinedWeight: number;
  recommendedCombinedTonnage: TonnageClass;
  feasible: boolean;
} {
  const combinedPlt = a.pltCount + b.pltCount;
  const combinedWeight = a.totalWeightKg + b.totalWeightKg;
  const jigA = parseJigDimensions(a.jigSpec);
  const jigB = parseJigDimensions(b.jigSpec);

  // Pick larger jig if one exists, or estimate combined if both have jigs
  let combinedJigSpec = '-';
  let combinedJigQty = 0;
  if (jigA && jigB) {
    combinedJigSpec = `${Math.max(jigA.length, jigB.length)}×${Math.max(jigA.width, jigB.width)}×${Math.max(jigA.height, jigB.height)}`;
    combinedJigQty = 2;
  } else if (jigA) {
    combinedJigSpec = a.jigSpec;
    combinedJigQty = a.jigQty ?? 1;
  } else if (jigB) {
    combinedJigSpec = b.jigSpec;
    combinedJigQty = b.jigQty ?? 1;
  }

  const rec = calculateRecommendedTonnage(
    combinedPlt,
    combinedJigSpec,
    combinedWeight,
    a.loadingMethod === '크레인' || b.loadingMethod === '크레인' ? '크레인' : a.loadingMethod,
    `${a.itemName} ${b.itemName}`,
    combinedJigQty
  );

  return {
    combinedPlt,
    combinedWeight,
    recommendedCombinedTonnage: rec.recommendedTonnage,
    feasible: !rec.exceedsMaxSpec,
  };
}

export function generateKakaoRequestText(entry: Partial<DispatchEntry>): string {
  const formatMonthDay = (iso?: string) => {
    if (!iso) return '  월  일';
    const [, m, d] = iso.split('-');
    if (!m || !d) return '  월  일';
    return `${Number(m)}월 ${Number(d)}일`;
  };

  const loadDateText = `${formatMonthDay(entry.loadingDate)} ${entry.loadingTime || '오전  시'}`;
  const unloadDateText = `${formatMonthDay(entry.unloadingDate || entry.loadingDate)} ${entry.unloadingTime || '오후  시'}`;
  const requesterLine = entry.contact
    ? `${entry.requester || ''} / ${entry.contact}`
    : entry.requester || '';
  const pltCount = entry.pltCount ?? 0;
  const hasJig = entry.jigSpec && entry.jigSpec !== '-';
  const weightText = entry.totalWeightKg ? entry.totalWeightKg.toLocaleString() : '  ';
  const bodyType = entry.requestedBodyType || '카고';
  const ton = (entry.requestedTonnage || '').replace('톤', '').trim();
  const vCount = entry.vehicleCount ?? 1;

  return `[선행기술팀 배차 요청] (익일 배차 전일 15:00 마감)
1) 요청자 / 연락처 : ${requesterLine}
2) 희망 상차일시 : ${loadDateText}
3) 희망 하차일시 : ${unloadDateText}
4) 출발지 (업체명 / 주소 / 담당자·연락처) : ${entry.origin || ''}
5) 경유지 (있을 경우 기재, 없으면 생략) : ${entry.waypoints && entry.waypoints !== '-' ? entry.waypoints : '없음'}
6) 도착지 (업체명 / 주소 / 담당자·연락처) : ${entry.destination || ''}
7) 품목 및 적재 물량 (필수 기재) : ${entry.itemName || ''}
  - 부품 (1100×1100 PLT) : ${pltCount} 매 (총 중량 약 ${hasJig ? '' : weightText} kg)
  - 지그·설비 (가로×세로×높이) : ${hasJig ? entry.jigSpec : '-'} mm / ${hasJig ? (entry.jigQty || 1) : 0} 대 (총 중량 약 ${weightText} kg)
8) 차종 / 요청 톤수 : ${bodyType} / ${ton}톤 (${vCount}대) ※ 4 PLT 이하 5톤 요청 불가
9) 상·하차 방식 및 특이사항 : ${entry.loadingMethod || '지게차'}${entry.notes ? ` (${entry.notes})` : ''}`;
}

export function parseKakaoRequestText(raw: string): Partial<DispatchEntry> {
  const lines = raw.split(/\r?\n/).map((l) => l.trim());
  const getAfterColon = (prefixRegex: RegExp): string => {
    const line = lines.find((l) => prefixRegex.test(l));
    if (!line) return '';
    const idx = line.indexOf(':');
    return idx >= 0 ? line.slice(idx + 1).trim() : '';
  };

  const reqVal = getAfterColon(/^1\)/);
  const [requesterRaw, contactRaw] = reqVal.split('/').map((s) => s.trim());

  const parseKoreanDate = (text: string): { date?: string; time?: string } => {
    const dateMatch = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
    const timeMatch = text.match(/(오전|오후)?\s*(\d{1,2})\s*시/);
    let date: string | undefined;
    if (dateMatch) {
      const m = String(Number(dateMatch[1])).padStart(2, '0');
      const d = String(Number(dateMatch[2])).padStart(2, '0');
      const year = new Date().getFullYear();
      date = `${year}-${m}-${d}`;
    }
    const time = timeMatch ? `${timeMatch[1] || '오전'} ${timeMatch[2]}시`.trim() : undefined;
    return { date, time };
  };

  const loadInfo = parseKoreanDate(getAfterColon(/^2\)/));
  const unloadInfo = parseKoreanDate(getAfterColon(/^3\)/));
  const originRaw = getAfterColon(/^4\)/);
  const waypointRaw = getAfterColon(/^5\)/);
  const destRaw = getAfterColon(/^6\)/);
  const itemHeader = getAfterColon(/^7\)/);

  const pltLine = lines.find((l) => /부품/.test(l) && /PLT/i.test(l)) || '';
  const jigLine = lines.find((l) => /지그|설비/.test(l) && /mm/i.test(l)) || '';

  const pltMatch = pltLine.match(/(\d+)\s*매/);
  const pltCount = pltMatch ? Number(pltMatch[1]) : 0;

  const jigDimMatch = jigLine.match(/(\d{3,4})\s*[×xX*]\s*(\d{3,4})\s*[×xX*]\s*(\d{3,4})/);
  const jigSpec = jigDimMatch ? `${jigDimMatch[1]}×${jigDimMatch[2]}×${jigDimMatch[3]}` : '-';
  const jigQtyMatch = jigLine.match(/(\d+)\s*대/);
  const jigQty = jigDimMatch ? (jigQtyMatch ? Number(jigQtyMatch[1]) : 1) : 0;

  const weightMatches = [...raw.matchAll(/약\s*([\d,]+)\s*kg/gi)];
  let totalWeightKg = 0;
  for (const wm of weightMatches) {
    const val = Number(wm[1].replace(/,/g, ''));
    if (Number.isFinite(val)) totalWeightKg += val;
  }
  if (totalWeightKg === 0) {
    const fallbackWeight = raw.match(/([\d,]+)\s*kg/i);
    if (fallbackWeight) totalWeightKg = Number(fallbackWeight[1].replace(/,/g, '')) || 0;
  }

  const line8 = getAfterColon(/^8\)/);
  let requestedBodyType: BodyType = /윙/.test(line8) ? '윙바디' : '카고';
  let requestedTonnage: TonnageClass = '1톤';
  if (/축|플러스/.test(line8)) requestedTonnage = '5톤 축/플러스';
  else if (/5\s*톤/.test(line8)) requestedTonnage = '5톤';
  else if (/3\.5\s*톤/.test(line8)) requestedTonnage = '3.5톤';
  else if (/2\.5\s*톤/.test(line8)) requestedTonnage = '2.5톤';
  else if (/1\s*톤/.test(line8)) requestedTonnage = '1톤';

  const line9 = getAfterColon(/^9\)/);
  let loadingMethod: LoadingMethod = '지게차';
  if (/크레인/.test(line9)) loadingMethod = '크레인';
  else if (/호이스트/.test(line9)) loadingMethod = '호이스트';
  else if (/수작업/.test(line9)) loadingMethod = '수작업';

  let itemCategory: ItemCategory = '부품';
  if (pltCount > 0 && jigSpec !== '-') itemCategory = '혼적';
  else if (jigSpec !== '-') itemCategory = '용접지그';

  const cleanSite = (s: string) => s.split('/')[0].trim();

  return {
    requester: requesterRaw || undefined,
    contact: contactRaw || undefined,
    loadingDate: loadInfo.date,
    loadingTime: loadInfo.time,
    unloadingDate: unloadInfo.date,
    unloadingTime: unloadInfo.time,
    origin: cleanSite(originRaw),
    waypoints:
      !waypointRaw || /^(없음|생략|-)$/i.test(waypointRaw) ? '-' : cleanSite(waypointRaw),
    destination: cleanSite(destRaw),
    itemCategory,
    itemName: itemHeader || (jigSpec !== '-' ? '용접지그 이송' : '부품 이송'),
    pltCount,
    jigSpec,
    jigQty,
    totalWeightKg,
    requestedBodyType,
    requestedTonnage,
    loadingMethod,
    notes: line9,
  };
}

export function generateCarrierBatchOrderText(
  entries: DispatchEntry[],
  targetLoadingDate: string
): string {
  const dayEntries = entries.filter((e) => e.loadingDate === targetLoadingDate);
  if (dayEntries.length === 0) {
    return `[운송사 배차발주방] ${targetLoadingDate} 상차 예정 건이 없습니다.`;
  }

  // Separate primary vehicles vs entries merged into another vehicle
  const primaryEntries = dayEntries.filter((e) => !e.confirmedTonnage.startsWith('합차('));
  const mergedEntries = entries.filter((e) => e.confirmedTonnage.startsWith('합차('));

  const totalVehicles = primaryEntries.reduce((sum, e) => sum + (e.vehicleCount ?? 1), 0);

  const lines: string[] = [
    `[운송사 배차발주] 선행기술팀 일괄 배차 요청 (${targetLoadingDate} 상차분)`,
    `※ 총 발주 차량: ${totalVehicles}대 (합차 통합 ${mergedEntries.filter((m) => primaryEntries.some((p) => doesConsolidatedMatchAnchor(m, p))).length}건 포함)`,
    '----------------------------------------',
  ];

  primaryEntries.forEach((entry, idx) => {
    const attached = mergedEntries.filter((m) => doesConsolidatedMatchAnchor(m, entry));
    const route =
      entry.waypoints && entry.waypoints !== '-'
        ? `${entry.origin} → [경유: ${entry.waypoints}] → ${entry.destination}`
        : `${entry.origin} → ${entry.destination}`;

    const vehicleLabel =
      entry.confirmedTonnage && entry.confirmedTonnage !== '검증대기'
        ? entry.confirmedTonnage
        : formatShortTonnage(entry.requestedTonnage, entry.requestedBodyType);

    const totalPlt = entry.pltCount + attached.reduce((s, a) => s + a.pltCount, 0);
    const totalKg = entry.totalWeightKg + attached.reduce((s, a) => s + a.totalWeightKg, 0);
    const countLabel = `${entry.vehicleCount ?? 1}대`;

    lines.push(
      `[${idx + 1}] ${vehicleLabel} (${countLabel}) / ${entry.loadingTime || '시간협의'} 상차 (${entry.loadingMethod})`
    );
    lines.push(` - 노선: ${route}`);
    lines.push(
      ` - 적재: ${entry.itemName} (PLT ${totalPlt}매${entry.jigSpec !== '-' ? ` + 지그 ${entry.jigSpec}` : ''}, 총 ${totalKg.toLocaleString()}kg)`
    );
    lines.push(` - 담당: ${entry.requester}${entry.contact ? ` (${entry.contact})` : ''}`);

    if (attached.length > 0) {
      attached.forEach((m) => {
        lines.push(
          `   └ [합차 ${formatMonthlyNo(m)}] ${m.itemName} (${m.pltCount}PLT, ${m.totalWeightKg}kg / ${m.requester})`
        );
      });
    }
    if (entry.notes) {
      lines.push(` - 특이사항: ${entry.notes}`);
    }
    lines.push('');
  });

  lines.push('배차 확정 후 차량번호 및 기사님 연락처 회신 부탁드립니다.');
  return lines.join('\n');
}

export function exportDispatchesToCsv(
  entries: DispatchEntry[],
  overlapMap: Record<string, OverlapAnalysis>
): void {
  const headers = [
    'NO',
    '요청일',
    '상차예정일',
    '요청자',
    '품목구분',
    '사용내역(품명)',
    'PLT수량(1100각)',
    '설비·지그규격(장×폭×고 mm)',
    '총중량(kg)',
    '출발지',
    '경유지',
    '도착지',
    '요청톤수',
    '차량대수',
    '권장톤수(자동산출)',
    '확정톤수',
    '중복/합차체크(±1일 자동감지)',
    '비고(절감사유/특이사항)',
  ];

  const escapeCsv = (val: string | number) => {
    const str = String(val ?? '');
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = entries.map((e) => {
    const rec = calculateRecommendedTonnage(
      e.pltCount,
      e.jigSpec,
      e.totalWeightKg,
      e.loadingMethod,
      e.itemName,
      e.jigQty ?? 1
    );
    const overlap = overlapMap[e.id]?.status || '정상';
    return [
      formatMonthlyNo(e),
      e.requestDate,
      e.loadingDate,
      e.requester,
      e.itemCategory,
      e.itemName,
      e.pltCount,
      e.jigSpec,
      e.totalWeightKg,
      e.origin,
      e.waypoints,
      e.destination,
      formatShortTonnage(e.requestedTonnage, e.requestedBodyType),
      `${e.vehicleCount ?? 1}대`,
      rec.recommendedTonnage,
      e.confirmedTonnage,
      overlap,
      e.notes,
    ]
      .map(escapeCsv)
      .join(',');
  });

  const csvContent = '\uFEFF' + [headers.map(escapeCsv).join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `선행기술팀_용차_배차_관리대장_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function getSpecForTonnage(tonnage: TonnageClass) {
  return VEHICLE_SPECS.find((s) => s.tonnage === tonnage) || VEHICLE_SPECS[0];
}
