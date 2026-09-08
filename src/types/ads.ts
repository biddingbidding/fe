/** 예상 입찰가를 조회할 기기 */
export type Device = "PC" | "MOBILE"

/**
 * 광고 그룹 우선순위 — 그 그룹 키워드를 한 번 살펴본 뒤 최소 대기(HIGH 90초 / NORMAL 180초 / LOW 600초).
 * 요금제 한도가 모자라면 대기 대비 오래 기다린 키워드부터 검토하므로 높을수록 자주 검토된다.
 */
export type Priority = "HIGH" | "NORMAL" | "LOW"

export interface AdGroup {
  /** nccAdgroupId */
  id: string
  /** nccCampaignId */
  campaignId: string
  campaignName: string
  name: string
  siteUrl: string
  /** 이 그룹의 자동입찰 on/off. 한 번도 켠 적 없으면 false */
  autobidEnabled: boolean
  /**
   * 노출 지역 — 네이버 광고 그룹의 지역 타겟이 시/도 하나면 그 code (GET /api/regions).
   * 제한 없음(전체 노출)·여러 지역·지역 타겟 없음이면 null
   */
  region: string | null
  /** 표시용 지역 이름 ("서울"). region 이 null 이면 null */
  regionName: string | null
  /** 예상 입찰가를 조회할 기기. 미입력이면 null (서버 기본값 사용) */
  device: Device | null
  /** 우선순위. 미입력이면 null (보통으로 동작) */
  priority: Priority | null
  /** 이 그룹이 담긴 모음(GET /api/collections) id 목록 — 모음 표시 순서. 보기용 */
  collectionIds: string[]
}

/**
 * 광고 그룹 모음 — 그룹을 원하는 기준으로 모아 보는 보기용 묶음 (즐겨찾기).
 * 자동입찰 값과 무관하며, 계정(customerId) 단위로 저장된다. 서버 스키마: CollectionRead
 */
export interface Collection {
  id: string
  /** 1~50자, 계정 안에서 유일 */
  name: string
  /** 표시 색. lib/collection 의 팔레트 키 또는 null */
  color: string | null
  /** 표시 순서 (0부터) */
  sortOrder: number
  /** 담긴 그룹 id — 담은 순서 */
  adGroupIds: string[]
  createdAt: string
  updatedAt: string
}

/** POST /api/collections. adGroupIds 를 주면 만들면서 바로 담는다. 서버 스키마: CollectionCreate */
export interface CollectionCreate {
  name: string
  color?: string | null
  adGroupIds?: string[]
}

/** PATCH /api/collections/{id}. 보낸 필드만 갱신, color 에 null 이면 색 제거. 서버 스키마: CollectionPatch */
export interface CollectionPatch {
  name?: string
  color?: string | null
  sortOrder?: number
}

/** 노출 지역으로 고를 수 있는 시/도 — GET /api/regions 항목. 서버 스키마: RegionRead */
export interface Region {
  /** API 계약값 (예: SEOUL) */
  code: string
  /** 표시용 (예: 서울) */
  name: string
}

/** PUT /api/adgroups/region (모든 그룹에 적용) 응답 */
export interface AdGroupRegionBulkResult {
  region: string | null
  regionName: string | null
  /** 실제로 바뀐 그룹 수 (지역 타겟이 없는 그룹은 제외) */
  adGroups: number
}

/** 그룹 설정 중 사용자가 바꾸는 값. 서버 스키마: AdGroupSettingPatch / AdGroupSettingApplyAll (보낸 필드만 반영) */
export type AdGroupSettingPatch = Partial<
  Pick<AdGroupSetting, "device" | "priority">
>

/** PUT /api/adgroups/settings (모든 그룹에 적용) 응답 */
export interface AdGroupSettingApplyResult {
  /** 값이 저장된 그룹 수 */
  updated: number
}

/** 광고 그룹 설정 — PATCH /api/adgroups/{id}/settings 응답. 서버 스키마: AdGroupSettingRead */
export interface AdGroupSetting {
  adGroupId: string
  device: Device | null
  priority: Priority | null
  /** 마지막 저장 시각 (ISO) */
  updatedAt: string
}

/**
 * 키워드별 자동입찰 설정 (사용자 입력값). 세 값 모두 미입력이면 null.
 * 서버 스키마: BidSettingRead
 */
export interface BidSetting {
  /** nccKeywordId */
  keywordId: string
  /** 희망순위 */
  targetRank: number | null
  /** 입찰가 한도 (원) */
  maxBid: number | null
  /** 가감액 (원/회) */
  bidAdjust: number | null
  /** 마지막 저장 시각 (ISO) */
  updatedAt: string
}

