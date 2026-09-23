import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  CellEditRequestEvent,
  ColDef,
  ColGroupDef,
  GetRowIdFunc,
  IErrorValidationParams,
  RowDataUpdatedEvent,
  RowSelectionOptions,
  SelectionChangedEvent,
  ValueFormatterParams,
} from "ag-grid-community"
import {
  AgGridReact,
  type CustomCellRendererProps,
  type CustomHeaderGroupProps,
  type CustomOverlayProps,
} from "ag-grid-react"
import {
  ChartLine,
  ChevronDown,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react"
import { overlay } from "overlay-kit"
import { toast } from "sonner"

import { BulkBidSettingDialog } from "@/components/bulk-bid-setting-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  useAdGroupKeywords,
  useBulkUpdateKeywordSettings,
  useUpdateKeywordSetting,
} from "@/hooks/use-ad-groups"
import { gridTheme, refreshRowNumbers, rowNumberColDef } from "@/lib/ag-grid"
import {
  BID_SETTING_RULES,
  RANK_MAX,
  toSettingValue,
} from "@/lib/bid-setting-rules"
import { deviceLabel } from "@/lib/device"
import { formatDateTime, formatNumber } from "@/lib/format"
import { openNaverSearch } from "@/lib/naver"
import { openKeywordBidLogDialog } from "@/lib/overlays"
import {
  STATS_PERIOD_OPTIONS,
  formatStatsPeriod,
  loadStatsPeriod,
  saveStatsPeriod,
  statsPeriodLabel,
} from "@/lib/stats-period"
import { errorMessage } from "@/lib/toast"
import type {
  AdGroup,
  AdGroupKeyword,
  Device,
  BidSettingValues,
  KeywordStats,
  StatsPeriod,
} from "@/types/ads"

interface BiddingKeywordGridProps {
  /** 선택된 그룹. 없으면 안내 문구만 보인다 */
  group: AdGroup | null
  /**
   * true 면 자동입찰 대상으로 등록된 키워드만 보이고(GET ...?autobidOnly=true) "자동입찰" 열(최근 입찰가·검토 시각)이 붙는다.
   * 자동 입찰 페이지에서 큐 항목을 눌렀을 때 쓴다. 그룹을 켠 뒤 네이버에 새로 추가한 키워드는 대상이 아니라 빠진다.
   */
  autobidOnly?: boolean
  /** 그룹이 없을 때 보일 안내 문구 */
  emptyMessage?: string
}

interface OverlayParams {
  query: string
  errorMessage: string | null
  /** 자동입찰 대상만 보는 중이면 빈 목록 문구를 바꾼다 */
  autobidOnly: boolean
}

// 헤더·셀 모두 가운데 정렬. cellClass 는 컬럼에서 덮어쓰면 합쳐지지 않으니 각자 text-center 를 포함한다.
const defaultColDef: ColDef<AdGroupKeyword> = {
  resizable: true,
  sortable: true,
  suppressHeaderMenuButton: true,
  headerClass: "ag-header-center",
  cellClass: "text-center",
}

/** 셀 정렬. 금액 열은 자릿수를 맞춰 비교하기 쉽도록 오른쪽 정렬(헤더는 그대로 가운데) */
type CellAlign = "center" | "right"
const ALIGN_CLASS: Record<CellAlign, string> = {
  center: "text-center",
  right: "text-right",
}

/**
 * 컬럼 폭을 그리드 폭에 맞춰 자동 배분한다. width 는 비중(flex)으로 쓰고,
 * 그 70% 아래로는 줄이지 않는다 — 그보다 좁아지면 가로 스크롤로 전환된다.
 */
const fit = (width: number): Partial<ColDef<AdGroupKeyword>> => ({
  flex: width,
  minWidth: Math.round(width * 0.7),
})

/**
 * 일괄 설정 대상은 체크박스로 고른다. 전체 선택은 검색으로 걸러진 행 기준.
 * 행 클릭은 셀 편집(더블클릭/Enter)과 겹치므로 체크박스로만 선택한다.
 */
