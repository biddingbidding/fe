/** 광고 그룹의 노출 지역(Region) 표시용 — null 은 제한 없음(전체 노출) */
import type { Region } from "@/types/ads"

export const REGION_ALL_LABEL = "전체"

/** 셀렉트/드롭다운 옵션: 제한 없음 + 시/도 목록 */
export function regionOptions(
  regions: Region[]
): { value: string | null; label: string }[] {
  return [
    { value: null, label: REGION_ALL_LABEL },
    ...regions.map((r) => ({ value: r.code, label: r.name })),
  ]
}

export function regionLabel(
  regions: Region[],
  code: string | null | undefined
): string {
  if (!code) return REGION_ALL_LABEL
  return regions.find((r) => r.code === code)?.name ?? code
}
