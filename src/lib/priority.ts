/**
 * 광고 그룹 우선순위(Priority) 표시용 상수 — null 은 미입력(보통으로 동작).
 * 서버가 우선순위별 최소 대기(높음 90초 / 보통 180초 / 낮음 600초)를 정하므로 초 단위는 여기서 다루지 않는다.
 */
import type { Priority } from "@/types/ads"

export const PRIORITY_OPTIONS: { value: Priority | null; label: string }[] = [
  { value: null, label: "미입력" },
  { value: "HIGH", label: "높음" },
  { value: "NORMAL", label: "보통" },
  { value: "LOW", label: "낮음" },
]

export function priorityLabel(priority: Priority | null | undefined): string {
  return (
    PRIORITY_OPTIONS.find((o) => o.value === (priority ?? null))?.label ?? ""
  )
}
