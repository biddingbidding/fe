/** 실시간 노출 순위 — GET /api/adgroups/{id}/keywords/{kid}/serp. 서버 스키마: SerpRankRead */
import type { Device } from "@/types/ads"

export interface SerpEntry {
  rank: number
  /** 광고에 걸린 사이트 주소 */
  url: string
  /** 이 그룹의 사이트(비즈채널 URL)와 같은 도메인 = 내 광고 */
  mine: boolean
}

export interface SerpRank {
  keywordId: string
  keyword: string
  device: Device
  /** 응답 시각 (ISO) */
  at: string
  /** 순위 순. 파워링크 광고가 없으면 빈 목록 */
  entries: SerpEntry[]
}