const rowSelection: RowSelectionOptions<AdGroupKeyword> = {
  mode: "multiRow",
  checkboxes: true,
  headerCheckbox: true,
  selectAll: "filtered",
  enableClickSelection: false,
}

const selectionColumnDef: ColDef<AdGroupKeyword> = {
  width: 44,
  resizable: false,
  suppressMovable: true,
}

/**
 * 사용자가 편집하는 셀. 배경을 살짝 칠해 편집 가능함을 알린다.
 * 셀 편집 검증 규칙(BID_SETTING_RULES)에서 빈 값(NaN)은 "미입력으로 되돌리기"라서 허용한다.
 * 그리드의 invalidEditValueMode="block" 과 함께 쓰면 규칙을 어긴 값은 저장되지 않고
 * 에디터가 열린 채 오류 메시지(툴팁)가 보인다. Esc 로 취소할 수 있다.
 * 주의: 에디터에 min/max/step 을 넘기지 않는다 — <input type=number> 가 invalid 판정하면
 * 숫자 에디터가 값을 undefined 로 돌려줘 cellEditRequest 자체가 발행되지 않는다(조용히 무시됨).
 * 대신 getValidationErrors 로 검증해 그리드가 커밋을 막고 오류를 보여주게 한다.
 */
function editableCell(
  field: keyof BidSettingValues,
  align: CellAlign = "center"
): Partial<ColDef<AdGroupKeyword>> {
  const rule = BID_SETTING_RULES[field]
  return {
    cellClass: `tabular-nums ${ALIGN_CLASS[align]} bg-primary/8`,
    editable: true,
    cellEditor: "agNumberCellEditor",
    cellEditorParams: {
      precision: 0,
      getValidationErrors: ({ value }: IErrorValidationParams) => {
        // value 는 input.valueAsNumber — 비어 있으면 NaN
        if (typeof value !== "number" || Number.isNaN(value)) return null
        const error = rule(value)
        return error ? [error] : null
      },
    },
  }
}

const formatWon = ({
  value,
}: ValueFormatterParams<AdGroupKeyword, number | null>) =>
  value == null ? "" : `${formatNumber(value)}원`

/** 그룹 기본 입찰가를 따르는 키워드의 표시 문구 — 값 자체는 네이버가 키워드 응답에 주지 않는다 */
const GROUP_BID_LABEL = "그룹 기본"

/**
 * 지금 네이버에 설정되어 있는 입찰가. useGroupBidAmt 면 키워드 값이 아니라 그룹 기본 입찰가로 노출되므로
 * 금액 대신 "그룹 기본" 으로 보인다 (자동입찰이 값을 바꾸면 키워드 자체 입찰가로 전환된다).
 */
const formatCurrentBid = ({
  data,
  value,
}: ValueFormatterParams<AdGroupKeyword, number | null>) => {
  if (!data) return ""
  if (data.useGroupBidAmt) return GROUP_BID_LABEL
  return value == null ? "" : `${formatNumber(value)}원`
}

// 희망순위는 "3/15" 처럼 최대 순위(RANK_MAX)를 접미사로 붙여 범위를 함께 보여준다.
// 미입력 셀에도 "/15" 를 기본으로 보여 입력 가능한 범위를 알 수 있게 한다. (복사·내보내기용 문자열)
const formatRank = ({
  value,
}: ValueFormatterParams<AdGroupKeyword, number | null>) =>
  `${value ?? ""}/${RANK_MAX}`

// 화면에서는 값은 가운데, "/15" 는 셀 오른쪽 끝에 고정한다.
function RankCell({
  value,
}: CustomCellRendererProps<AdGroupKeyword, number | null>) {
  return (
    <span className="flex h-full items-center">
      <span className="flex-1 text-center">{value ?? ""}</span>
      <span className="text-muted-foreground">/{RANK_MAX}</span>
    </span>
  )
}

/** 셀 렌더러가 쓰는 값 — 검색 결과를 어느 기기로 볼지, 입찰 기록 아이콘을 붙일지 */
interface KeywordGridContext {
  device: Device
  withAutobid: boolean
}

