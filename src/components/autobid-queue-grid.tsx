import { useEffect, useMemo, useRef } from "react"
import type {
  CellClickedEvent,
  ColDef,
  GetRowIdFunc,
  IHeaderParams,
  RowClassParams,
  GridApi,
  RowSelectionOptions,
  ValueFormatterParams,
} from "ag-grid-community"
import {
  AgGridReact,
  type CustomCellRendererProps,
  type CustomOverlayProps,
} from "ag-grid-react"
import { ChevronDown, CircleQuestionMark } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { gridTheme, refreshRowNumbers, rowNumberColDef } from "@/lib/ag-grid"
import { BID_STATE_META } from "@/lib/bid-state"
import { DEVICE_OPTIONS, deviceLabel } from "@/lib/device"
import { formatDateTime, formatNumber } from "@/lib/format"
import { rankRegionLabel } from "@/lib/rank-region"
import { cn } from "@/lib/utils"
import type { AutobidQueueItem, Device, RankRegion } from "@/types/ads"

interface AutobidQueueGridProps {
  items: AutobidQueueItem[]
  loading: boolean
  /** 목록을 못 받았을 때 빈 그리드에 보일 오류 문구 */
  errorMessage: string | null
  /** 검색어 (quick filter) */
  query: string
  /** 선택된(아래 키워드 표에 보이는) 그룹 ID */
  selectedId: string | null
  onSelect: (item: AutobidQueueItem) => void
  /** 순위확인지역 목록 (셀에 "서울 송파구" 처럼 짧은 이름을 보이는 데 쓴다) */
  rankRegions: RankRegion[]
  /** 순위확인지역 셀 클릭 — 선택 다이얼로그를 연다 */
  onEditRankRegion: (item: AutobidQueueItem) => void
  /** 기기 드롭다운에서 고른 값 — 바로 저장한다 */
  onChangeDevice: (item: AutobidQueueItem, device: Device) => void
  /** 체크박스로 고른 행이 바뀔 때 (대기열 빼기 대상) */
  onCheckedChange: (items: AutobidQueueItem[]) => void
  /** 입찰 속도 드롭다운 — 바로 저장한다 (singleStep = 천천히) */
  onChangeBidSpeed: (item: AutobidQueueItem, singleStep: boolean) => void
}

/** 셀 렌더러가 콜백을 쓰도록 그리드 context 로 넘기는 것들 (컬럼 정의를 매번 다시 만들지 않으려고) */
interface QueueGridContext {
  onChangeDevice: (item: AutobidQueueItem, device: Device) => void
  onChangeBidSpeed: (item: AutobidQueueItem, singleStep: boolean) => void
}

interface OverlayParams {
  query: string
  errorMessage: string | null
}

const defaultColDef: ColDef<AutobidQueueItem> = {
  resizable: true,
  sortable: true,
  suppressHeaderMenuButton: true,
  // 모든 열 헤더 가운데 정렬 (셀 정렬은 열마다)
  headerClass: "ag-header-center",
}

/**
 * 체크박스는 "대기열에서 빼기" 대상 고르기 전용이다 (여러 개).
 * 아래 키워드 표에 보이는 그룹(selectedId)은 이와 별개로 URL(?group=)이 정하고, 행에 테두리로 표시한다.
 * 행 클릭으로는 체크되지 않게 해 두 가지가 섞이지 않도록 한다.
 */
const rowSelection: RowSelectionOptions<AutobidQueueItem> = {
  mode: "multiRow",
  checkboxes: true,
  headerCheckbox: true,
  selectAll: "filtered",
  enableClickSelection: false,
}

/** 체크박스 열 — 맨 왼쪽 고정 폭 */
const selectionColumnDef: ColDef<AutobidQueueItem> = {
  width: 44,
  resizable: false,
  suppressMovable: true,
}

/** 체크박스 열의 고정 colId — 이 열 클릭은 그룹 선택으로 보지 않는다 */
const SELECTION_COL_ID = "ag-Grid-SelectionColumn"

/** 자동입찰 대상 키워드 수. 아직 입찰을 시작하지 않은 그룹은 0 */
const formatKeywordCount = ({
  value,
}: ValueFormatterParams<AutobidQueueItem, number>) =>
  value == null ? "" : formatNumber(value)

/** 최근 입찰 = 네이버에 입찰가를 실제로 보낸 마지막 시각. 유지로만 끝났거나 시작 전이면 "-" */
const formatLastSent = ({
  value,
}: ValueFormatterParams<AutobidQueueItem, string | null>) =>
  value ? formatDateTime(value) : "-"

