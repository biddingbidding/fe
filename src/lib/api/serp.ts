/** 실시간 노출 순위(네이버 검색 결과 파워링크) — /api/adgroups/{id}/keywords/{kid}/serp */
import type { Device } from "@/types/ads"
import type { SerpRank } from "@/types/serp"

import { request } from "./client"

/** 키워드의 지금 파워링크 순위. device 를 빼면 그룹의 기기 설정, fresh 면 서버 캐시(60초)를 건너뛴다 */
export const getKeywordSerpRank = (
  adGroupId: string,
  keywordId: string,
  device?: Device,
  fresh = false
) => {
  const params = new URLSearchParams()
  if (device) params.set("device", device)
  if (fresh) params.set("fresh", "true")
  const qs = params.toString()
  return request<SerpRank>(
    "GET",
    `/api/adgroups/${encodeURIComponent(adGroupId)}/keywords/${encodeURIComponent(keywordId)}/serp${qs ? `?${qs}` : ""}`
  )
}
