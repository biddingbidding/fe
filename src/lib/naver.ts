/** 네이버 통합검색 링크 — 그룹의 기기(Device) 설정에 맞춰 PC/모바일 검색 결과를 연다 */
import type { Device } from "@/types/ads"

const SEARCH_HOST: Record<Device, string> = {
  PC: "https://search.naver.com",
  MOBILE: "https://m.search.naver.com",
}

/** 키워드의 네이버 검색 결과 주소. device 가 없으면 PC 로 본다 */
export function naverSearchUrl(
  keyword: string,
  device: Device | null | undefined
) {
  const host = SEARCH_HOST[device ?? "PC"] ?? SEARCH_HOST.PC
  return `${host}/search.naver?query=${encodeURIComponent(keyword)}`
}

/** 새 탭으로 연다 — 원래 탭이 opener 로 넘어가지 않도록 noopener */
export function openNaverSearch(
  keyword: string,
  device: Device | null | undefined
) {
  window.open(naverSearchUrl(keyword, device), "_blank", "noopener,noreferrer")
}
