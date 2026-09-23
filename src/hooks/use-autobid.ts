/**
 * 자동입찰 큐·입찰 시작/중지·현황 훅 — /api/autobid/*
 *
 * 큐(대기열) 소속과 입찰 상태는 별개다 (자세한 흐름은 lib/api/autobid.ts).
 * 어느 쪽을 바꿔도 그룹 목록(queued·autobidEnabled)·큐·현황 세 캐시를 함께 무효화한다.
 * 워커 주기가 60초라 큐·현황은 60초마다 재조회한다 — 더 자주 불러도 새 데이터가 없다.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import * as api from "@/lib/api"
import { queryKeys } from "@/lib/query-keys"
import type { AdGroup, AutobidQueueItem } from "@/types/ads"

/** 워커 주기(60초)에 맞춘 재조회 간격 */
const AUTOBID_REFETCH_MS = 60_000

/** 큐 목록. 입찰 중인 그룹이 하나라도 있으면 60초마다 진행 상황(검토 수·마지막 검토 시각)을 갱신한다. */
export function useAutobidQueue(customerId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.autobidQueue(customerId ?? ""),
    queryFn: api.getAutobidQueue,
    enabled: !!customerId,
    refetchInterval: (query) =>
      query.state.data?.some((g) => g.autobidEnabled)
        ? AUTOBID_REFETCH_MS
        : false,
  })
}

/** 계정 단위 현황(요금제·주기·큐/입찰 중 그룹·대상 키워드·마지막 검토). 배지용이라 60초마다 갱신한다. */
export function useAutobidStatus(customerId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.autobidStatus(customerId ?? ""),
    queryFn: api.getAutobidStatus,
    enabled: !!customerId,
    refetchInterval: AUTOBID_REFETCH_MS,
  })
}

/** 큐·입찰 상태 변경 뒤 함께 다시 받아야 하는 캐시들 */
function useInvalidateAutobid(customerId: string | undefined) {
  const queryClient = useQueryClient()
  const cid = customerId ?? ""
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.adGroups(cid) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.autobidQueue(cid) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.autobidStatus(cid) }),
    ])
}

/**
 * 그룹들을 큐에 넣는다 (POST /api/autobid/queue). 대기열 표시만 하고 입찰은 시작하지 않는다.
 * 계정에 없는 그룹은 ok=false 로 오므로 호출부가 응답의 items 로 알린다.
 */
export function useAddToAutobidQueue(customerId: string | undefined) {
  const invalidate = useInvalidateAutobid(customerId)
  return useMutation({
    mutationFn: api.addToAutobidQueue,
    onSettled: () => invalidate(),
  })
}

/**
 * 그룹들을 큐에서 뺀다 (DELETE /api/autobid/queue). 입찰 중이면 같이 멈춘다. 실제로 빠진 그룹 수를 돌려준다.
 * 자동 입찰 페이지의 표에서 행이 바로 사라지도록 큐 캐시에서 먼저 지우고, 실패하면 되돌린다.
 */
export function useRemoveFromAutobidQueue(customerId: string | undefined) {
  const queryClient = useQueryClient()
  const key = queryKeys.autobidQueue(customerId ?? "")
  const invalidate = useInvalidateAutobid(customerId)

  return useMutation({
    mutationFn: async (adGroupIds: string[]) =>
      (await api.removeFromAutobidQueue(adGroupIds)).count,
    onMutate: async (adGroupIds) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<AutobidQueueItem[]>(key)
      const ids = new Set(adGroupIds)
      queryClient.setQueryData<AutobidQueueItem[]>(key, (prev) =>
        prev?.filter((g) => !ids.has(g.id))
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
    },
    onSettled: () => invalidate(),
  })
}

/**
 * 그룹 하나를 큐에 넣거나 뺀다 — 캠페인/그룹 표의 "대기열" 스위치용.
 * 스위치가 즉시 반응하도록 그룹 목록의 queued 를 낙관적으로 바꾸고, 실패하면 되돌린다.
 * 빼면 입찰도 멈추므로 autobidEnabled 도 함께 내린다. 넣기는 항목별 결과로 오므로 그 그룹이 실패했으면 에러로 바꿔 던진다.
 */
export function useSetQueueMembership(customerId: string | undefined) {
  const queryClient = useQueryClient()
  const key = queryKeys.adGroups(customerId ?? "")
  const invalidate = useInvalidateAutobid(customerId)

  return useMutation({
    mutationFn: async ({
      adGroupId,
      queued,
    }: {
      adGroupId: string
      queued: boolean
    }) => {
      if (queued) {
        const result = await api.addToAutobidQueue([adGroupId])
        const item = result.items.find((i) => i.adGroupId === adGroupId)
        if (!item?.ok)
          throw new Error(item?.error ?? "대기열에 넣지 못했습니다.")
        return
      }
      await api.removeFromAutobidQueue([adGroupId])
    },
    onMutate: async ({ adGroupId, queued }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<AdGroup[]>(key)
      queryClient.setQueryData<AdGroup[]>(key, (prev) =>
        prev?.map((g) =>
          g.id === adGroupId
            ? {
                ...g,
                queued,
                autobidEnabled: queued ? g.autobidEnabled : false,
              }
            : g
        )
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
    },
    onSettled: () => invalidate(),
  })
}

/**
 * 입찰 시작 (POST /api/autobid/queue/start). 그룹마다 따로 처리되어 일부만 실패할 수 있으므로
 * 호출부는 응답의 items 로 실패한 그룹을 알려야 한다.
 * 큐 표의 버튼이 즉시 반응하도록 큐 캐시의 autobidEnabled 를 낙관적으로 켜고, 실패하면 되돌린다.
 */
export function useStartAutobid(customerId: string | undefined) {
  const queryClient = useQueryClient()
  const key = queryKeys.autobidQueue(customerId ?? "")
  const invalidate = useInvalidateAutobid(customerId)

  return useMutation({
    mutationFn: api.startAutobid,
    onMutate: async (adGroupIds) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<AutobidQueueItem[]>(key)
      const ids = new Set(adGroupIds)
      queryClient.setQueryData<AutobidQueueItem[]>(key, (prev) =>
        prev?.map((g) => (ids.has(g.id) ? { ...g, autobidEnabled: true } : g))
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
    },
    onSettled: () => invalidate(),
  })
}

/** 입찰 중지 (POST /api/autobid/queue/stop). 큐에는 남는다. 실제로 멈춘 그룹 수를 돌려준다. 큐 캐시를 낙관적으로 갱신한다. */
export function useStopAutobid(customerId: string | undefined) {
  const queryClient = useQueryClient()
  const key = queryKeys.autobidQueue(customerId ?? "")
  const invalidate = useInvalidateAutobid(customerId)

  return useMutation({
    mutationFn: async (adGroupIds: string[]) =>
      (await api.stopAutobid(adGroupIds)).count,
    onMutate: async (adGroupIds) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<AutobidQueueItem[]>(key)
      const ids = new Set(adGroupIds)
      queryClient.setQueryData<AutobidQueueItem[]>(key, (prev) =>
        prev?.map((g) => (ids.has(g.id) ? { ...g, autobidEnabled: false } : g))
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
    },
    onSettled: () => invalidate(),
  })
}
