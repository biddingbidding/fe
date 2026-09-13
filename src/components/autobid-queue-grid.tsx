import { useEffect, useMemo, useRef } from "react"
import type {
  CellClickedEvent,
  ColDef,
  GetRowIdFunc,
  GridApi,
  RowSelectionOptions,
  ValueFormatterParams,
} from "ag-grid-community"
import {
  AgGridReact,
  type CustomCellRendererProps,
  type CustomOverlayProps,
} from "ag-grid-react"
import { ListMinus, Play, Square } from "lucide-react"

import { AdStatusCell } from "@/components/ad-status-cell"
import { BiddingStateCell } from "@/components/bidding-state-cell"
import { Button } from "@/components/ui/button"
import { adStatusLabel } from "@/lib/ad-status"
import { gridTheme, refreshRowNumbers, rowNumberColDef } from "@/lib/ag-grid"
import { biddingStateLabel } from "@/lib/bidding-state"
import { deviceLabel } from "@/lib/device"
import { formatNumber } from "@/lib/format"
import { priorityLabel } from "@/lib/priority"
import { regionLabel } from "@/lib/region"
import type { AutobidQueueItem, Device, Priority, Region } from "@/types/ads"

interface AutobidQueueGridProps {
  items: AutobidQueueItem[]
  regions: Region[]
  loading: boolean
  /** 목록을 못 받았을 때 빈 그리드에 보일 오류 문구 */
  errorMessage: string | null
  /** 검색어 (quick filter) */
  query: string
  /** 선택된(아래 키워드 표에 보이는) 그룹 ID */
  selectedId: string | null
  onSelect: (item: AutobidQueueItem) => void
  /** 행 끝의 [시작]/[중지] 버튼 — 그룹 하나의 입찰을 시작하거나 멈춘다 (큐에는 남는다) */
  onStart: (item: AutobidQueueItem) => void
  onStop: (item: AutobidQueueItem) => void
  /** 행 끝의 [빼기] 버튼 — 그룹 하나를 큐에서 뺀다 (입찰 중이면 같이 멈춘다) */
  onRemove: (item: AutobidQueueItem) => void
  /** 시작·중지·빼기 요청 진행 중이면 행 버튼을 잠근다 */
  busy: boolean
}

interface OverlayParams {
  query: string
  errorMessage: string | null
}

/** 행 끝의 조작 열 — 클릭이 행 선택으로 새지 않도록 따로 처리한다 */
const ACTIONS_COL_ID = "actions"

const defaultColDef: ColDef<AutobidQueueItem> = {
  resizable: true,
  sortable: true,
  suppressHeaderMenuButton: true,
}

/**
 * 한 번에 한 그룹만 본다. 선택의 진실은 URL(?group=)이라 그리드의 클릭 선택은 끄고
 * onCellClicked → onSelect → selectedId 변경 → 그리드 선택 동기화 순서로 흐른다.
 * ([빼기] 버튼 클릭이 행 선택으로 새지 않게 하기 위해서도 필요하다)
 */
const rowSelection: RowSelectionOptions<AutobidQueueItem> = {
  mode: "singleRow",
  checkboxes: false,
  enableClickSelection: false,
}

interface ActionsCellParams {
  onStart: (item: AutobidQueueItem) => void
  onStop: (item: AutobidQueueItem) => void
  onRemove: (item: AutobidQueueItem) => void
  busy: boolean
}

/** 행 끝 조작 셀 — 입찰 시작/중지 토글 버튼 + 대기열에서 빼기 */
function ActionsCell({
  data,
  onStart,
  onStop,
  onRemove,
  busy,
}: CustomCellRendererProps<AutobidQueueItem> & ActionsCellParams) {
  if (!data) return null
  const running = data.autobidEnabled
  return (
    <div className="flex h-full items-center justify-center gap-0.5">
      <Button
        variant="ghost"
        size="icon-xs"
        className={running ? "text-primary" : "text-muted-foreground"}
        disabled={busy}
        onClick={() => (running ? onStop(data) : onStart(data))}
        aria-label={`${data.name} 입찰 ${running ? "중지" : "시작"}`}
        title={running ? "입찰 중지" : "입찰 시작"}
      >
        {running ? <Square /> : <Play />}
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        className="text-muted-foreground hover:text-destructive"
        disabled={busy}
        onClick={() => onRemove(data)}
        aria-label={`${data.name} 대기열에서 빼기`}
        title="대기열에서 빼기"
      >
        <ListMinus />
      </Button>
    </div>
  )
}

