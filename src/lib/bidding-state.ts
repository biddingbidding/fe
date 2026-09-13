/** 입찰 상태(autobidEnabled) 표시 문구 — 큐 소속(queued)과는 별개로, 엔진이 실제로 입찰가를 조정 중인지 */
export const BIDDING_ON_LABEL = "입찰 중"
export const BIDDING_OFF_LABEL = "정지"

/** 표 정렬·툴팁·검색용 문구 */
export const biddingStateLabel = (enabled: boolean) =>
  enabled ? BIDDING_ON_LABEL : BIDDING_OFF_LABEL
