/**
 * 광고 상태(adActive / adStatusReason) 표시용 — 네이버 광고그룹 statusReason 코드를 한국어로.
 * 모르는 코드는 원문 그대로 보인다 (네이버가 새 코드를 추가할 수 있다).
 */
import type { AdGroup } from "@/types/ads"

export const AD_ACTIVE_LABEL = "노출 중"
export const AD_INACTIVE_LABEL = "중지"

const REASON_LABELS: Record<string, string> = {
  GROUP_PAUSED: "그룹 OFF",
  GROUP_OFF: "그룹 OFF",
  GROUP_LIMITED_BY_BUDGET: "그룹 예산 초과",
  CAMPAIGN_PAUSED: "캠페인 OFF",
  CAMPAIGN_OFF: "캠페인 OFF",
  CAMPAIGN_LIMITED_BY_BUDGET: "캠페인 예산 초과",
  CAMPAIGN_PENDING: "캠페인 시작 전",
  CAMPAIGN_EXPIRED: "캠페인 기간 종료",
  CAMPAIGN_DELETED: "캠페인 삭제됨",
  BUSINESS_CHANNEL_UNDER_REVIEW: "비즈채널 검수 중",
  BUSINESS_CHANNEL_DENIED: "비즈채널 검수 반려",
  BUSINESS_CHANNEL_PAUSED: "비즈채널 OFF",
  ACCOUNT_LIMITED_BY_BUDGET: "계정 예산 초과",
  ACCOUNT_PAUSED: "계정 OFF",
  ACCOUNT_INSUFFICIENT_BALANCE: "비즈머니 부족",
}

/** statusReason 코드 → 표시 문구. 코드가 없으면 null */
export function adStatusReasonLabel(reason: string | null | undefined) {
  if (!reason) return null
  return REASON_LABELS[reason] ?? reason
}

/** 상태 셀·배지 한 줄 문구: "노출 중" / "중지 · 캠페인 OFF" */
export function adStatusLabel(
  group: Pick<AdGroup, "adActive" | "adStatusReason">
) {
  if (group.adActive) return AD_ACTIVE_LABEL
  const reason = adStatusReasonLabel(group.adStatusReason)
  return reason ? `${AD_INACTIVE_LABEL} · ${reason}` : AD_INACTIVE_LABEL
}
