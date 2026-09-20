import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import * as api from "@/lib/api"
import { queryKeys } from "@/lib/query-keys"
import type {
  AdGroup,
  AdGroupKeyword,
  AdGroupSettingPatch,
  BidSettingValues,
  Region,
  StatsPeriod,
} from "@/types/ads"

export function useAdGroups(customerId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.adGroups(customerId ?? ""),
    queryFn: api.getAdGroups,
    enabled: !!customerId,
  })
}

/** 노출 지역으로 고를 수 있는 시/도 목록. 고정 데이터라 한 번만 받는다. 로그인 전에는 조회하지 않는다. */
export function useRegions(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.regions,
    queryFn: api.getRegions,
    enabled,
    staleTime: Infinity,
  })
}

/** 순위확인지역 목록 (시/도 + 시/군/구). 행정구역 자료라 한 번 받으면 다시 받지 않는다 */
export function useRankRegions(enabled = true) {
  return useQuery({
    queryKey: queryKeys.rankRegions,
    queryFn: api.getRankRegions,
    enabled,
    staleTime: Infinity,
  })
}

/** 입찰 중인 그룹을 볼 때의 자동 갱신 간격 — 워커 주기(60초)와 같다 */
export const KEYWORDS_LIVE_REFETCH_MS = 60_000

/**
 * 광고 그룹의 키워드 목록 (+ 입찰 설정, period 기간 통계, 자동입찰 상태). adGroupId 가 없으면 조회하지 않는다.
 * autobidOnly 가 true 면 자동입찰 대상으로 등록된 키워드만 (자동 입찰 페이지의 큐 항목 화면용).
 * live 가 true 면 60초마다 다시 받아 엔진이 바꾼 현재 입찰가를 따라간다 — 네이버 실시간 호출이므로
 * 입찰 중인 그룹을 보고 있을 때만 켠다. 셀을 편집하는 동안에는 호출부가 꺼서 입력이 끊기지 않게 한다.
 */
export function useAdGroupKeywords(
  adGroupId: string | null,
  period: StatsPeriod = "last7days",
  autobidOnly = false,
  live = false
) {
  return useQuery({
    queryKey: queryKeys.adGroupKeywords(adGroupId ?? "", {
      period,
      autobidOnly,
    }),
    queryFn: () => api.getAdGroupKeywords(adGroupId!, period, autobidOnly),
    enabled: !!adGroupId,
    staleTime: 60_000,
    refetchInterval: live ? KEYWORDS_LIVE_REFETCH_MS : false,
  })
}

/**
 * 키워드 입찰 설정(희망순위·입찰가 한도·가감액) 부분 수정.
 * 해당 그룹의 모든 기간 캐시에 낙관적으로 반영하고, 실패하면 되돌린다.
 * 키워드 목록 재조회는 네이버 실시간 호출이라 무효화하지 않고 서버 응답으로 캐시를 갱신한다.
 */
export function useUpdateKeywordSetting(adGroupId: string | null) {
  const queryClient = useQueryClient()
  // period 없이 → 이 그룹의 모든 기간 쿼리
  const key = queryKeys.adGroupKeywords(adGroupId ?? "")

  const patchCache = (
    keywordId: string,
    update: (k: AdGroupKeyword) => AdGroupKeyword
  ) =>
    queryClient.setQueriesData<AdGroupKeyword[]>({ queryKey: key }, (prev) =>
      prev?.map((k) => (k.id === keywordId ? update(k) : k))
    )

  return useMutation({
    mutationFn: ({
      keywordId,
      patch,
    }: {
      keywordId: string
      patch: Partial<BidSettingValues>
    }) => api.patchKeywordSetting(adGroupId!, keywordId, patch),
    onMutate: async ({ keywordId, patch }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueriesData<AdGroupKeyword[]>({
        queryKey: key,
      })
      patchCache(keywordId, (k) => ({
        ...k,
        bidSetting: {
          keywordId,
          targetRank: null,
          maxBid: null,
          bidAdjust: null,
          updatedAt: new Date().toISOString(),
          ...k.bidSetting,
          ...patch,
        },
      }))
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      for (const [k, data] of ctx?.previous ?? [])
        queryClient.setQueryData(k, data)
    },
    onSuccess: (setting, { keywordId }) => {
      patchCache(keywordId, (k) => ({ ...k, bidSetting: setting }))
    },
  })
}

