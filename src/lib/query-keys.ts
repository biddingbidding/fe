import type { StatsPeriod } from "@/types/ads"

export const queryKeys = {
  me: ["me"] as const,
  adGroups: (customerId: string) => ["adGroups", customerId] as const,
  /** 광고 그룹 모음(즐겨찾기). 계정 단위 */
  collections: (customerId: string) => ["collections", customerId] as const,
  /** 시/도 목록. 계정과 무관한 고정 데이터 */
  regions: ["regions"] as const,
  /** 순위확인지역(시/도 + 시/군/구) 목록. 계정과 무관한 고정 데이터 */
  rankRegions: ["rankRegions"] as const,
  /**
   * 그룹의 키워드 목록. period·autobidOnly 를 빼면 해당 그룹의 모든 키워드 쿼리에 매칭 (무효화·낙관적 갱신용).
   * autobidOnly 는 자동입찰 대상 키워드만 받는 자동 입찰 페이지용 변형 — 같은 그룹이라도 행 집합이 달라 키를 나눈다.
   */
  adGroupKeywords: (
    adGroupId: string,
    options?: { period: StatsPeriod; autobidOnly: boolean }
  ) =>
    options
      ? ([
          "adGroupKeywords",
          adGroupId,
          options.period,
          options.autobidOnly ? "autobid" : "all",
        ] as const)
      : (["adGroupKeywords", adGroupId] as const),
  /** 자동입찰 큐 (켜진 그룹 목록 + 진행 상황) */
  autobidQueue: (customerId: string) => ["autobidQueue", customerId] as const,
  /** 계정 단위 자동입찰 현황 배지 */
  autobidStatus: (customerId: string) => ["autobidStatus", customerId] as const,
  /** 키워드 하나의 하루치(한국 날짜) 입찰 기록 */
  keywordBidLogs: (adGroupId: string, keywordId: string, date: string) =>
    ["keywordBidLogs", adGroupId, keywordId, date] as const,
}
