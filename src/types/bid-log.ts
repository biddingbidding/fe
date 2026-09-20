/**
 * 키워드 입찰 기록 — GET /api/adgroups/{id}/keywords/{kid}/bid-logs. 서버 스키마: BidLogDay / BidLogItem
 * 자동입찰 엔진이 키워드를 한 번 검토할 때마다 한 줄 (입찰가를 유지한 검토 포함).
 */

/** 엔진이 키워드를 한 번 검토한 기록 */
export interface BidLogItem {
  /** 검토 시각 (ISO, UTC) */
  at: string
  /** 예상가·순위 기준 기기 */
  device: "PC" | "MOBILE"
  /** 예상 순위 축의 끝 (PC 10 · 모바일 5). rank 가 maxPosition + 1 이면 순위 밖 */
  maxPosition: number
  /** 그때의 희망순위 (그래프의 목표범위 = 희망 ±1) */
  targetRank: number
  /** 그때의 입찰가 한도 (원) */
  maxBid: number
  /** 검토 시점의 네이버 입찰가 (원) */
  prevBid: number
  /** 결정한 입찰가 (원). 유지면 prevBid 와 같다 */
  newBid: number
  /** 희망순위에 노출되는 데 필요한 예상 입찰가. 못 받았으면 null */
  estimatedBid: number | null
  /**
   * 예상 순위 — 네이버 예상 입찰가로 추정한 값이지 실제 노출 순위가 아니다.
   * rank 는 prevBid, newRank 는 newBid 기준. maxPosition + 1 이면 순위 밖, 모르면 null
   */
  rank: number | null
  newRank: number | null
  action: "raise" | "lower" | "hold"
  /** 네이버에 실제로 전송 성공 */
  sent: boolean
  /** 결정 사유 (예: "예상 500 > 현재 300 → +50") */
  reason: string
}

export interface BidLogDay {
  keywordId: string
  /** 조회한 날짜 YYYY-MM-DD (한국 날짜) */
  date: string
  /** 기록 보관 일수 — 이보다 오래된 날짜는 비어 있다 */
  retentionDays: number
  /** 시각 순 (오래된 것부터) */
  items: BidLogItem[]
}
