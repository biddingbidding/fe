import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import * as api from "@/lib/api"
import { queryKeys } from "@/lib/query-keys"
import type {
  AdGroup,
  Collection,
  CollectionCreate,
  CollectionPatch,
} from "@/types/ads"

/** 이 계정의 광고 그룹 모음(즐겨찾기) 전부, 표시 순서대로 */
export function useCollections(customerId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.collections(customerId ?? ""),
    queryFn: api.getCollections,
    enabled: !!customerId,
  })
}

/** 그룹 목록 캐시의 collectionIds 를 모음 목록 기준으로 다시 계산한다 (모음 표시 순서 유지) */
function syncGroupMembership(groups: AdGroup[] | undefined, collections: Collection[]) {
  if (!groups) return groups
  const byGroup = new Map<string, string[]>()
  for (const c of collections)
    for (const gid of c.adGroupIds) {
      const ids = byGroup.get(gid)
      if (ids) ids.push(c.id)
      else byGroup.set(gid, [c.id])
    }
  return groups.map((g) => {
    const next = byGroup.get(g.id) ?? []
    const same =
      next.length === g.collectionIds.length &&
      next.every((id, i) => id === g.collectionIds[i])
    return same ? g : { ...g, collectionIds: next }
  })
}

/** 모음 캐시를 바꾸고, 그룹 목록의 collectionIds 도 같이 맞춘다 */
function useCollectionCache(customerId: string | undefined) {
  const queryClient = useQueryClient()
  const key = queryKeys.collections(customerId ?? "")
  const groupsKey = queryKeys.adGroups(customerId ?? "")

  return {
    queryClient,
    key,
    groupsKey,
    snapshot: () => ({
      collections: queryClient.getQueryData<Collection[]>(key),
      groups: queryClient.getQueryData<AdGroup[]>(groupsKey),
    }),
    restore: (ctx?: { collections?: Collection[]; groups?: AdGroup[] }) => {
      if (ctx?.collections) queryClient.setQueryData(key, ctx.collections)
      if (ctx?.groups) queryClient.setQueryData(groupsKey, ctx.groups)
    },
    /** 모음 목록을 update 로 바꾸고 그룹 캐시를 동기화 */
    apply: (update: (prev: Collection[]) => Collection[]) => {
      const next = update(queryClient.getQueryData<Collection[]>(key) ?? [])
      queryClient.setQueryData<Collection[]>(key, next)
      queryClient.setQueryData<AdGroup[]>(groupsKey, (prev) =>
        syncGroupMembership(prev, next)
      )
    },
  }
}

/** 새 모음 (POST). 응답을 목록 맨 뒤에 넣고, 담은 그룹의 collectionIds 를 맞춘다. */
export function useCreateCollection(customerId: string | undefined) {
  const cache = useCollectionCache(customerId)
  return useMutation({
    mutationFn: (payload: CollectionCreate) => api.createCollection(payload),
    onSuccess: (created) => {
      cache.apply((prev) => [...prev.filter((c) => c.id !== created.id), created])
    },
  })
}

/** 이름·색 수정 (PATCH). 낙관적으로 반영하고 실패하면 되돌린다. */
export function useUpdateCollection(customerId: string | undefined) {
  const cache = useCollectionCache(customerId)
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: CollectionPatch }) =>
      api.patchCollection(id, patch),
    onMutate: async ({ id, patch }) => {
      await cache.queryClient.cancelQueries({ queryKey: cache.key })
      const previous = cache.snapshot()
      cache.apply((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
      return previous
    },
    onError: (_err, _vars, ctx) => cache.restore(ctx),
    onSuccess: (updated) => {
      cache.apply((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
    },
  })
}

/** 모음 삭제 (DELETE). 낙관적으로 빼고 실패하면 되돌린다. 담긴 그룹의 설정·토글은 그대로다. */
export function useDeleteCollection(customerId: string | undefined) {
  const cache = useCollectionCache(customerId)
  return useMutation({
    mutationFn: (id: string) => api.deleteCollection(id),
    onMutate: async (id) => {
      await cache.queryClient.cancelQueries({ queryKey: cache.key })
      const previous = cache.snapshot()
      cache.apply((prev) => prev.filter((c) => c.id !== id))
      return previous
    },
    onError: (_err, _vars, ctx) => cache.restore(ctx),
  })
}

/**
 * 그룹들을 모음에 담거나 뺀다. 서버 API 는 "담긴 그룹 통째로 교체"(PUT items) 하나뿐이라,
 * 캐시의 현재 목록에 그룹을 더하거나 빼서 보낸다. 낙관적으로 반영하고 실패하면 되돌린다.
 * 응답으로 실제로 바뀐(새로 담기거나 빠진) 그룹 수를 돌려준다.
 */
export function useSetCollectionMembership(customerId: string | undefined) {
  const cache = useCollectionCache(customerId)

  const nextIds = (current: string[], adGroupIds: string[], member: boolean) => {
    const targets = new Set(adGroupIds)
    if (member) {
      const have = new Set(current)
      return [...current, ...adGroupIds.filter((id) => !have.has(id))]
    }
    return current.filter((id) => !targets.has(id))
  }

  return useMutation({
    mutationFn: async ({
      collectionId,
      adGroupIds,
      member,
    }: {
      collectionId: string
      adGroupIds: string[]
      /** true 면 담고, false 면 뺀다 */
      member: boolean
    }) => {
      // onMutate 가 먼저 돌아 캐시는 이미 낙관적 상태 — 그 목록을 그대로 보내면 된다
      const current =
        cache.queryClient
          .getQueryData<Collection[]>(cache.key)
          ?.find((c) => c.id === collectionId)?.adGroupIds ?? []
      const updated = await api.replaceCollectionItems(
        collectionId,
        nextIds(current, adGroupIds, member)
      )
      return updated
    },
    onMutate: async ({ collectionId, adGroupIds, member }) => {
      await cache.queryClient.cancelQueries({ queryKey: cache.key })
      const previous = cache.snapshot()
      const before =
        previous.collections?.find((c) => c.id === collectionId)?.adGroupIds ??
        []
      const after = nextIds(before, adGroupIds, member)
      cache.apply((prev) =>
        prev.map((c) => (c.id === collectionId ? { ...c, adGroupIds: after } : c))
      )
      return { ...previous, changed: Math.abs(after.length - before.length) }
    },
    onError: (_err, _vars, ctx) => cache.restore(ctx),
    onSuccess: (updated) => {
      cache.apply((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
    },
  })
}
