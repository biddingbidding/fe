/** 자동입찰 대기열의 입찰 상태(BidState) 표시용 — 문구·설명·행 강조 클래스 */
import type { BidState } from "@/types/ads"

interface BidStateMeta {
  label: string
  /** 툴팁에 붙는 한 줄 설명 */
  description: string
  /** 상태 점 색 (Tailwind 클래스) */
  dotClass: string
  /** 대기열 표 행에 붙일 강조 클래스 (index.css). 중지면 강조하지 않는다 */
  rowClass: string | null
}

export const BID_STATE_META: Record<BidState, BidStateMeta> = {
  RUNNING: {
    label: "입찰 중",
    description: "켠 뒤 검토가 돌고 있습니다",
    dotClass: "bg-primary",
    rowClass: "bid-row-running",
  },
  WAITING: {
    label: "시작 대기",
    description: "켰지만 아직 첫 검토 전입니다 (보통 1분 안팎)",
    dotClass: "bg-amber-500",
    rowClass: "bid-row-waiting",
  },
  AD_OFF: {
    label: "광고 꺼짐",
    description: "입찰은 켜져 있지만 네이버에서 광고가 노출되지 않습니다",
    dotClass: "bg-destructive",
    rowClass: "bid-row-warning",
  },
  NO_KEYWORDS: {
    label: "키워드 없음",
    description: "입찰은 켜져 있지만 대상 키워드가 없어 검토할 것이 없습니다",
    dotClass: "bg-destructive",
    rowClass: "bid-row-warning",
  },
  STOPPED: {
    label: "중지",
    description: "입찰이 꺼져 있습니다",
    dotClass: "bg-muted-foreground/40",
    rowClass: null,
  },
}
