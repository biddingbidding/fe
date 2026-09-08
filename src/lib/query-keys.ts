import type { StatsPeriod } from "@/types/ads"

export const queryKeys = {
  me: ["me"] as const,
  adGroups: (customerId: string) => ["adGroups", customerId] as const,
  /** 광고 그룹 모음(즐겨찾기). 계정 단위 */
  collections: (customerId: string) => ["collections", customerId] as const,
  /** 시/도 목록. 계정과 무관한 고정 데이터 */
  regions: ["regions"] as const,
  /** period 를 빼면 해당 그룹의 모든 기간 키워드 쿼리에 매칭 (무효화용) */
  adGroupKeywords: (adGroupId: string, period?: StatsPeriod) =>
    period
      ? (["adGroupKeywords", adGroupId, period] as const)
      : (["adGroupKeywords", adGroupId] as const),
}
