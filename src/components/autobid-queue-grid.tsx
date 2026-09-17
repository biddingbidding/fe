import { useEffect, useMemo, useRef } from "react"
import type {
  CellClickedEvent,
  ColDef,
  GetRowIdFunc,
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
import { ChevronDown } from "lucide-react"

import { gridTheme, refreshRowNumbers, rowNumberColDef } from "@/lib/ag-grid"
import { BID_STATE_META } from "@/lib/bid-state"
import { formatDateTime, formatNumber } from "@/lib/format"
import { rankRegionLabel } from "@/lib/rank-region"
import { cn } from "@/lib/utils"
import type { AutobidQueueItem, RankRegion } from "@/types/ads"

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
 * 한 번에 한 그룹만 본다. 선택의 진실은 URL(?group=)이라 그리드의 클릭 선택은 끄고
 * onCellClicked → onSelect → selectedId 변경 → 그리드 선택 동기화 순서로 흐른다.
 */
const rowSelection: RowSelectionOptions<AutobidQueueItem> = {
  mode: "singleRow",
  checkboxes: false,
  enableClickSelection: false,
}

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
  const lines = [`${meta.label} — ${meta.description}`]
  if (item.nextRunAt)
    lines.push(`다음 검토 가능 ${formatDateTime(item.nextRunAt)}`)
  return lines.join(" · ")
}

/** 행 강조 — 입찰 상태별 왼쪽 색 막대 + 옅은 배경 (index.css). 중지는 강조하지 않는다 */
const getRowClass = ({ data }: RowClassParams<AutobidQueueItem>) => {
  const rowClass = data ? BID_STATE_META[data.bidState]?.rowClass : null
  return rowClass ? `cursor-pointer ${rowClass}` : "cursor-pointer"
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

// 대기열에서는 캠페인 / 그룹 / 키워드 수 / 최근 입찰 / 순위확인지역만 본다. 입찰 시작·중지는 위의 [모두 시작]/[모두 중지],
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
}: AutobidQueueGridProps) {
  const columnDefs = useMemo(() => buildColumnDefs(rankRegions), [rankRegions])
  const overlayParams = useMemo<OverlayParams>(
    () => ({ query, errorMessage }),
    [query, errorMessage]
  )

  const gridRef = useRef<AgGridReact<AutobidQueueItem>>(null)

  /** 그리드의 선택 행을 selectedId 에 맞춘다. 행이 없어졌으면(큐에서 빠짐) 선택을 지운다 */
  function syncSelection(api: GridApi<AutobidQueueItem>) {
    const node = selectedId ? api.getRowNode(selectedId) : undefined
    if (!node) {
      api.deselectAll()
      return
    }
    if (!node.isSelected())
      api.setNodesSelected({ nodes: [node], newValue: true })
  }

  // URL 로 선택이 바뀌었거나(첫 진입·뒤로가기) 목록이 갈아끼워졌을 때
  useEffect(() => {
    const api = gridRef.current?.api
    if (api) syncSelection(api)
    // syncSelection 은 selectedId 만 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, items])

  function handleCellClicked(e: CellClickedEvent<AutobidQueueItem>) {
    if (!e.data) return
    if (e.column.getColId() === RANK_REGION_COL_ID) {
      onEditRankRegion(e.data)
      return
    }
    // URL 반영을 기다리지 않고 바로 표시해 클릭이 즉시 반응하게 한다
    e.api.setNodesSelected({ nodes: [e.node], newValue: true })
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
      rowSelection={rowSelection}
      onCellClicked={handleCellClicked}
      onSortChanged={refreshRowNumbers}
      onFilterChanged={refreshRowNumbers}
      onRowDataUpdated={({ api }) => syncSelection(api)}
      quickFilterText={query}
      loading={loading}
      overlayComponent={GridOverlay}
      overlayComponentParams={overlayParams}
      suppressCellFocus
      getRowClass={getRowClass}
    />
  )
}