/** 그룹명 셀 — 앞에 입찰 상태 점. 입찰 중이면 점이 퍼지는 효과로 돌고 있음을 보인다 */
function GroupNameCell({
  data,
}: CustomCellRendererProps<AutobidQueueItem, string>) {
  if (!data) return null
  const meta = BID_STATE_META[data.bidState] ?? BID_STATE_META.STOPPED
  return (
    <div className="flex h-full min-w-0 items-center gap-2">
      <span className="relative flex size-2 shrink-0" aria-hidden>
        {data.bidState === "RUNNING" && (
          <span
            className={cn(
              "absolute inline-flex size-full animate-ping rounded-full opacity-60",
              meta.dotClass
            )}
          />
        )}
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full",
            meta.dotClass
          )}
        />
      </span>
      <span className="sr-only">{meta.label}</span>
      <span className="truncate">{data.name}</span>
    </div>
  )
}

/** 그룹명 툴팁 — 상태 설명과 다음 검토 가능 시각 */
function bidStateTooltip(item: AutobidQueueItem): string {
  const meta = BID_STATE_META[item.bidState] ?? BID_STATE_META.STOPPED
  const lines = [`${meta.label}: ${meta.description}`]
  if (item.nextRunAt)
    lines.push(`다음 검토 가능 ${formatDateTime(item.nextRunAt)}`)
  return lines.join(" · ")
}

/**
 * 행 강조 — 입찰 상태별 왼쪽 색 막대 + 옅은 배경 (index.css). 중지는 강조하지 않는다.
 * 아래 키워드 표에 보이는 그룹은 queue-row-active 로 테두리를 둘러 체크된 행(배경색)과 구분한다.
 */
const buildGetRowClass =
  (selectedId: string | null) =>
  ({ data }: RowClassParams<AutobidQueueItem>) => {
    const classes = ["cursor-pointer"]
    const stateClass = data ? BID_STATE_META[data.bidState]?.rowClass : null
    if (stateClass) classes.push(stateClass)
    if (data && data.id === selectedId) classes.push("queue-row-active")
    return classes.join(" ")
  }

/** 순위확인지역 열 — 클릭하면 행 선택 대신 선택 다이얼로그를 연다 */
const RANK_REGION_COL_ID = "rankRegion"

/** 순위확인지역 셀 — 누를 수 있다는 것이 보이도록 이름 옆에 화살표를 둔다. 미설정이면 흐리게 */
function RankRegionCell({
  data,
  valueFormatted,
}: CustomCellRendererProps<AutobidQueueItem, string | null>) {
  if (!data) return null
  return (
    <div
      className={cn(
        "flex h-full items-center justify-between gap-1 hover:text-primary",
        !data.rankRegion && "text-muted-foreground"
      )}
    >
      <span className="truncate">{valueFormatted}</span>
      <ChevronDown className="size-3.5 shrink-0 opacity-60" />
    </div>
  )
}

/** 기기 열 — 클릭하면 행 선택 대신 드롭다운이 열린다 */
const DEVICE_COL_ID = "device"

