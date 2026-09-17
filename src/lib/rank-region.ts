/** 순위확인지역(RankRegion) 표시용 — code 는 법정동코드 10자리, null 은 미설정 */
import type { RankDistrict, RankRegion } from "@/types/ads"

export const RANK_REGION_UNSET_LABEL = "미설정"

/** 공식 시/도 이름 → 화면용 짧은 이름. 표에 없으면 끝의 "특별시·광역시·도" 등을 뗀다 */
const SHORT_SIDO_NAMES: Record<string, string> = {
  충청북도: "충북",
  충청남도: "충남",
  전라북도: "전북",
  전북특별자치도: "전북",
  전라남도: "전남",
  전남광주통합특별시: "전남광주",
  경상북도: "경북",
  경상남도: "경남",
}

export function shortSidoName(name: string): string {
  return (
    SHORT_SIDO_NAMES[name] ??
    name.replace(/(특별자치시|특별자치도|통합특별시|특별시|광역시|도)$/, "")
  )
}

/** code 가 가리키는 시/도와 시/군/구. 시/도 전체면 district 가 null. 목록에 없으면 null */
export function findRankRegion(
  regions: RankRegion[],
  code: string | null | undefined
): { sido: RankRegion; district: RankDistrict | null } | null {
  if (!code) return null
  for (const sido of regions) {
    if (sido.code === code) return { sido, district: null }
    const district = sido.districts.find((d) => d.code === code)
    if (district) return { sido, district }
  }
  return null
}

/**
 * 셀·버튼에 보일 짧은 이름 — "서울 전체" / "서울 송파구". 미설정이면 "미설정".
 * 목록을 아직 못 받았거나 목록에 없는 code 면 서버가 준 전체 이름(fallbackName)으로 보인다.
 */
export function rankRegionLabel(
  regions: RankRegion[],
  code: string | null | undefined,
  fallbackName?: string | null
): string {
  if (!code) return RANK_REGION_UNSET_LABEL
  const found = findRankRegion(regions, code)
  if (!found) return fallbackName ?? code
  const sido = shortSidoName(found.sido.name)
  return found.district ? `${sido} ${found.district.name}` : `${sido} 전체`
}
