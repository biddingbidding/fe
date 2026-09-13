import type { CustomCellRendererProps } from "ag-grid-react"

import { biddingStateLabel } from "@/lib/bidding-state"
import { cn } from "@/lib/utils"
import type { AdGroup } from "@/types/ads"

/** 입찰 상태 점 + 문구. 파랑(primary): 입찰 중, 회색: 정지 */
export function BiddingState({
  enabled,
  className,
}: {
  enabled: boolean
  className?: string
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        aria-hidden
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          enabled ? "bg-primary" : "bg-muted-foreground/40"
        )}
      />
      <span className={cn(!enabled && "text-muted-foreground")}>
        {biddingStateLabel(enabled)}
      </span>
    </span>
  )
}

/** AG Grid 셀 렌더러 — 그룹 목록·자동입찰 큐 표의 "입찰 상태" 열 */
export function BiddingStateCell<T extends Pick<AdGroup, "autobidEnabled">>({
  data,
}: CustomCellRendererProps<T>) {
  if (!data) return null
  return (
    <div className="flex h-full items-center">
      <BiddingState enabled={data.autobidEnabled} />
    </div>
  )
}