/**
 * 키워드 이름 셀 — 이름을 누르면 그 키워드의 네이버 검색 결과가 새 탭으로 열린다
 * (그룹의 기기 설정이 모바일이면 m.search.naver.com).
 * 자동입찰 대상만 보는 중이면 오른쪽 아이콘으로 입찰 기록(그래프·표)을 연다.
 */
function KeywordCell({
  data,
  value,
  context,
}: CustomCellRendererProps<AdGroupKeyword, string>) {
  if (!data) return value
  const keyword = data
  const { device, withAutobid } = context as KeywordGridContext
  return (
    <div className="flex h-full items-center justify-center gap-1.5">
      <button
        type="button"
        onClick={() => openNaverSearch(keyword.keyword, device)}
        title={`네이버 ${deviceLabel(device)} 검색으로 열기`}
        className="truncate font-medium text-primary underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
      >
        {value}
      </button>
      {withAutobid && (
        <button
          type="button"
          onClick={() => openKeywordBidLogDialog(keyword)}
          title="입찰 기록 보기"
          aria-label={`${keyword.keyword} 입찰 기록 보기`}
          className="shrink-0 text-muted-foreground hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
        >
          <ChartLine className="size-3.5" />
        </button>
      )}
    </div>
  )
}

// ── 실적(stats) 포맷터. 통계 조회 실패(stats null)나 네이버가 값을 안 주면 "-" ──
type StatsFormatter = (
  p: ValueFormatterParams<AdGroupKeyword, number | null>
) => string
const formatCount: StatsFormatter = ({ value }) =>
  value == null ? "-" : formatNumber(value)
const formatStatWon: StatsFormatter = ({ value }) =>
  value == null ? "-" : `${formatNumber(Math.round(value))}원`
const formatPercent: StatsFormatter = ({ value }) =>
  value == null ? "-" : `${value.toFixed(2)}%`
// 노출이 없어 값이 없으면 0.0 으로 (소수 한 자리 고정)
const rank1 = (v: number | null | undefined) => (v ?? 0).toFixed(1)

/** PC·모바일 평균 노출 순위를 한 셀에 "1.2 / 3.4" 로. 정렬은 PC → 모바일 순 */
type AvgRankPair = [pc: number | null, mobile: number | null]
const avgRankCol: ColDef<AdGroupKeyword> = {
  colId: "avgRank",
  headerName: "평균 노출 순위 (PC / 모바일)",
  ...fit(170),
  cellClass: "tabular-nums text-center",
  valueGetter: ({ data }): AvgRankPair => [
    data?.stats?.pcAvgRank ?? null,
    data?.stats?.mobileAvgRank ?? null,
  ],
  valueFormatter: ({
    value,
  }: ValueFormatterParams<AdGroupKeyword, AvgRankPair>) =>
    `${rank1(value?.[0])} / ${rank1(value?.[1])}`,
  comparator: (a: AvgRankPair, b: AvgRankPair) => {
    // null(노출 없음)은 항상 뒤로
    const cmp = (x: number | null, y: number | null) =>
      x == null && y == null ? 0 : x == null ? 1 : y == null ? -1 : x - y
    return cmp(a[0], b[0]) || cmp(a[1], b[1])
  },
}

/** 실적 컬럼 하나. stats 의 필드를 읽고 숫자 셀로 보여준다 */
function statCol(
  field: keyof KeywordStats,
  headerName: string,
  width: number,
  valueFormatter: StatsFormatter,
  align: CellAlign = "center"
): ColDef<AdGroupKeyword> {
  return {
    colId: field,
    headerName,
    ...fit(width),
    cellClass: `tabular-nums ${ALIGN_CLASS[align]}`,
    valueGetter: ({ data }) => data?.stats?.[field] ?? null,
    valueFormatter,
  }
}

// 현재 API(KeywordRead)로 받을 수 있는 필드만 컬럼으로 둔다.
interface StatsGroupHeaderParams {
  period: StatsPeriod
  onPeriodChange: (period: StatsPeriod) => void
}