/** 자동입찰 대상 키워드 수. 아직 입찰을 시작하지 않은 그룹은 0 */
const formatKeywordCount = ({
  value,
}: ValueFormatterParams<AutobidQueueItem, number>) =>
  value == null ? "" : formatNumber(value)

// 현재 API(AutobidQueueItem)로 받을 수 있는 필드만 컬럼으로 둔다. 설정 편집은 캠페인/그룹 페이지에서.
const buildColumnDefs = (
  regions: Region[],
  actionsCell: ActionsCellParams
): ColDef<AutobidQueueItem>[] => [
  rowNumberColDef<AutobidQueueItem>(),
  {
    // 입찰 상태 — 큐에 있어도 시작하지 않으면 정지. 행 끝 버튼으로 바꾼다
    colId: "biddingState",
    headerName: "입찰 상태",
    width: 100,
    valueGetter: ({ data }) =>
      data ? biddingStateLabel(data.autobidEnabled) : "",
    cellRenderer: BiddingStateCell,
  },
  { field: "campaignName", headerName: "캠페인명", flex: 1, minWidth: 160 },
  { field: "name", headerName: "그룹명", flex: 1, minWidth: 160 },
  {
    // 큐에 있어도 네이버에서 광고가 꺼져 있으면 입찰해도 노출이 안 된다 — 여기서 바로 보이게
    colId: "adStatus",
    headerName: "광고 상태",
    width: 170,
    valueGetter: ({ data }) => (data ? adStatusLabel(data) : ""),
    tooltipValueGetter: ({ data }) => (data ? adStatusLabel(data) : undefined),
    cellRenderer: AdStatusCell,
  },
  {
    colId: "region",
    headerName: "지역",
    width: 100,
    valueGetter: ({ data }) => data?.region ?? null,
    valueFormatter: ({
      value,
    }: ValueFormatterParams<AutobidQueueItem, string | null>) =>
      regionLabel(regions, value),
  },
  {
    colId: "device",
    headerName: "기기",
    width: 90,
    valueGetter: ({ data }) => data?.device ?? null,
    valueFormatter: ({
      value,
    }: ValueFormatterParams<AutobidQueueItem, Device | null>) =>
      deviceLabel(value),
  },
  {
    colId: "priority",
    headerName: "우선순위",
    width: 100,
    valueGetter: ({ data }) => data?.priority ?? null,
    valueFormatter: ({
      value,
    }: ValueFormatterParams<AutobidQueueItem, Priority | null>) =>
      priorityLabel(value),
  },
  {
    field: "targetKeywords",
    headerName: "키워드",
    width: 90,
    cellClass: "tabular-nums text-right",
    valueFormatter: formatKeywordCount,
  },
  {
    colId: ACTIONS_COL_ID,
    headerName: "",
    width: 76,
    sortable: false,
    resizable: false,
    suppressMovable: true,
    cellRenderer: ActionsCell,
    cellRendererParams: actionsCell,
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
 * 선택 행은 그리드 선택색으로 표시하고, 행 끝의 버튼으로 입찰을 시작/중지하거나 그룹을 대기열에서 뺄 수 있다.
 */
export function AutobidQueueGrid({
  items,
  regions,
  loading,
  errorMessage,
  query,
  selectedId,
  onSelect,
  onStart,
  onStop,
  onRemove,
  busy,
}: AutobidQueueGridProps) {
  const columnDefs = useMemo(
    () => buildColumnDefs(regions, { onStart, onStop, onRemove, busy }),
    [regions, onStart, onStop, onRemove, busy]
  )
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
    if (!e.data || e.column.getColId() === ACTIONS_COL_ID) return
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
      rowClass="cursor-pointer"
    />
  )
}
