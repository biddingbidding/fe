import { useQuery } from "@tanstack/react-query"

import * as api from "@/lib/api"
import { todayKst } from "@/lib/kst-date"
import { queryKeys } from "@/lib/query-keys"

/** 워커 주기(60초)에 맞춘 재조회 간격 — 오늘 기록을 볼 때만 */
const BID_LOG_REFETCH_MS = 60_000

/** 키워드 하나의 하루치 입찰 기록. 오늘이면 60초마다 새 검토를 받아온다 */
export function useKeywordBidLogs(
  adGroupId: string,
  keywordId: string,
  date: string
) {
  const isToday = date === todayKst()
  return useQuery({
    queryKey: queryKeys.keywordBidLogs(adGroupId, keywordId, date),
    queryFn: () => api.getKeywordBidLogs(adGroupId, keywordId, date),
    // 지난 날짜 기록은 바뀌지 않는다
    staleTime: isToday ? 30_000 : Infinity,
    refetchInterval: isToday ? BID_LOG_REFETCH_MS : false,
  })
}