/**
 * "실적" 그룹 헤더 — 라벨 오른쪽에 기간 선택 드롭다운(프리셋 이름 + 오늘 기준 날짜 구간).
 * 헤더 안의 클릭이 컬럼 드래그·정렬로 새지 않도록 pointerdown 전파를 막는다.
 */
function StatsGroupHeader({
  displayName,
  period,
  onPeriodChange,
}: CustomHeaderGroupProps<AdGroupKeyword> & StatsGroupHeaderParams) {
  return (
    <div className="flex w-full items-center justify-center gap-2">
      <span>{displayName}</span>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="xs"
              className="font-normal text-muted-foreground"
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="실적 기간 선택"
            />
          }
        >
          {statsPeriodLabel(period)}
          <span className="tabular-nums">{formatStatsPeriod(period)}</span>
          <ChevronDown data-icon="inline-end" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center">
          <DropdownMenuRadioGroup
            value={period}
            onValueChange={(v) => onPeriodChange(v as StatsPeriod)}
          >
            {STATS_PERIOD_OPTIONS.map((o) => (
              <DropdownMenuRadioItem key={o.value} value={o.value}>
                {o.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** 자동입찰 상태(autobid) 시각 열 — 아직 없으면 "-" */
const formatAutobidTime = ({
  value,
}: ValueFormatterParams<AdGroupKeyword, string | null>) =>
  value ? formatDateTime(value) : "-"

/**
 * 현재 순위 열 — 마지막 검토에서 결정한 입찰가의 예상 순위. 현재 입찰가 바로 오른쪽에 둬서
 * "지금 이 값으로 몇 위" 로 읽히게 한다. 자동입찰 대상만 보는 중일 때만 붙는다 (그 밖에는 값이 없다).
 * 순위 축 끝(PC 10 · 모바일 5)을 넘으면 그 밖이라는 뜻이라 "10위 밖" 으로 보인다.
 */
const lastRankCol: ColDef<AdGroupKeyword> = {
  colId: "lastRank",
  headerName: "현재 순위",
  ...fit(100),
  cellClass: "tabular-nums text-center",
  valueGetter: ({ data }) => data?.autobid?.lastRank ?? null,
  valueFormatter: ({ data }) => {
    const rank = data?.autobid?.lastRank
    if (rank == null) return "-"
    const max = data?.autobid?.lastMaxPosition
    return max != null && rank > max ? `${max}위 밖` : `${rank}위`
  },
  tooltipValueGetter: ({ data }) =>
    data?.autobid?.lastRank == null
      ? "아직 순위를 계산하지 못했습니다 (검토 전이거나 네이버 예상가를 못 받음)"
      : "마지막 검토 시점의 예상 순위입니다. 네이버 예상 입찰가로 추정한 값이라 실제 노출 순위와 다를 수 있습니다",
}

/**
 * "자동입찰" 그룹 — 엔진이 마지막으로 계산한 입찰가와 검토 시각. autobidOnly 모드(자동 입찰 페이지)에서만 붙인다.
 * lastReason 은 셀 툴팁으로 보인다.
 */
const autobidColGroup: ColGroupDef<AdGroupKeyword> = {
  groupId: "autobid",
  headerName: "자동입찰",
  headerClass: "ag-header-center",
  marryChildren: true,
  children: [
    {
      colId: "lastBid",
      headerName: "최근 입찰가",
      ...fit(110),
      cellClass: "tabular-nums text-right",
      valueGetter: ({ data }) => data?.autobid?.lastBid ?? null,
      valueFormatter: formatStatWon,
      tooltipValueGetter: ({ data }) => data?.autobid?.lastReason ?? undefined,
    },
    {
      colId: "lastRunAt",
      headerName: "최근 검토",
      ...fit(130),
      cellClass: "tabular-nums text-center text-muted-foreground",
      valueGetter: ({ data }) => data?.autobid?.lastRunAt ?? null,
      valueFormatter: formatAutobidTime,
      tooltipValueGetter: ({ data }) => data?.autobid?.lastReason ?? undefined,
    },
  ],
}

// 헤더는 2단: 실적 컬럼들은 "실적" 그룹 아래에 묶인다.
// 기간 선택 상태를 헤더에 넘겨야 해서 컬럼 정의는 함수로 만든다 (컴포넌트에서 useMemo).
const buildColumnDefs = (
  statsHeader: StatsGroupHeaderParams,
  withAutobid: boolean
): (ColDef<AdGroupKeyword> | ColGroupDef<AdGroupKeyword>)[] => [
  rowNumberColDef<AdGroupKeyword>(),
  {
    field: "keyword",
    headerName: "키워드",
    ...fit(200),
    cellClass: "font-medium text-center",
    cellRenderer: KeywordCell,
  },
  {
    field: "bidAmt",
    headerName: "현재 입찰가",
    ...fit(120),
    cellClass: ({ data }) =>
      data?.useGroupBidAmt
        ? "tabular-nums text-right text-muted-foreground"
        : "tabular-nums text-right",
    valueFormatter: formatCurrentBid,
    tooltipValueGetter: ({ data }) =>
      data?.useGroupBidAmt
        ? "그룹 기본 입찰가를 따르는 키워드입니다. 자동입찰이 입찰가를 바꾸면 키워드 자체 입찰가로 바뀝니다"
        : "지금 네이버에 설정된 키워드 입찰가입니다",
  },
  ...(withAutobid ? [lastRankCol] : []),
  {
    colId: "targetRank",
    headerName: "희망순위",
    ...fit(100),
    ...editableCell("targetRank"),
    valueGetter: ({ data }) => data?.bidSetting?.targetRank ?? null,
    valueFormatter: formatRank,
    cellRenderer: RankCell,
  },
  {
    colId: "maxBid",
    headerName: "입찰가 한도",
    ...fit(120),
    ...editableCell("maxBid", "right"),
    valueGetter: ({ data }) => data?.bidSetting?.maxBid ?? null,
    valueFormatter: formatWon,
  },
  {
    colId: "bidAdjust",
    headerName: "가감액",
    ...fit(110),
    ...editableCell("bidAdjust", "right"),
    valueGetter: ({ data }) => data?.bidSetting?.bidAdjust ?? null,
    valueFormatter: formatWon,
  },
  {
    // 네이버 집계 통계 (period 기준, 수 시간 지연). 클릭률·전환율은 네이버가 % 값으로 준다.
    groupId: "stats",
    headerName: "실적",
    headerClass: "ag-header-center",
    headerGroupComponent: StatsGroupHeader,
    headerGroupComponentParams: statsHeader,
    marryChildren: true,
    children: [
      statCol("impressions", "노출수", 90, formatCount),
      statCol("clicks", "클릭수", 80, formatCount),
      statCol("ctr", "클릭률", 85, formatPercent),
      statCol("cost", "광고비", 100, formatStatWon, "right"),
      statCol("cpc", "CPC", 90, formatStatWon, "right"),
      statCol("conversions", "전환수", 80, formatCount),
      statCol("conversionRate", "전환율", 85, formatPercent),
      avgRankCol,
    ],
  },
  ...(withAutobid ? [autobidColGroup] : []),
]

/** 편집 가능한 컬럼 colId → 설정 필드. 편집 요청을 PATCH 바디로 바꿀 때 쓴다 */
const EDITABLE_FIELDS = new Set<keyof BidSettingValues>([
  "targetRank",
  "maxBid",
  "bidAdjust",
])

const getRowId: GetRowIdFunc<AdGroupKeyword> = ({ data }) => data.id

function GridOverlay({
  overlayType,
  query,
  errorMessage,
  autobidOnly,
}: CustomOverlayProps<AdGroupKeyword> & OverlayParams) {
  let message: React.ReactNode
  switch (overlayType) {
    case "loading":
      message = "키워드를 불러오는 중..."
      break
    case "noRows":
      message = errorMessage ? (
        <>
          키워드를 불러오지 못했습니다.
          <br />
          <span className="opacity-70">{errorMessage}</span>
        </>
      ) : autobidOnly ? (
        "자동입찰 대상으로 등록된 키워드가 없습니다."
      ) : (
        "등록된 키워드가 없습니다."
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
 * 자동 입찰 페이지 하단 — 선택한 그룹의 키워드 목록.
 * 희망순위·입찰가 한도·가감액은 셀을 더블클릭(또는 Enter)해 편집하면 즉시 저장된다.
 * 여러 키워드를 체크하고 툴바의 "일괄 설정"으로 세 값을 한 번에 바꿀 수도 있다.
 */
export function BiddingKeywordGrid({
  group,
  autobidOnly = false,
  emptyMessage = "위에서 그룹을 선택하면 키워드가 여기에 표시됩니다.",
}: BiddingKeywordGridProps) {
  const adGroupId = group?.id ?? null
  const gridRef = useRef<AgGridReact<AdGroupKeyword>>(null)
  // 셀을 편집하는 동안에는 자동 갱신을 멈춘다 (목록이 갈아끼워지면 입력이 끊긴다)
  const [editing, setEditing] = useState(false)
  // 입찰 중인 그룹을 보고 있으면 엔진 주기(60초)에 맞춰 현재 입찰가·최근 검토를 따라간다
  const live = !!group?.autobidEnabled && !editing
  // 툴바 버튼 활성화·개수 표시용. 실제 대상 행은 클릭 시점에 그리드에서 다시 읽는다.
  const [selectedCount, setSelectedCount] = useState(0)
  // 마지막으로 고른 기간을 브라우저에 저장해 다음에도 같은 기간으로 연다
  const [statsPeriod, setStatsPeriodState] =
    useState<StatsPeriod>(loadStatsPeriod)
  const setStatsPeriod = useCallback((period: StatsPeriod) => {
    saveStatsPeriod(period)
    setStatsPeriodState(period)
  }, [])
  const {
    data: keywords = [],
    isLoading,
    isFetching,
    error,
    refetch,
  } = useAdGroupKeywords(adGroupId, statsPeriod, autobidOnly, live)
  const updateSetting = useUpdateKeywordSetting(adGroupId)
  const bulkUpdate = useBulkUpdateKeywordSettings(adGroupId)

  const columnDefs = useMemo(
    () =>
      buildColumnDefs(
        { period: statsPeriod, onPeriodChange: setStatsPeriod },
        autobidOnly
      ),
    [statsPeriod, setStatsPeriod, autobidOnly]
  )

  // 키워드 셀이 쓰는 값 — 그룹 기기(네이버 검색을 PC/모바일 중 어디로 열지)
  const context = useMemo<KeywordGridContext>(
    () => ({ device: group?.device ?? "PC", withAutobid: autobidOnly }),
    [group?.device, autobidOnly]
  )

  // 키워드 행은 그대로인데 기기만 바뀌면 그리드가 셀을 다시 그리지 않아, 열린 링크가 옛 기기로 남는다
  useEffect(() => {
    gridRef.current?.api?.refreshCells({ force: true, columns: ["keyword"] })
  }, [context])

  const [search, setSearch] = useState("")
  const query = search.trim()
  const overlayParams = useMemo<OverlayParams>(
    () => ({ query, errorMessage: error?.message ?? null, autobidOnly }),
    [query, error, autobidOnly]
  )

  /**
   * readOnlyEdit 이라 그리드는 데이터를 직접 바꾸지 않고 요청만 보낸다.
   * 여기서 캐시를 낙관적으로 갱신하면 그리드가 새 값을 다시 그린다.
   */
  function handleCellEditRequest(e: CellEditRequestEvent<AdGroupKeyword>) {
    const field = e.column.getColId() as keyof BidSettingValues
    if (!e.data || !EDITABLE_FIELDS.has(field)) return
    // 범위·단위 검증은 에디터(getValidationErrors + invalidEditValueMode="block")가 이미 끝냈다
    const next = toSettingValue(e.newValue)
    const prev = e.data.bidSetting?.[field] ?? null
    if (next === prev) return
    updateSetting.mutate(
      { keywordId: e.data.id, patch: { [field]: next } },
      {
        onError: (err) =>
          toast.error(errorMessage(err, "설정을 저장하지 못했습니다.")),
      }
    )
  }

  /** 그룹 전환·재조회로 행이 바뀌면 그리드가 선택을 정리하므로 개수를 다시 읽는다 */
  function syncSelectedCount({
    api,
  }:
    | SelectionChangedEvent<AdGroupKeyword>
    | RowDataUpdatedEvent<AdGroupKeyword>) {
    setSelectedCount(api.getSelectedNodes().length)
  }

  /**
   * 체크한 키워드들에 다이얼로그에서 입력한 값만 덮어쓴다.
   * PUT 일괄 API 는 세 값을 통째로 저장하므로, 입력하지 않은 값은 각 키워드의 기존 값을 그대로 보낸다.
   */
  function handleBulkEdit() {
    const api = gridRef.current?.api
    if (!api) return
    const targets = api.getSelectedRows()
    if (targets.length === 0) return

    overlay.open(({ isOpen, close, unmount }) => (
      <BulkBidSettingDialog
        isOpen={isOpen}
        close={close}
        unmount={unmount}
        count={targets.length}
        onSubmit={async (patch) => {
          await bulkUpdate.mutateAsync(
            targets.map((k) => ({
              keywordId: k.id,
              targetRank: k.bidSetting?.targetRank ?? null,
              maxBid: k.bidSetting?.maxBid ?? null,
              bidAdjust: k.bidSetting?.bidAdjust ?? null,
              ...patch,
            }))
          )
          toast.success(`키워드 ${targets.length}개의 설정을 저장했습니다.`)
          api.deselectAll()
        }}
      />
    ))
  }

  if (!group) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <span className="truncate text-muted-foreground">
            {group.campaignName}
          </span>
          <span className="text-muted-foreground">›</span>
          <span className="truncate font-medium">{group.name}</span>
          {!isLoading && (
            <Badge variant="secondary" className="shrink-0">
              {autobidOnly ? "대상 키워드" : "키워드"} {keywords.length}개
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  onClick={handleBulkEdit}
                  disabled={selectedCount === 0 || bulkUpdate.isPending}
                />
              }
            >
              <SlidersHorizontal />
              일괄 설정
              {selectedCount > 0 && (
                <Badge variant="secondary" className="tabular-nums">
                  {selectedCount}
                </Badge>
              )}
            </TooltipTrigger>
            <TooltipContent>
              {selectedCount === 0
                ? "왼쪽 체크박스로 키워드를 먼저 선택하세요"
                : "선택한 키워드의 희망순위·입찰가 한도·가감액을 한 번에 바꿉니다"}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => refetch()}
                  disabled={isFetching}
                  aria-label="키워드 새로고침"
                />
              }
            >
              <RefreshCw className={isFetching ? "animate-spin" : undefined} />
            </TooltipTrigger>
            <TooltipContent>
              키워드를 다시 불러옵니다 (입찰 중인 그룹은 60초마다 자동 갱신)
            </TooltipContent>
          </Tooltip>
          <InputGroup className="w-64">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="키워드 검색"
              aria-label="키워드 검색"
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
        <AgGridReact<AdGroupKeyword>
          ref={gridRef}
          theme={gridTheme}
          rowData={keywords}
          getRowId={getRowId}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          context={context}
          rowSelection={rowSelection}
          selectionColumnDef={selectionColumnDef}
          onSelectionChanged={syncSelectedCount}
          onRowDataUpdated={syncSelectedCount}
          onCellEditingStarted={() => setEditing(true)}
          onCellEditingStopped={() => setEditing(false)}
          quickFilterText={query}
          loading={isLoading}
          overlayComponent={GridOverlay}
          overlayComponentParams={overlayParams}
          onSortChanged={refreshRowNumbers}
          onFilterChanged={refreshRowNumbers}
          readOnlyEdit
          onCellEditRequest={handleCellEditRequest}
          // 검증에 걸린 값은 저장하지 않고 에디터를 열어 둔 채 오류를 보여준다
          invalidEditValueMode="block"
          stopEditingWhenCellsLoseFocus
        />
      </div>
    </div>
  )
}
