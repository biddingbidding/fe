/** 광고 그룹 모음(즐겨찾기) — /api/collections/* */
import type { Collection, CollectionCreate, CollectionPatch } from "@/types/ads"

import { request } from "./client"

/** 이 네이버 계정의 모음 전부 (표시 순서). 각 모음에 담긴 그룹 id 포함 */
export const getCollections = () =>
  request<Collection[]>("GET", "/api/collections")

/** 새 모음. adGroupIds 를 주면 만들면서 바로 담는다. 같은 이름이면 409, 없는 그룹이 있으면 404 */
export const createCollection = (payload: CollectionCreate) =>
  request<Collection>("POST", "/api/collections", payload)

/** 이름·색·표시 순서 부분 수정. 보낸 필드만 바뀌고, color 에 null 을 보내면 색을 지운다 */
export const patchCollection = (id: string, patch: CollectionPatch) =>
  request<Collection>(
    "PATCH",
    `/api/collections/${encodeURIComponent(id)}`,
    patch
  )

/** 모음 삭제. 담긴 그룹의 설정·토글은 그대로 */
export const deleteCollection = (id: string) =>
  request<void>("DELETE", `/api/collections/${encodeURIComponent(id)}`)

/** 담긴 그룹을 이 목록으로 통째로 바꾼다 (순서 유지, 중복 제거, 빈 배열이면 비움) */
export const replaceCollectionItems = (id: string, adGroupIds: string[]) =>
  request<Collection>(
    "PUT",
    `/api/collections/${encodeURIComponent(id)}/items`,
    { adGroupIds }
  )
