/**
 * 자동입찰 큐·현황 — /api/autobid/*
 *
 * 큐(대기열)에 넣는 것과 입찰 시작은 다른 흐름이다.
 * - 큐 넣기(POST /queue): 대기열 표시만. 네이버 호출·키워드 등록 없음.
 * - 입찰 시작(POST /queue/start): 입찰 토글 on, 처음이면 키워드를 네이버에서 받아 대상 등록. 큐에 없던 그룹은 큐에도 들어간다.
 * - 입찰 중지(POST /queue/stop): 토글 off. 큐에는 남는다.
 * - 큐에서 빼기(DELETE /queue): 입찰 중이면 같이 멈춘다.
 * 그룹 목록(GET /api/adgroups)의 queued·autobidEnabled 도 함께 바뀌므로 훅에서 캐시를 같이 무효화한다.
 * 단위는 광고 그룹이다. 캠페인을 골랐으면 호출부가 그 캠페인의 그룹 ID 로 펼쳐 보낸다.
 */
import type {
  AutobidQueueCountResult,
  AutobidQueueItem,
  AutobidQueueOpResult,
  AutobidStatus,
} from "@/types/ads"

import { request } from "./client"

/** 계정 단위 현황 — 요금제·워커 주기·큐/입찰 중 그룹 수·대상 키워드 수·마지막 검토 시각 */
export const getAutobidStatus = () =>
  request<AutobidStatus>("GET", "/api/autobid/status")

/** 큐 목록 — 큐에 넣은 그룹만, GET /api/adgroups 와 같은 순서. 항목마다 입찰 상태와 대상/검토 키워드 수, 마지막 검토 시각 */
export const getAutobidQueue = () =>
  request<AutobidQueueItem[]>("GET", "/api/autobid/queue")

/** 그룹들을 큐에 넣는다 (대기열 표시만, 입찰은 시작되지 않는다). 계정에 없는 그룹은 ok=false, 이미 있으면 ok=true */
export const addToAutobidQueue = (adGroupIds: string[]) =>
  request<AutobidQueueOpResult>("POST", "/api/autobid/queue", { adGroupIds })

/** 그룹들을 큐에서 뺀다. 입찰 중이었으면 같이 멈춘다. 없거나 큐에 없던 그룹은 조용히 건너뛴다 */
export const removeFromAutobidQueue = (adGroupIds: string[]) =>
  request<AutobidQueueCountResult>("DELETE", "/api/autobid/queue", {
    adGroupIds,
  })

/**
 * 입찰 시작 — 그룹마다 토글 on(처음이면 키워드 등록). 다음 워커 사이클(최대 60초)부터 돈다.
 * 그룹마다 따로 처리되어 일부만 실패할 수 있으므로 응답의 items 로 그룹별 ok/error 를 확인한다.
 */
export const startAutobid = (adGroupIds: string[]) =>
  request<AutobidQueueOpResult>("POST", "/api/autobid/queue/start", {
    adGroupIds,
  })

/** 입찰 중지 — 토글 off. 큐에는 남고 키워드 이력도 남는다. 이미 멈춘 그룹은 세지 않는다 */
export const stopAutobid = (adGroupIds: string[]) =>
  request<AutobidQueueCountResult>("POST", "/api/autobid/queue/stop", {
    adGroupIds,
  })
