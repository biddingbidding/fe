/** 키워드 입찰 기록(그래프·표) — /api/adgroups/{id}/keywords/{kid}/bid-logs */
import type { BidLogDay } from "@/types/bid-log"

import { request } from "./client"

/** 키워드 하나의 하루치(한국 날짜) 검토 기록. date 를 빼면 오늘 */
export const getKeywordBidLogs = (
  adGroupId: string,
  keywordId: string,
  date: string
) =>
  request<BidLogDay>(
    "GET",
    `/api/adgroups/${encodeURIComponent(adGroupId)}/keywords/${encodeURIComponent(keywordId)}/bid-logs?date=${encodeURIComponent(date)}`
  )
