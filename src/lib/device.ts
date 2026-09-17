/** 광고 그룹의 기기(Device) 표시용 상수 — 서버는 항상 PC | MOBILE 을 준다 (미입력 없음, 기본 PC) */
import type { Device } from "@/types/ads"

export const DEVICE_OPTIONS: { value: Device; label: string }[] = [
  { value: "PC", label: "PC" },
  { value: "MOBILE", label: "모바일" },
]

/** AG Grid 셀 값처럼 값이 비어 들어오면 빈 문자열 */
export function deviceLabel(device: Device | null | undefined): string {
  return DEVICE_OPTIONS.find((o) => o.value === device)?.label ?? ""
}
