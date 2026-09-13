import { useEffect, useState } from "react"
import {
  ArrowRight,
  Gavel,
  Play,
  RefreshCw,
  Search,
  Square,
  X,
} from "lucide-react"
import { overlay } from "overlay-kit"
import { useNavigate, useSearchParams } from "react-router"
import { toast } from "sonner"

import { AutobidQueueGrid } from "@/components/autobid-queue-grid"
import { BiddingKeywordGrid } from "@/components/bidding-keyword-grid"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useAccount } from "@/hooks/use-account"
import { useRegions } from "@/hooks/use-ad-groups"
import {
  useAutobidQueue,
  useAutobidStatus,
  useRemoveFromAutobidQueue,
  useStartAutobid,
  useStopAutobid,
} from "@/hooks/use-autobid"
import { formatDateTime, formatNumber } from "@/lib/format"
import { routes } from "@/lib/pages"
import { errorMessage } from "@/lib/toast"
import type { AutobidQueueItem, AutobidStatus } from "@/types/ads"

/** 실패한 그룹을 토스트에 나열할 최대 개수. 넘치면 "외 N개" */
const MAX_LISTED_ERRORS = 3

/** 상단 현황 배지 — 요금제·워커 주기·대기열/입찰 중 그룹·대상 키워드 진행·마지막 검토 시각 */
function StatusSummary({ status }: { status: AutobidStatus | undefined }) {
  if (!status) return null
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <Badge variant="secondary">{status.planName}</Badge>
      <span className="tabular-nums">
        {status.intervalSeconds}초마다 키워드{" "}
        {formatNumber(status.keywordsPerCycle)}개
      </span>
      <span aria-hidden>·</span>
      <span className="tabular-nums">
        대기열 {formatNumber(status.queuedGroups)}개
      </span>
      <span aria-hidden>·</span>
      <span className="tabular-nums">
        입찰 중 {formatNumber(status.enabledGroups)}개
      </span>
      <span aria-hidden>·</span>
      <span className="tabular-nums">
        검토 {formatNumber(status.processedKeywords)} /{" "}
        {formatNumber(status.targetKeywords)} 키워드
      </span>
      {status.lastRunAt && (
        <>
          <span aria-hidden>·</span>
          <span className="tabular-nums">
            최근 검토 {formatDateTime(status.lastRunAt)}
          </span>
        </>
      )}
    </div>
  )
}

/**
 * 자동 입찰 — 위아래 두 표. 위는 자동입찰 대기열(큐)이고, 행을 클릭하면 아래에 그 그룹의 키워드가 나온다.
 * 대기열에 넣는 것(캠페인/그룹 페이지)과 입찰 시작은 별개 — 여기의 [입찰 시작]/[입찰 중지] 버튼이 실제 입찰을 켜고 끈다.
 * 큐는 입찰 중인 그룹이 있으면 워커 주기(60초)에 맞춰 자동으로 갱신된다.
 * 선택한 그룹은 URL 쿼리(?group=)에 두어 새로고침해도 유지된다.
 */
