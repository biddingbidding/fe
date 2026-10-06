/** 자동입찰 대기열 "상태" 열의 표시용 — 문구·설명·점 색 */
import type { BidState } from "@/types/ads"

interface BidStateMeta {
  label: string
  /** 툴팁에 붙는 한 줄 설명 */
  description: string
  /** 상태 점 색 (Tailwind 클래스) */
  dotClass: string
}

export const BID_STATE_META: Record<BidState, BidStateMeta> = {
  RUNNING: {
    label: "입찰 중",
    description: "최근 몇 분 안에 검토가 돌았습니다",
    dotClass: "bg-primary",
  },
  WAITING: {
    label: "시작 대기",
    description: "켰지만 아직 첫 검토 전입니다 (보통 1분 안팎)",
    dotClass: "bg-amber-500",
  },
  AD_OFF: {
    label: "광고 꺼짐",
    description: "입찰은 켜져 있지만 네이버에서 광고가 노출되지 않습니다",
    dotClass: "bg-destructive",
  },
  NO_KEYWORDS: {
    label: "키워드 없음",
    description: "입찰은 켜져 있지만 대상 키워드가 없어 검토할 것이 없습니다",
    dotClass: "bg-destructive",
  },
  STOPPED: {
    label: "중지",
    description: "입찰이 꺼져 있습니다",
    dotClass: "bg-muted-foreground/40",
  },
}

/**
 * 입찰은 켜져 있는데(RUNNING) 최근 창 안에 검토가 없었던 그룹 — 요금제 한도 때문에 차례를 기다리는 중.
 * 서버 상태가 아니라 화면에서 최근 검토 시각으로 가른다 (autobid-queue-grid.isActivelyBidding)
 */
export const IDLE_META: BidStateMeta = {
  label: "차례 대기",
  description:
    "입찰은 켜져 있지만 최근 몇 분 안에 검토가 없었습니다. 요금제 한도 안에서 차례가 오면 검토합니다",
  dotClass: "bg-primary/40",
}
