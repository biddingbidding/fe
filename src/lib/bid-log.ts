import type { BidLogItem } from "@/types/bid-log"

export const ACTION_LABEL: Record<BidLogItem["action"], string> = {
  raise: "올림",
  lower: "내림",
  hold: "유지",
}

/** 예상 순위 표시. 최대 순위보다 크면 "순위 밖", 모르면 "-" */
export function formatRank(rank: number | null, maxPosition: number) {
  if (rank == null) return "-"
  return rank > maxPosition ? "순위 밖" : `${rank}위`
}
