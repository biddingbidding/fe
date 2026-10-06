import { useQuery } from "@tanstack/react-query"

import * as api from "@/lib/api"
import { queryKeys } from "@/lib/query-keys"
import type { Device } from "@/types/ads"

/**
 * 키워드의 실시간 노출 순위(네이버 검색 결과 파워링크). 다이얼로그가 열려 있는 동안만 조회한다.
 * refreshCount 는 새로고침 버튼을 누른 횟수 — 0 이면 서버 캐시(60초)를 쓰고, 그 뒤로는 fresh=true 로 지금 다시 읽는다.
 */
export function useKeywordSerpRank(
  adGroupId: string,
  keywordId: string,
  device: Device,
  refreshCount: number
) {
  return useQuery({
    queryKey: [
      ...queryKeys.keywordSerp(adGroupId, keywordId, device),
      refreshCount,
    ],
    queryFn: () =>
      api.getKeywordSerpRank(adGroupId, keywordId, device, refreshCount > 0),
    staleTime: Infinity,
    retry: false,
  })
}
