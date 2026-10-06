/**
 * 키워드별 자동입찰 설정(희망순위·입찰가 한도·가감액) — /api/adgroups/{id}/keywords/.../settings
 *
 * 설정 조회 API 는 따로 없다. getAdGroupKeywords 응답의 bidSetting 에 병합되어 오므로
 * 저장 후에는 키워드 쿼리를 무효화하면 된다.
 */
import type {
  BidSetting,
  BidSettingApplyGroupsResult,
  BidSettingValues,
} from "@/types/ads"

import { request } from "./client"

const settingPath = (adGroupId: string, keywordId: string) =>
  `/api/adgroups/${encodeURIComponent(adGroupId)}/keywords/${encodeURIComponent(keywordId)}/settings`

/**
 * 키워드 설정 부분 수정 (셀 하나 편집). 보낸 필드만 갱신되고,
 * 어떤 필드를 null 로 보내면 그 값만 미입력으로 돌아간다.
 */
export const patchKeywordSetting = (
  adGroupId: string,
  keywordId: string,
  patch: Partial<BidSettingValues>
) => request<BidSetting>("PATCH", settingPath(adGroupId, keywordId), patch)

/**
 * 여러 키워드 설정을 한 번에 저장 (upsert).
 * 주의: 항목마다 세 값을 통째로 덮어쓴다 — 빠뜨린 값은 null(미입력)로 저장된다.
 */
export const bulkUpsertKeywordSettings = (
  adGroupId: string,
  items: (Partial<BidSettingValues> & { keywordId: string })[]
) =>
  request<BidSetting[]>(
    "PUT",
    `/api/adgroups/${encodeURIComponent(adGroupId)}/keywords/settings`,
    { items }
  )

/**
 * 여러 그룹의 키워드 전부에 보낸 값만 덮어쓴다 (보내지 않은 값은 키워드마다 그대로).
 * 범위는 그룹마다 키워드 표와 같다 — 입찰을 시작한 적 있는 그룹은 대상 키워드만, 시작 전이면 전체 키워드.
 * 그룹별 성공/실패를 돌려주며, 한 그룹이 실패해도 나머지는 적용된다.
 */
export const applyKeywordSettingsToGroups = (
  adGroupIds: string[],
  patch: Partial<BidSettingValues>
) =>
  request<BidSettingApplyGroupsResult>(
    "PUT",
    "/api/adgroups/keyword-settings",
    {
      adGroupIds,
      ...patch,
    }
  )

/** 키워드 설정 초기화. 이후 해당 키워드의 bidSetting 은 null 이 된다. */
export const deleteKeywordSetting = (adGroupId: string, keywordId: string) =>
  request<void>("DELETE", settingPath(adGroupId, keywordId))
