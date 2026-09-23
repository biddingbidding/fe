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
  /** 대기열 — 자동입찰 큐에 넣어 둔 그룹인지. 큐에 있어도 입찰은 따로 시작해야 돈다 (POST /api/autobid/queue/start) */
  queued: boolean
  /**
   * 입찰 상태 — 이 그룹의 자동입찰이 실제로 돌고 있는지(시작/중지). 한 번도 시작한 적 없으면 false.
   * 우리 엔진이 입찰가를 조정하는지만 뜻하고, 광고 노출과는 무관하다.
   */
  autobidEnabled: boolean
  /**
   * 광고 상태 — 네이버 기준으로 이 그룹의 광고가 노출될 수 있는지.
   * 네이버 광고그룹 status 가 ELIGIBLE | LIMITED_ELIGIBLE 이고 userLock(사용자 OFF)이 아니면 true. 읽기 전용(네이버에서만 변경)
   */
  adActive: boolean
  /**
   * 광고가 노출되지 않는 이유 — 네이버 statusReason 그대로 (GROUP_PAUSED, CAMPAIGN_PAUSED,
   * CAMPAIGN_LIMITED_BY_BUDGET, BUSINESS_CHANNEL_UNDER_REVIEW …). 노출 중이거나 네이버가 안 주면 null
   */
  adStatusReason: string | null
  /**
   * 노출 지역 — 네이버 광고 그룹의 지역 타겟이 시/도 하나면 그 code (GET /api/regions).
   * 제한 없음(전체 노출)·여러 지역·지역 타겟 없음이면 null
   */
  region: string | null
  /** 표시용 지역 이름 ("서울"). region 이 null 이면 null */
  regionName: string | null
  /** 예상 입찰가를 조회할 기기. 항상 값이 있고, 설정한 적 없는 그룹은 PC */
  device: Device
  /** 우선순위. 미입력이면 null (보통으로 동작) */
  priority: Priority | null
  /**
   * 가감액 1단계 — 켜면 한 번 검토에 가감액을 1회만 더하거나 뺀다.
   * 기본(false)은 순위차(|현재순위 − 희망순위|)만큼 곱해 한 번에 움직인다.
   */
  singleStep: boolean
  /**
   * 순위확인지역 — 어느 지역에서 검색했을 때의 순위를 볼지. GET /api/regions/rank 의 code
   * (법정동코드 10자리, 시/도 또는 시/군/구). 미설정이면 null. 노출 지역(region)과는 별개
   */
  rankRegion: string | null
  /** 표시용 전체 이름 ("서울특별시 송파구"). 미설정이거나 목록에 없는 code 면 null */
  rankRegionName: string | null
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

/** 순위확인지역의 시/군/구 하나. 서버 스키마: RankDistrictRead */
export interface RankDistrict {
  /** 법정동코드 10자리 (예: 1171000000) */
  code: string
  /** 시/도를 뗀 이름 (예: 송파구, 수원시 장안구) */
  name: string
}

