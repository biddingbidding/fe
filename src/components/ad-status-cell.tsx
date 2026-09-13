import type { CustomCellRendererProps } from "ag-grid-react"

import {
  adStatusReasonLabel,
  AD_ACTIVE_LABEL,
  AD_INACTIVE_LABEL,
} from "@/lib/ad-status"
import { cn } from "@/lib/utils"
import type { AdGroup } from "@/types/ads"

/** 광고 상태 점 + 문구. 초록: 노출 가능, 회색: 중지(사유가 있으면 옆에 흐리게) */
export function AdStatus({
  group,
  className,
}: {
  group: Pick<AdGroup, "adActive" | "adStatusReason">
  className?: string
}) {
  const reason = group.adActive
    ? null
    : adStatusReasonLabel(group.adStatusReason)
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <span
        aria-hidden
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          group.adActive ? "bg-emerald-500" : "bg-muted-foreground/40"
        )}
      />
      <span
        className={cn("truncate", !group.adActive && "text-muted-foreground")}
      >
        {group.adActive ? AD_ACTIVE_LABEL : AD_INACTIVE_LABEL}
      </span>
      {reason && (
        <span className="truncate text-xs text-muted-foreground">{reason}</span>
      )}
    </span>
  )
}

/** AG Grid 셀 렌더러 — 그룹 목록·자동입찰 큐 표의 "광고 상태" 열. 툴팁은 컬럼의 tooltipValueGetter 로 */
export function AdStatusCell<
  T extends Pick<AdGroup, "adActive" | "adStatusReason">,
>({ data }: CustomCellRendererProps<T>) {
  if (!data) return null
  return (
    <div className="flex h-full min-w-0 items-center">
      <AdStatus group={data} />
    </div>
  )
}