/** 기기 셀 — PC / 모바일을 그 자리에서 고른다. 고르는 즉시 저장된다 */
function DeviceCell({
  data,
  context,
}: CustomCellRendererProps<AutobidQueueItem, Device>) {
  if (!data) return null
  const item = data
  const { onChangeDevice } = context as QueueGridContext
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-full w-full items-center justify-between gap-1 outline-none hover:text-primary">
        <span className="truncate">{deviceLabel(item.device)}</span>
        <ChevronDown className="size-3.5 shrink-0 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          value={item.device}
          onValueChange={(value) => onChangeDevice(item, value as Device)}
        >
          {DEVICE_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** 입찰 속도 열 — 드롭다운이 클릭을 처리하므로 행 선택을 바꾸지 않는다 */
const BID_SPEED_COL_ID = "singleStep"

/** 설명이 필요한 열의 헤더 — 이름 옆 ? 에 마우스를 올리면 동작을 풀어서 보여 준다 */
function HelpHeader({
  displayName,
  help,
}: IHeaderParams<AutobidQueueItem> & { help: React.ReactNode }) {
  return (
    <span className="flex w-full items-center justify-center gap-1">
      <span className="truncate">{displayName}</span>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              tabIndex={0}
              role="button"
              aria-label={`${displayName} 설명`}
              className="flex cursor-help items-center text-muted-foreground hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
            />
          }
        >
          <CircleQuestionMark className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent className="max-w-70 flex-col items-start gap-1 py-2 text-left">
          {help}
        </TooltipContent>
      </Tooltip>
    </span>
  )
}

/** 입찰 속도 헤더의 ? 설명 — 두 선택지를 같은 상황으로 견줘 보인다 */
const BID_SPEED_HELP = (
  <>
    <span className="font-medium">한 번 검토에 얼마나 움직일지</span>
    <span>
      빠르게(기본): 순위가 밀린 칸수만큼 가감액을 곱해 한 번에 올립니다. 희망 1위인데
      5위면 가감액 100원 × 4칸 = 400원.
    </span>
    <span>천천히: 순위와 상관없이 가감액 1회만. 위 상황에서 100원.</span>
    <span className="text-background/70">
      어느 쪽이든 입찰가 한도는 넘지 않습니다.
    </span>
  </>
)

/** 입찰 속도 선택지 — 값은 "가감액 1회만 쓰는가"(서버의 singleStep) */
const BID_SPEED_OPTIONS: { value: string; label: string; singleStep: boolean }[] =
  [
    { value: "fast", label: "빠르게", singleStep: false },
    { value: "slow", label: "천천히", singleStep: true },
  ]

const bidSpeedValue = (singleStep: boolean) => (singleStep ? "slow" : "fast")
const bidSpeedLabel = (singleStep: boolean) => (singleStep ? "천천히" : "빠르게")

/**
 * 입찰 속도 셀 — 빠르게(순위차 × 가감액, 기본) / 천천히(가감액 1회).
 * 기기 셀과 같은 드롭다운 모양으로 둬서 같은 종류의 설정임을 보인다.
 */
function BidSpeedCell({
  data,
  context,
}: CustomCellRendererProps<AutobidQueueItem, boolean>) {
  if (!data) return null
  const item = data
  const { onChangeBidSpeed } = context as QueueGridContext
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-full w-full items-center justify-between gap-1 outline-none hover:text-primary">
        <span className="truncate">{bidSpeedLabel(item.singleStep)}</span>
        <ChevronDown className="size-3.5 shrink-0 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          value={bidSpeedValue(item.singleStep)}
          onValueChange={(value) =>
            onChangeBidSpeed(
              item,
              !!BID_SPEED_OPTIONS.find((o) => o.value === value)?.singleStep
            )
          }
        >
          {BID_SPEED_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// 대기열에서는 캠페인 / 그룹 / 키워드 수 / 최근 입찰 / 기기 / 입찰 속도 / 순위확인지역만 본다. 입찰 시작·중지는 위의 [모두 시작]/[모두 중지],
// 광고 상태·지역·기기·우선순위는 이 표에 두지 않는다. 대기열 빼기는 캠페인/그룹 페이지의 [대기열] 스위치로.
// 순위확인지역 이름을 목록에서 찾아야 해서 컬럼 정의는 함수로 만든다 (컴포넌트에서 useMemo).
const buildColumnDefs = (
  rankRegions: RankRegion[]
): ColDef<AutobidQueueItem>[] => [
  rowNumberColDef<AutobidQueueItem>(),
  { field: "campaignName", headerName: "캠페인명", flex: 1, minWidth: 160 },
  {
    field: "name",
    headerName: "그룹명",
    flex: 1,
    minWidth: 160,
    cellRenderer: GroupNameCell,
    tooltipValueGetter: ({ data }) =>
      data ? bidStateTooltip(data) : undefined,
    // "입찰 중" 같은 상태 문구로도 검색되게
    getQuickFilterText: ({ data }) =>
      data ? `${data.name} ${BID_STATE_META[data.bidState]?.label ?? ""}` : "",
  },
  {
    field: "targetKeywords",
    headerName: "키워드",
    width: 90,
    cellClass: "tabular-nums text-center",
    valueFormatter: formatKeywordCount,
  },
  {
    field: "lastSentAt",
    headerName: "최근 입찰",
    width: 140,
    cellClass: "tabular-nums text-center text-muted-foreground",
    valueFormatter: formatLastSent,
    // 입찰가를 안 바꾼 검토도 있으니 마지막 검토 시각은 툴팁으로
    tooltipValueGetter: ({ data }) =>
      data?.lastRunAt
        ? `최근 검토 ${formatDateTime(data.lastRunAt)}`
        : undefined,
  },
  {
    colId: DEVICE_COL_ID,
    field: "device",
    headerName: "기기",
    width: 100,
    cellClass: "cursor-pointer",
    valueFormatter: ({ data }) => deviceLabel(data?.device),
    // "모바일" 로도 검색되게 (원값은 MOBILE)
    getQuickFilterText: ({ data }) => deviceLabel(data?.device),
    cellRenderer: DeviceCell,
  },
  {
    colId: BID_SPEED_COL_ID,
    field: "singleStep",
    headerName: "입찰 속도",
    width: 120,
    cellClass: "cursor-pointer",
    cellRenderer: BidSpeedCell,
    // "천천히" 로도 검색되게 (원값은 true/false)
    getQuickFilterText: ({ data }) =>
      data ? bidSpeedLabel(data.singleStep) : "",
    headerComponent: HelpHeader,
    headerComponentParams: { help: BID_SPEED_HELP },
  },
  {
    colId: RANK_REGION_COL_ID,
    field: "rankRegion",
    headerName: "순위확인지역",
    width: 160,
    cellClass: "cursor-pointer",
    valueFormatter: ({ data }) =>
      rankRegionLabel(rankRegions, data?.rankRegion, data?.rankRegionName),
    // "송파" 로도 검색되게 표시 이름을 quick filter 에 넣는다
    getQuickFilterText: ({ data }) =>
      rankRegionLabel(rankRegions, data?.rankRegion, data?.rankRegionName),
    cellRenderer: RankRegionCell,
  },
]

const getRowId: GetRowIdFunc<AutobidQueueItem> = ({ data }) => data.id

function GridOverlay({
  overlayType,
  query,
  errorMessage,
}: CustomOverlayProps<AutobidQueueItem> & OverlayParams) {
  let message: React.ReactNode
  switch (overlayType) {
    case "loading":
      message = "자동입찰 큐를 불러오는 중..."
      break
    case "noRows":
      message = errorMessage ? (
        <>
          자동입찰 큐를 불러오지 못했습니다.
          <br />
          <span className="opacity-70">{errorMessage}</span>
        </>
      ) : (
        "대기열이 비어 있습니다. 캠페인/그룹 페이지에서 그룹을 대기열에 넣으세요."
      )
      break
    case "noMatchingRows":
      message = query ? "검색 결과가 없습니다." : null
      break
    default:
      return null
  }
  return <p className="text-center text-sm text-muted-foreground">{message}</p>
}

/**
 * 자동 입찰 페이지 상단 — 자동입찰 대기열(큐) 목록. 행을 클릭하면 아래 키워드 표가 그 그룹으로 바뀐다.
 * 선택 행은 그리드 선택색으로 표시한다. 입찰 시작/중지는 페이지 위의 버튼으로 한다.
 */
export function AutobidQueueGrid({
  items,
  loading,
  errorMessage,
  query,
  selectedId,
  onSelect,
  rankRegions,
  onEditRankRegion,
  onChangeDevice,
  onCheckedChange,
  onChangeBidSpeed,
}: AutobidQueueGridProps) {
  const columnDefs = useMemo(() => buildColumnDefs(rankRegions), [rankRegions])
  const overlayParams = useMemo<OverlayParams>(
    () => ({ query, errorMessage }),
    [query, errorMessage]
  )
  const context = useMemo<QueueGridContext>(
    () => ({ onChangeDevice, onChangeBidSpeed }),
    [onChangeDevice, onChangeBidSpeed]
  )

  const gridRef = useRef<AgGridReact<AutobidQueueItem>>(null)
  const getRowClass = useMemo(() => buildGetRowClass(selectedId), [selectedId])

  // getRowClass 는 행을 다시 그릴 때만 반영되므로, 보고 있는 그룹이 바뀌면 직접 다시 그린다
  useEffect(() => {
    gridRef.current?.api?.redrawRows()
  }, [selectedId])

  /** 체크된 행을 부모에 알린다 (빠져서 사라진 행은 그리드가 알아서 체크를 푼다) */
  function emitChecked(api: GridApi<AutobidQueueItem>) {
    onCheckedChange(api.getSelectedRows())
  }

  function handleCellClicked(e: CellClickedEvent<AutobidQueueItem>) {
    if (!e.data) return
    // 체크박스 열은 빼기 대상 고르기 전용 — 보고 있는 그룹을 바꾸지 않는다
    if (e.column.getColId() === SELECTION_COL_ID) return
    if (e.column.getColId() === RANK_REGION_COL_ID) {
      onEditRankRegion(e.data)
      return
    }
    // 기기·입찰 속도 셀은 드롭다운이 처리한다
    if (e.column.getColId() === DEVICE_COL_ID) return
    if (e.column.getColId() === BID_SPEED_COL_ID) return
    onSelect(e.data)
  }

  return (
    <AgGridReact<AutobidQueueItem>
      ref={gridRef}
      theme={gridTheme}
      rowData={items}
      getRowId={getRowId}
      columnDefs={columnDefs}
      defaultColDef={defaultColDef}
      context={context}
      rowSelection={rowSelection}
      selectionColumnDef={selectionColumnDef}
      onCellClicked={handleCellClicked}
      onSelectionChanged={({ api }) => emitChecked(api)}
      onSortChanged={refreshRowNumbers}
      onFilterChanged={refreshRowNumbers}
      onRowDataUpdated={({ api }) => emitChecked(api)}
      quickFilterText={query}
      loading={loading}
      overlayComponent={GridOverlay}
      overlayComponentParams={overlayParams}
      suppressCellFocus
      getRowClass={getRowClass}
    />
  )
}