/** 사용자가 입력하는 세 값. 서버 스키마: BidSettingPatch / BidSettingItem 의 값 부분 */
export type BidSettingValues = Pick<
  BidSetting,
  "targetRank" | "maxBid" | "bidAdjust"
>

/**
 * 키워드 통계 집계 기간 (네이버 datePreset) — GET /api/adgroups/{id}/keywords?period=
 * 서버는 since/until(YYYY-MM-DD, KST) 로 임의 기간도 받는다. 그 경우 period 는 무시된다.
 */
export type StatsPeriod =
  | "today"
  | "yesterday"
  | "last7days"
  | "last30days"
  | "lastweek"
  | "lastmonth"
  | "lastquarter"

/**
 * 키워드 기간 통계 — 네이버 GET /stats 가 주는 키워드 통계 전부.
 * 실시간이 아니라 네이버 집계(수 시간 지연)이며 period 기준.
 * 카운트/금액은 실적이 없으면 0, 비율/평균(순위·CPC·전환율·ROAS 등)은 네이버가 주지 않으면 null.
 * 서버 스키마: KeywordStats
 */
export interface KeywordStats {
  period: string
  /** 네이버 집계 시각 (ISO). 모르면 null */
  updatedAt: string | null
  /** 노출수 */
  impressions: number
  /** 클릭수 */
  clicks: number
  /** 비용 (원) */
  cost: number
  /** 클릭률. 노출이 없으면 null */
  ctr: number | null
  /** 클릭당 비용 (원). 클릭이 없으면 null */
  cpc: number | null
  /** 기간 평균 노출 순위. 노출이 없으면 null */
  avgRank: number | null
  /** 최근 평균 노출 순위 */
  recentAvgRank: number | null
  /** 최근 평균 CPC (원) */
  recentAvgCpc: number | null
  /** PC 평균 노출 순위 */
  pcAvgRank: number | null
  /** 모바일 평균 노출 순위 */
  mobileAvgRank: number | null
  /** 전환수 */
  conversions: number
  /** 전환율 */
  conversionRate: number | null
  /** 전환 매출 (원) */
  conversionAmount: number
  /** 광고수익률 */
  roas: number | null
  /** 전환당 비용 (원) */
  costPerConversion: number | null
  /** 구매 전환수 */
  purchaseConversions: number
  /** 구매 전환 매출 (원) */
  purchaseConversionAmount: number
  /** 구매 ROAS */
  purchaseRoas: number | null
  /** 동영상 조회수 */
  videoViews: number
}

/** 광고 그룹에 등록된 키워드 (네이버 실시간 조회 + 사용자 설정·기간 통계 병합) — GET /api/adgroups/{id}/keywords */
export interface AdGroupKeyword {
  /** nccKeywordId */
  id: string
  adGroupId: string
  campaignId: string | null
  customerId: string | null
  keyword: string
  /** 키워드 입찰가 (원) */
  bidAmt: number
  /** true 면 bidAmt 대신 그룹 기본 입찰가 사용 */
  useGroupBidAmt: boolean
  /** ELIGIBLE / PAUSED / DELETED … */
  status: string
  statusReason: string | null
  /** 검수 상태: APPROVED / UNDER_REVIEW / LIMITED … */
  inspectStatus: string | null
  /** true 면 사용자가 OFF 한 상태 */
  userLock: boolean
  /** 품질지수 1~7 */
  qualityIndex: number | null
  links: Record<string, unknown> | null
  /** 등록 시각 (ISO) */
  regTm: string | null
  /** 수정 시각 (ISO) */
  editTm: string | null
  /** 현재 노출 가능 여부 (네이버 기준) */
  exposable: boolean
  /** 사용자 자동입찰 설정. 한 번도 입력하지 않았거나 초기화했으면 null */
  bidSetting: BidSetting | null
  /** 기간 통계. 통계 조회가 실패하면 null (목록은 정상) */
  stats: KeywordStats | null
}

export interface AccountCredentials {
  apiKey: string
  secretKey: string
  customerId: string
}

export interface Account {
  customerId: string
  /** 표시용 로그인 ID (customer-links 에서 조회, 없으면 customerId) */
  loginId: string
  /** 비즈머니 잔액. 조회 실패 시 null */
  balance: number | null
  /** 기간 소진액. 아직 미구현 */
  spent: number | null
  updatedAt: string
}

export interface SyncResult {
  campaigns: number
  adGroups: number
  syncedAt: string
}