/**
 * 여러 키워드의 입찰 설정을 한 번에 저장 (PUT upsert).
 * 서버가 항목마다 세 값을 통째로 덮어쓰므로, 호출부는 바꾸지 않을 값도 기존 값으로 채워 보내야 한다.
 * 성공하면 응답으로 받은 설정을 해당 그룹의 모든 기간 캐시에 반영한다.
 */
export function useBulkUpdateKeywordSettings(adGroupId: string | null) {
  const queryClient = useQueryClient()
  const key = queryKeys.adGroupKeywords(adGroupId ?? "")

  return useMutation({
    mutationFn: (items: (BidSettingValues & { keywordId: string })[]) =>
      api.bulkUpsertKeywordSettings(adGroupId!, items),
    onSuccess: (settings) => {
      const byId = new Map(settings.map((s) => [s.keywordId, s]))
      queryClient.setQueriesData<AdGroupKeyword[]>({ queryKey: key }, (prev) =>
        prev?.map((k) => {
          const setting = byId.get(k.id)
          return setting ? { ...k, bidSetting: setting } : k
        })
      )
    },
  })
}

/**
 * 광고 그룹 하나의 설정(기기·우선순위·순위확인지역)을 낙관적으로 수정한다. 보낸 필드만 바뀐다. 실패하면 되돌린다.
 * 같은 그룹이 캠페인/그룹 목록과 자동입찰 대기열 두 캐시에 있으므로 둘 다 반영하고,
 * 성공하면 서버가 돌려준 값(표시용 rankRegionName 포함)으로 맞춘다.
 */
export function useUpdateAdGroupSetting(customerId: string | undefined) {
  const queryClient = useQueryClient()
  const cid = customerId ?? ""
  const keys = [queryKeys.adGroups(cid), queryKeys.autobidQueue(cid)]

  /** 두 캐시에서 그 그룹 행만 fields 로 덮어쓴다 */
  function mergeInto(adGroupId: string, fields: Partial<AdGroup>) {
    for (const key of keys) {
      queryClient.setQueryData<AdGroup[]>(key, (prev) =>
        prev?.map((g) => (g.id === adGroupId ? { ...g, ...fields } : g))
      )
    }
  }

  return useMutation({
    mutationFn: ({
      adGroupId,
      patch,
    }: {
      adGroupId: string
      patch: AdGroupSettingPatch
    }) => api.patchAdGroupSetting(adGroupId, patch),
    onMutate: async ({ adGroupId, patch }) => {
      await Promise.all(
        keys.map((queryKey) => queryClient.cancelQueries({ queryKey }))
      )
      const previous = keys.map(
        (key) => [key, queryClient.getQueryData<AdGroup[]>(key)] as const
      )
      mergeInto(adGroupId, patch)
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      for (const [key, data] of ctx?.previous ?? []) {
        if (data) queryClient.setQueryData(key, data)
      }
    },
    onSuccess: (setting) =>
      mergeInto(setting.adGroupId, {
        device: setting.device,
        priority: setting.priority,
        rankRegion: setting.rankRegion,
        rankRegionName: setting.rankRegionName,
      }),
  })
}

/** "모든 그룹에 적용" 의 범위 — collectionId 가 있으면 그 모음에 담긴 그룹만 */
export interface BulkScope {
  collectionId?: string | null
}

const inScope = (g: AdGroup, scope: BulkScope) =>
  !scope.collectionId || g.collectionIds.includes(scope.collectionId)

/**
 * 계정의 모든 광고 그룹에 같은 설정값(기기 또는 우선순위)을 저장한다 (PUT /api/adgroups/settings).
 * collectionId 를 주면 그 모음에 담긴 그룹만. 낙관적으로 반영하고, 실패하면 되돌린다. 저장된 그룹 수를 돌려준다.
 */