export function BiddingPage() {
  const navigate = useNavigate()
  const goAdGroups = () => void navigate(routes.adGroups)
  const { account } = useAccount()
  const customerId = account?.customerId
  const queue = useAutobidQueue(customerId)
  const { data: status } = useAutobidStatus(customerId)
  const { data: regions = [] } = useRegions(!!customerId)
  const removeFromQueue = useRemoveFromAutobidQueue(customerId)
  const startAutobid = useStartAutobid(customerId)
  const stopAutobid = useStopAutobid(customerId)
  const busy =
    removeFromQueue.isPending || startAutobid.isPending || stopAutobid.isPending
  const items = queue.data ?? []
  const stoppedItems = items.filter((g) => !g.autobidEnabled)
  const runningItems = items.filter((g) => g.autobidEnabled)

  const [params, setParams] = useSearchParams()
  const groupParam = params.get("group")

  // URL 의 그룹이 큐에 없거나 빠졌으면 첫 항목 자동 선택 (아래 표가 비어 보이는 순간을 없앤다)
  const activeItem = items.find((g) => g.id === groupParam) ?? items[0] ?? null

  // 유도된 선택을 URL 에 되써서 상태와 주소를 일치시킨다. 큐를 아직 못 받았으면 건드리지 않는다.
  useEffect(() => {
    if (!queue.isSuccess) return
    const nextGroup = activeItem?.id ?? null
    if (nextGroup === groupParam) return
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (nextGroup) next.set("group", nextGroup)
        else next.delete("group")
        return next
      },
      { replace: true }
    )
  }, [queue.isSuccess, activeItem, groupParam, setParams])

  function selectItem(item: AutobidQueueItem) {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set("group", item.id)
      return next
    })
  }

  /**
   * 입찰 시작 — 그룹마다 따로 처리되어 일부만 실패할 수 있다.
   * 성공 수는 성공 토스트, 실패한 그룹은 이름과 사유를 오류 토스트로 알린다. 확인 다이얼로그 안에서 호출된다.
   */
  async function runStart(targets: AutobidQueueItem[]) {
    const nameOf = new Map(targets.map((g) => [g.id, g.name]))
    const result = await startAutobid.mutateAsync(targets.map((g) => g.id))
    const failed = result.items.filter((i) => !i.ok)
    if (result.applied > 0) {
      const keywords = result.items.reduce((n, i) => n + i.targetKeywords, 0)
      toast.success(
        targets.length === 1
          ? `${targets[0].name} 그룹의 입찰을 시작했습니다 (대상 키워드 ${formatNumber(keywords)}개). 다음 사이클부터 검토합니다.`
          : `그룹 ${result.applied}개의 입찰을 시작했습니다 (대상 키워드 ${formatNumber(keywords)}개).`
      )
    }
    if (failed.length > 0) {
      const listed = failed
        .slice(0, MAX_LISTED_ERRORS)
        .map(
          (i) =>
            `${nameOf.get(i.adGroupId) ?? i.adGroupId}: ${i.error ?? "알 수 없는 오류"}`
        )
      const rest = failed.length - listed.length
      toast.error(`그룹 ${failed.length}개의 입찰을 시작하지 못했습니다.`, {
        description: listed.join("\n") + (rest > 0 ? `\n외 ${rest}개` : ""),
      })
    }
  }

  /** 그룹 하나 입찰 시작. 처음 시작하면 키워드를 네이버에서 받아 대상으로 등록하므로 확인을 받는다 */
  function handleStart(item: AutobidQueueItem) {
    overlay.open(({ isOpen, close, unmount }) => (
      <ConfirmDialog
        isOpen={isOpen}
        close={close}
        unmount={unmount}
        title="입찰을 시작할까요?"
        description={
          <>
            <b>{item.name}</b> 그룹의 자동입찰을 시작합니다. 그룹의 키워드를
            자동입찰 대상으로 등록하고, 다음 워커 사이클(최대 60초)부터
            검토·입찰이 돕니다.
          </>
        }
        confirmLabel="입찰 시작"
        pendingLabel="시작 중..."
        onConfirm={() => runStart([item])}
      />
    ))
  }

  /** 그룹 하나 입찰 중지. 대기열에는 남고 키워드 설정·이력도 남는다 */
  function handleStop(item: AutobidQueueItem) {
    stopAutobid.mutate([item.id], {
      onSuccess: () =>
        toast.success(
          `${item.name} 그룹의 입찰을 중지했습니다. 대기열에는 남아 있습니다.`
        ),
      onError: (err) =>
        toast.error(
          errorMessage(err, `${item.name} 그룹의 입찰을 중지하지 못했습니다.`)
        ),
    })
  }

  /** 대기열의 정지 상태 그룹 전부 입찰 시작 */
  function handleStartAll() {
    if (stoppedItems.length === 0) return
    overlay.open(({ isOpen, close, unmount }) => (
      <ConfirmDialog
        isOpen={isOpen}
        close={close}
        unmount={unmount}
        title="대기열 전체 입찰을 시작할까요?"
        description={
          <>
            정지 상태인 그룹 <b>{stoppedItems.length}개</b>의 자동입찰을
            시작합니다. 처음 시작하는 그룹은 키워드를 자동입찰 대상으로
            등록합니다.
          </>
        }
        confirmLabel="모두 시작"
        pendingLabel="시작 중..."
        onConfirm={() => runStart(stoppedItems)}
      />
    ))
  }

  /** 입찰 중인 그룹 전부 중지 */
  function handleStopAll() {
    if (runningItems.length === 0) return
    overlay.open(({ isOpen, close, unmount }) => (
      <ConfirmDialog
        isOpen={isOpen}
        close={close}
        unmount={unmount}
        title="입찰을 모두 중지할까요?"
        description={
          <>
            입찰 중인 그룹 <b>{runningItems.length}개</b>의 자동입찰을
            중지합니다. 대기열과 키워드 설정은 그대로 남습니다.
          </>
        }
        confirmLabel="모두 중지"
        pendingLabel="중지 중..."
        destructive
        onConfirm={async () => {
          const count = await stopAutobid.mutateAsync(
            runningItems.map((g) => g.id)
          )
          toast.success(`그룹 ${count}개의 입찰을 중지했습니다.`)
        }}
      />
    ))
  }

  /** 그룹 하나를 대기열에서 뺀다. 입찰 중이면 같이 멈춘다. 키워드 설정과 이력은 남는다 */
  function handleRemove(item: AutobidQueueItem) {
    overlay.open(({ isOpen, close, unmount }) => (
      <ConfirmDialog
        isOpen={isOpen}
        close={close}
        unmount={unmount}
        title="대기열에서 뺄까요?"
        description={
          <>
            <b>{item.name}</b> 그룹을 대기열에서 뺍니다.
            {item.autobidEnabled && " 입찰 중이므로 입찰도 함께 멈춥니다."}{" "}
            키워드의 희망순위·입찰가 한도·가감액 설정은 그대로 남습니다.
          </>
        }
        confirmLabel="대기열에서 빼기"
        pendingLabel="빼는 중..."
        destructive
        onConfirm={async () => {
          await removeFromQueue.mutateAsync([item.id])
          toast.success(`${item.name} 그룹을 대기열에서 뺐습니다.`)
        }}
      />
    ))
  }

  const [search, setSearch] = useState("")
  const query = search.trim()

  if (!account) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        계정을 연결하면 자동 입찰을 설정할 수 있습니다.
      </div>
    )
  }

  if (queue.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        대기열을 불러오는 중...
      </div>
    )
  }

  // 큐가 비어 있으면(오류가 아닐 때) 표 대신 안내 — 넣는 곳은 캠페인/그룹 페이지
  if (queue.isSuccess && items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Gavel className="size-5 text-muted-foreground" />
        </div>
        <div className="flex flex-col gap-1">
          <p className="font-medium">대기열이 비어 있습니다</p>
          <p className="text-sm text-muted-foreground">
            캠페인/그룹 페이지에서 그룹의 [대기열] 스위치를 켜면 여기에
            나타납니다.
          </p>
        </div>
        <Button variant="outline" onClick={goAdGroups}>
          캠페인/그룹으로 이동
          <ArrowRight />
        </Button>
      </div>
    )
  }

  return (
    <ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
      {/* 상단: 자동입찰 큐 */}
      <ResizablePanel defaultSize={40} minSize={20}>
        <div className="flex h-full min-h-0 flex-col gap-2 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <StatusSummary status={status} />
            <div className="flex items-center gap-2">
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={goAdGroups}
              >
                대기열에 넣기는 캠페인/그룹에서
                <ArrowRight />
              </Button>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="sm"
                      onClick={handleStartAll}
                      disabled={busy || stoppedItems.length === 0}
                    />
                  }
                >
                  <Play />
                  모두 시작
                  {stoppedItems.length > 0 && (
                    <Badge variant="secondary" className="tabular-nums">
                      {stoppedItems.length}
                    </Badge>
                  )}
                </TooltipTrigger>
                <TooltipContent>
                  대기열에서 정지 상태인 그룹의 입찰을 모두 시작합니다
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleStopAll}
                      disabled={busy || runningItems.length === 0}
                    />
                  }
                >
                  <Square />
                  모두 중지
                  {runningItems.length > 0 && (
                    <Badge variant="secondary" className="tabular-nums">
                      {runningItems.length}
                    </Badge>
                  )}
                </TooltipTrigger>
                <TooltipContent>
                  입찰 중인 그룹을 모두 중지합니다 (대기열에는 남습니다)
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="icon-sm"
                      variant="outline"
                      onClick={() => void queue.refetch()}
                      disabled={queue.isFetching}
                      aria-label="큐 새로고침"
                    />
                  }
                >
                  <RefreshCw
                    className={queue.isFetching ? "animate-spin" : undefined}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  대기열을 다시 불러옵니다 (입찰 중이면 60초마다 자동 갱신)
                </TooltipContent>
              </Tooltip>
              <InputGroup className="w-56">
                <InputGroupAddon>
                  <Search />
                </InputGroupAddon>
                <InputGroupInput
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="대기열 검색"
                  aria-label="대기열 검색"
                />
                {search && (
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      size="icon-xs"
                      onClick={() => setSearch("")}
                      aria-label="검색어 지우기"
                    >
                      <X />
                    </InputGroupButton>
                  </InputGroupAddon>
                )}
              </InputGroup>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <AutobidQueueGrid
              items={items}
              regions={regions}
              loading={queue.isLoading}
              errorMessage={queue.error?.message ?? null}
              query={query}
              selectedId={activeItem?.id ?? null}
              onSelect={selectItem}
              onStart={handleStart}
              onStop={handleStop}
              onRemove={handleRemove}
              busy={busy}
            />
          </div>
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* 하단: 선택한 그룹의 키워드. 한 번이라도 입찰을 시작해 대상이 등록된 그룹은 대상 키워드만,
          아직 시작 전이면 전체 키워드를 보여 시작 전에 희망순위 등을 설정할 수 있게 한다 */}
      <ResizablePanel defaultSize={60} minSize={25}>
        <div className="flex h-full min-h-0 flex-col pt-3">
          <BiddingKeywordGrid
            group={activeItem}
            autobidOnly={(activeItem?.targetKeywords ?? 0) > 0}
            emptyMessage="위 대기열에서 그룹을 선택하면 키워드가 여기에 표시됩니다."
          />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
