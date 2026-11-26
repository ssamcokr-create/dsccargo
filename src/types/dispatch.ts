export type TonnageClass = '1톤' | '2.5톤' | '3.5톤' | '5톤' | '5톤 축/플러스';

export type BodyType = '카고' | '윙바디';

export type ItemCategory = '부품' | '용접지그' | '혼적' | '설비' | '기타';

export type LoadingMethod = '지게차' | '호이스트' | '크레인' | '수작업';

export interface JigDimensions {
  length: number;
  width: number;
  height: number;
}

export interface VehicleSpec {
  tonnage: TonnageClass;
  innerLengthMm: number;
  innerLengthLabel: string;
  innerWidthMm: number;
  bedLabel: string;
  maxPltMin: number;
  maxPltMax: number;
  maxPltLabel: string;
  arrangement: string;
  rows: 1 | 2;
  maxWeightKg: number;
  weightLabel: string;
  jigCriteria: string;
  bodyPrinciple: string;
}

export interface SopStep {
  stepNumber: number;
  title: string;
  timeWindow: string;
  channelOwner: string;
  coreAction: string;
  blockPoint: string;
}

export interface DispatchEntry {
  id: string;
  no: number;
  requestDate: string;      // YYYY-MM-DD
  loadingDate: string;      // YYYY-MM-DD (상차예정일)
  loadingTime?: string;     // e.g. '오전 09시'
  unloadingDate?: string;   // YYYY-MM-DD
  unloadingTime?: string;   // e.g. '오후 02시'
  requester: string;        // e.g. '이찬호 매니저'
  contact?: string;         // 연락처
  itemCategory: string;
  itemName: string;         // 사용내역(품명)
  pltCount: number;         // PLT수량 (1100각)
  jigSpec: string;          // 설비·지그규격 (장×폭×고 mm) or '-'
  jigQty?: number;          // 지그 대수 (default 1 when jigSpec !== '-')
  totalWeightKg: number;    // 총중량 (kg)
  origin: string;           // 출발지
  waypoints: string;        // 경유지 or '-'
  destination: string;      // 도착지
  requestedTonnage: string;
  requestedBodyType: string;
  vehicleCount?: number;
  confirmedTonnage: string; // e.g. '3.5톤 윙', '합차(NO.1)', '1톤 카고', or '검증대기'
  loadingMethod: string;
  isUrgentException?: boolean;
  urgentApprover?: string;
  notes: string;            // 비고(절감사유/특이사항)
}

export interface RecommendationResult {
  recommendedTonnage: TonnageClass;
  exceedsMaxSpec: boolean;
  reason: string;
  suggestedBodyType: BodyType;
  bodyReason: string;
  pltFitsIn1Row: boolean;
}

export interface ValidationIssue {
  level: 'error' | 'warning' | 'info';
  code: 'OVER_TONNAGE_4PLT' | 'DOWNSIZE_AVAILABLE' | 'HOIST_CARGO_REQUIRED' | 'SPEC_EXCEEDED' | 'URGENT_CUTOFF';
  message: string;
}

export type OverlapStatus = '정상' | '합차완료' | '합차권장' | '중복주의';

export interface OverlapCandidate {
  targetId: string;
  targetNo: number;
  targetLoadingDate: string;
  targetRequester: string;
  targetRoute: string;
  dayDiff: number;
  matchType: 'exact_route' | 'waypoint_route' | 'adjacent_date';
  suggestion: string;
}

export interface OverlapAnalysis {
  status: OverlapStatus;
  candidates: OverlapCandidate[];
}
