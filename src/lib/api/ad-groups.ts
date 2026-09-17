/** 광고 그룹·키워드 조회 — /api/adgroups/* */
import type {
  AdGroup,
  AdGroupKeyword,
  AdGroupRegionBulkResult,
  AdGroupSetting,
  AdGroupSettingApplyResult,
  AdGroupSettingPatch,
  RankRegion,
  Region,
  StatsPeriod,
} from "@/types/ads"

import { request } from "./client"

export const getAdGroups = () => request<AdGroup[]>("GET", "/api/adgroups")

/**
 * 그룹 하나의 자동입찰 on/off 및/또는 노출 지역. 보낸 필드만 바뀐다.
 * enabled 를 켜면 서버가 그 그룹의 키워드를 자동입찰 대상으로 등록한다.
 * region 은 GET /api/regions 의 code. null 이면 제한 없음(전체 노출)으로 되돌린다.
 */
export const patchAdGroup = (
  id: string,
  patch: { enabled?: boolean; region?: string | null }
) => request<AdGroup>("PATCH", `/api/adgroups/${encodeURIComponent(id)}`, patch)

/** 노출 지역으로 고를 수 있는 시/도 목록 (가나다 순) */
export const getRegions = () => request<Region[]>("GET", "/api/regions")

/** 순위확인지역으로 고를 수 있는 시/도와 시/군/구 (공식 법정동코드 기준, 코드 순) */
export const getRankRegions = () =>
  request<RankRegion[]>("GET", "/api/regions/rank")

/**
 * "모든 그룹에 적용" — 계정의 모든 광고 그룹의 노출 지역을 같은 값으로. 지역 타겟이 없는 그룹은 건너뛴다.
 * collectionId 를 주면 그 모음에 담긴 그룹만 (없는 모음이면 404).
 */
export const applyRegionToAll = (
  region: string | null,
  collectionId?: string | null
) =>
  request<AdGroupRegionBulkResult>("PUT", "/api/adgroups/region", {
    region,
    ...(collectionId ? { collectionId } : {}),
  })

/**
 * 그룹 하나의 설정(기기·우선순위) 수정. 보낸 필드만 바뀐다.
 * 기기는 PC | MOBILE 만 (null 이면 400). 우선순위·순위확인지역은 null 을 보내면 미입력으로 되돌린다.
 */
export const patchAdGroupSetting = (id: string, patch: AdGroupSettingPatch) =>
  request<AdGroupSetting>(
    "PATCH",
    `/api/adgroups/${encodeURIComponent(id)}/settings`,
    patch
  )

/**
 * "모든 그룹에 적용" — 계정의 모든 광고 그룹에 같은 설정값(보낸 필드만)을 저장한다.
 * collectionId 를 주면 그 모음에 담긴 그룹만 (없는 모음이면 404).
 */
export const applyAdGroupSettingToAll = (
  patch: AdGroupSettingPatch,
  collectionId?: string | null
) =>
  request<AdGroupSettingApplyResult>("PUT", "/api/adgroups/settings", {
    ...patch,
    ...(collectionId ? { collectionId } : {}),
  })

/**
 * 네이버에서 실시간 조회한 키워드 + 사용자 입찰 설정(bidSetting) + 기간 통계(stats) + 자동입찰 상태(autobid) 병합.
 * period 는 통계 집계 기간 (기본 last7days).
 * autobidOnly 가 true 면 자동입찰 대상으로 등록된 키워드만 — 그룹을 켠 뒤 네이버에 새로 추가된 키워드는 빠진다.
 */
export const getAdGroupKeywords = (
  id: string,
  period: StatsPeriod,
  autobidOnly = false
) => {
  const params = new URLSearchParams({ period })
  if (autobidOnly) params.set("autobidOnly", "true")
  return request<AdGroupKeyword[]>(
    "GET",
    `/api/adgroups/${encodeURIComponent(id)}/keywords?${params}`
  )
}