export function useApplySettingToAll(customerId: string | undefined) {
  const queryClient = useQueryClient()
  const key = queryKeys.adGroups(customerId ?? "")

  return useMutation({
    mutationFn: async ({
      patch,
      collectionId,
    }: BulkScope & { patch: AdGroupSettingPatch }) =>
      (await api.applyAdGroupSettingToAll(patch, collectionId)).updated,
    onMutate: async ({ patch, ...scope }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<AdGroup[]>(key)
      queryClient.setQueryData<AdGroup[]>(key, (prev) =>
        prev?.map((g) => (inScope(g, scope) ? { ...g, ...patch } : g))
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
    },
  })
}

/**
 * 광고 그룹 하나의 자동입찰 on/off (PATCH /api/adgroups/{id}).
 * 토글이 즉시 반응하도록 낙관적으로 반영하고, 실패하면 되돌린다.
 * 켜면 서버가 키워드를 자동입찰 대상으로 등록하므로 응답을 캐시에 그대로 반영한다.
 * 큐 = 켜진 그룹 집합이라 끝나면 자동입찰 큐·현황 캐시도 무효화한다.
 */
export function useUpdateAdGroupEnabled(customerId: string | undefined) {
  const queryClient = useQueryClient()
  const key = queryKeys.adGroups(customerId ?? "")
  const invalidateAutobid = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.autobidQueue(customerId ?? ""),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.autobidStatus(customerId ?? ""),
      }),
    ])

  return useMutation({
    mutationFn: ({
      adGroupId,
      enabled,
    }: {
      adGroupId: string
      enabled: boolean
    }) => api.patchAdGroup(adGroupId, { enabled }),
    onMutate: async ({ adGroupId, enabled }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<AdGroup[]>(key)
      queryClient.setQueryData<AdGroup[]>(key, (prev) =>
        prev?.map((g) =>
          g.id === adGroupId ? { ...g, autobidEnabled: enabled } : g
        )
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
    },
    onSuccess: (group) => {
      queryClient.setQueryData<AdGroup[]>(key, (prev) =>
        prev?.map((g) => (g.id === group.id ? group : g))
      )
    },
    onSettled: () => invalidateAutobid(),
  })
}

/**
 * 광고 그룹 하나의 노출 지역 (PATCH /api/adgroups/{id}). 네이버 지역 타겟을 직접 바꾼다.
 * 낙관적으로 반영하고(이름은 regions 목록에서 찾아 채운다), 실패하면 되돌린다.
 */
export function useUpdateAdGroupRegion(
  customerId: string | undefined,
  regions: Region[]
) {
  const queryClient = useQueryClient()
  const key = queryKeys.adGroups(customerId ?? "")

  return useMutation({
    mutationFn: ({
      adGroupId,
      region,
    }: {
      adGroupId: string
      region: string | null
    }) => api.patchAdGroup(adGroupId, { region }),
    onMutate: async ({ adGroupId, region }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<AdGroup[]>(key)
      const regionName = regions.find((r) => r.code === region)?.name ?? null
      queryClient.setQueryData<AdGroup[]>(key, (prev) =>
        prev?.map((g) =>
          g.id === adGroupId ? { ...g, region, regionName } : g
        )
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
    },
    onSuccess: (group) => {
      queryClient.setQueryData<AdGroup[]>(key, (prev) =>
        prev?.map((g) => (g.id === group.id ? group : g))
      )
    },
  })
}

/**
 * 계정의 모든 광고 그룹의 노출 지역을 같은 값으로 (PUT /api/adgroups/region). collectionId 를 주면 그 모음만.
 * 지역 타겟이 없는 그룹은 서버가 건너뛰므로, 낙관적으로 반영한 뒤 끝나면 목록을 다시 받아 실제 상태로 맞춘다.
 * 실제로 바뀐 그룹 수를 돌려준다.
 */
export function useApplyRegionToAll(
  customerId: string | undefined,
  regions: Region[]
) {
  const queryClient = useQueryClient()
  const key = queryKeys.adGroups(customerId ?? "")

  return useMutation({
    mutationFn: async ({
      region,
      collectionId,
    }: BulkScope & { region: string | null }) =>
      (await api.applyRegionToAll(region, collectionId)).adGroups,
    onMutate: async ({ region, ...scope }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<AdGroup[]>(key)
      const regionName = regions.find((r) => r.code === region)?.name ?? null
      queryClient.setQueryData<AdGroup[]>(key, (prev) =>
        prev?.map((g) =>
          g.region === region || !inScope(g, scope)
            ? g
            : { ...g, region, regionName }
        )
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })
}

/** 계정 동기화. 네이버에서 사라진 그룹의 토글도 정리되므로 그룹 목록과 자동입찰 큐·현황을 함께 다시 받는다. */
export function useSyncAccount(customerId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.syncAccount,
    onSuccess: async () => {
      if (customerId) {
        // 서버가 사라진 그룹을 모음·자동입찰 큐에서도 정리하므로 모음 목록과 큐·현황도 같이 다시 받는다
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: queryKeys.adGroups(customerId),
          }),
          queryClient.invalidateQueries({
            queryKey: queryKeys.collections(customerId),
          }),
          queryClient.invalidateQueries({
            queryKey: queryKeys.autobidQueue(customerId),
          }),
          queryClient.invalidateQueries({
            queryKey: queryKeys.autobidStatus(customerId),
          }),
        ])
      }
    },
  })
}