/** 순위확인지역으로 고를 수 있는 시/도와 그 아래 시/군/구 — GET /api/regions/rank 항목. 서버 스키마: RankRegionRead */
export interface RankRegion {
  /** 법정동코드 10자리 (예: 1100000000). 이 code 를 고르면 시/도 전체 */
  code: string
  /** 공식 이름 (예: 서울특별시) */
  name: string
  /** 법정동코드 순. 세종특별자치시는 비어 있다 */
  districts: RankDistrict[]
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
  Pick<AdGroupSetting, "device" | "priority" | "rankRegion" | "singleStep">
>

/** PUT /api/adgroups/settings (모든 그룹에 적용) 응답 */
export interface AdGroupSettingApplyResult {
  /** 값이 저장된 그룹 수 */
  updated: number
}

/** 광고 그룹 설정 — PATCH /api/adgroups/{id}/settings 응답. 서버 스키마: AdGroupSettingRead */
export interface AdGroupSetting {
  adGroupId: string
  device: Device
  priority: Priority | null
  singleStep: boolean
  rankRegion: string | null
  rankRegionName: string | null
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

/**
 * 엔진이 이 키워드를 마지막으로 처리한 결과 (keyword_states 한 행). 서버 스키마: AutobidState
 * 자동입찰 대상으로 등록된 키워드에만 있다 — GET .../keywords?autobidOnly=true 는 이 값이 있는 키워드만 준다.
 */
export interface AutobidState {
  /** 마지막 검토 시각 (ISO). 아직 한 번도 검토되지 않았으면 null */
  lastRunAt: string | null
  /** 마지막으로 계산한 입찰가 (원) */
  lastBid: number | null
  /** 마지막 검토 결과 사유 */
  lastReason: string | null
  /** 마지막으로 네이버에 입찰가를 보낸 시각 (ISO) */
  lastSentAt: string | null
  /**
   * 마지막 검토에서 결정한 입찰가의 예상 순위. 네이버 예상 입찰가로 추정한 값이지 실제 노출 순위가 아니다.
   * 순위 추정이 꺼져 있거나 예상가를 못 받았으면 null. lastMaxPosition + 1 이면 순위 밖
   */
  lastRank: number | null
  /** 그때 기기의 순위 축 끝 (PC 10 · 모바일 5). lastRank 가 null 이면 null */
  lastMaxPosition: number | null
  /** 다음 검토 예정 시각 (ISO) */
  nextRunAt: string | null
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
  /** 자동입찰 진행 상태. 자동입찰 대상이 아니면 null */
  autobid: AutobidState | null
}

// ── 자동입찰 큐 — /api/autobid/* ──────────────────────────────

/**
 * 자동입찰 큐의 한 항목 = 큐에 넣은 광고 그룹 + 입찰 상태(autobidEnabled) + 진행 상황.
 * GET /api/adgroups 와 같은 순서·필드로 온다. 서버 스키마: AutobidQueueItem
 */
/**
 * 서버가 판단한 그룹의 입찰 상태. 서버 스키마: AutobidQueueItem.bidState
 * - RUNNING: 켠 뒤 검토가 한 번 이상 돌았다
 * - WAITING: 켰지만 아직 첫 검토 전 (보통 1분 안팎)
 * - NO_KEYWORDS: 켰지만 대상 키워드가 없어 할 일이 없다
 * - AD_OFF: 켰지만 네이버에서 광고가 노출되지 않는다 (엔진은 그대로 검토한다)
 * - STOPPED: 중지
 */
export type BidState =
  "RUNNING" | "WAITING" | "NO_KEYWORDS" | "AD_OFF" | "STOPPED"

export interface AutobidQueueItem extends AdGroup {
  /** 자동입찰 대상으로 등록된 키워드 수 */
  targetKeywords: number
  /** 그중 한 번 이상 검토된 키워드 수 */
  processedKeywords: number
  /** 이 그룹에서 가장 최근에 검토한 시각 (ISO, 입찰가를 유지한 검토 포함). 아직 없으면 null */
  lastRunAt: string | null
  /** 이 그룹에서 가장 최근에 네이버로 입찰가를 실제로 보낸 시각 (ISO). 바꾼 적 없으면 null */
  lastSentAt: string | null
  /** 서버가 판단한 입찰 상태 */
  bidState: BidState
  /**
   * 다음 검토 가능 시각 (ISO) — 키워드 중 가장 이른 "마지막 검토 + 우선순위 최소 대기".
   * 워커 주기·요금제 한도 때문에 실제 검토는 더 늦을 수 있다. STOPPED·NO_KEYWORDS 면 null
   */
  nextRunAt: string | null
}

/** 큐 넣기·입찰 시작 응답의 그룹별 결과. 서버 스키마: AutobidQueueOpItem */
export interface AutobidQueueOpItem {
  adGroupId: string
  ok: boolean
  /** 실패 사유 (계정에 없는 그룹, 네이버 키워드 조회 실패 등) */
  error: string | null
  /** 입찰 시작 시 등록된 대상 키워드 수 (큐 넣기에서는 0) */
  targetKeywords: number
}

/** POST /api/autobid/queue, POST /api/autobid/queue/start 응답 — 그룹마다 따로 처리되므로 일부만 실패할 수 있다 */
export interface AutobidQueueOpResult {
  items: AutobidQueueOpItem[]
  /** 성공한 그룹 수 */
  applied: number
}

/** DELETE /api/autobid/queue, POST /api/autobid/queue/stop 응답. 없거나 이미 그 상태인 그룹은 세지 않는다 */
export interface AutobidQueueCountResult {
  count: number
}

/** 계정 단위 자동입찰 현황 (화면 상단 배지) — GET /api/autobid/status. 서버 스키마: AutobidStatus */
export interface AutobidStatus {
  /** 요금제 코드 */
  plan: string
  planName: string
  /** 워커 한 주기에 검토하는 키워드 수 (요금제 한도) */
  keywordsPerCycle: number
  /** 워커 주기 (초) */
  intervalSeconds: number
  /** 큐(대기열)에 있는 그룹 수 */
  queuedGroups: number
  /** 입찰 중(시작된) 그룹 수 */
  enabledGroups: number
  targetKeywords: number
  processedKeywords: number
  /** 계정에서 가장 최근에 검토한 시각 (ISO) */
  lastRunAt: string | null
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
