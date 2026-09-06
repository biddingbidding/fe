import { useCallback, useMemo, useState, type ReactNode } from "react"
import type {
  CellClickedEvent,
  CellEditRequestEvent,
  ColDef,
  GetRowIdFunc,
  ValueFormatterParams,
} from "ag-grid-community"
import {
  AgGridReact,
  type CustomCellRendererProps,
  type CustomHeaderProps,
  type CustomOverlayProps,
} from "ag-grid-react"
import { ChevronDown, Search, X } from "lucide-react"
import { overlay } from "overlay-kit"
import { toast } from "sonner"

import { AdGroupDetailSheet } from "@/components/ad-group-detail-sheet"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Switch } from "@/components/ui/switch"
import { useAccount } from "@/hooks/use-account"
import {
  useAdGroups,
  useApplyRegionToAll,
  useApplySettingToAll,
  useRegions,
  useUpdateAdGroupEnabled,
  useUpdateAdGroupRegion,
  useUpdateAdGroupSetting,
} from "@/hooks/use-ad-groups"
import { gridTheme } from "@/lib/ag-grid"
import { DEVICE_OPTIONS, deviceLabel } from "@/lib/device"
import { PRIORITY_OPTIONS, priorityLabel } from "@/lib/priority"
import { regionLabel, regionOptions } from "@/lib/region"
import { errorMessage } from "@/lib/toast"
import type {
  AdGroup,
  AdGroupSettingPatch,
  Device,
  Priority,
  Region,
} from "@/types/ads"

interface AdGroupTableProps {
  /** 계정 동기화 진행 중이면 빈 테이블에 안내 대신 로딩 문구를 보인다 */
  syncing?: boolean
  /** 검색창 오른쪽에 놓을 버튼들 (예: 계정 동기화) */
  actions?: ReactNode
}

/** 오버레이에 넘기는 추가 파라미터 — 행이 0개인 이유에 따라 문구를 바꾼다 */
interface OverlayParams {
  query: string
}

const defaultColDef: ColDef<AdGroup> = {
  resizable: true,
  sortable: true,
  suppressHeaderMenuButton: true,
}

/** 클릭해도 상세 시트를 열지 않는 열 — 스위치·편집 셀은 클릭이 조작이다 */
const INTERACTIVE_COLS = new Set([
  "autobidEnabled",
  "region",
  "device",
  "priority",
])

interface ApplyAllHeaderParams<T> {
  /** 드롭다운에 나열할 값들 */
  options: { value: T; label: string }[]
  onApplyAll: (value: T) => void
}

/**
 * "지역"/"기기"/"우선순위" 컬럼 헤더 — 라벨 오른쪽의 화살표로 모든 그룹에 일괄 적용하는 드롭다운을 연다.
 * 헤더 안의 클릭이 컬럼 드래그로 새지 않도록 pointerdown 전파를 막는다.
 */
function ApplyAllHeader<T>({
  displayName,
  options,
  onApplyAll,
}: CustomHeaderProps<AdGroup> & ApplyAllHeaderParams<T>) {
  return (
    <div className="flex w-full items-center gap-0.5">
      <span>{displayName}</span>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground"
              onPointerDown={(e) => e.stopPropagation()}
              aria-label={`${displayName} 일괄 적용`}
            />
          }
        >
          <ChevronDown />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-80 w-52 overflow-y-auto"
        >
          {/* GroupLabel 은 반드시 Group 안에 있어야 한다 (Base UI 가 컨텍스트 없으면 throw) */}
          <DropdownMenuGroup>
            <DropdownMenuLabel>모든 그룹에 적용</DropdownMenuLabel>
            {options.map((o) => (
              <DropdownMenuItem
                key={o.label}
                onClick={() => onApplyAll(o.value)}
              >
                {o.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

interface EnabledCellParams {
  onToggle: (group: AdGroup, enabled: boolean) => void
}

/** "자동입찰" 셀 — 그룹별 on/off 스위치 */
function EnabledCell({
  data,
  onToggle,
}: CustomCellRendererProps<AdGroup, boolean> & EnabledCellParams) {
  if (!data) return null
  return (
    <div className="flex h-full items-center">
      <Switch
        size="sm"
        checked={data.autobidEnabled}
        onCheckedChange={(checked) => onToggle(data, checked)}
        aria-label={`${data.name} 자동입찰`}
      />
    </div>
  )
}

// 현재 API(AdGroup)로 받을 수 있는 필드만 컬럼으로 둔다.
// 지역·기기·우선순위 열은 편집 가능(더블클릭/Enter). 셀렉트 에디터는 null 을 못 다루므로 미입력은 "" 로 두고
// 저장 시점(handleCellEditRequest)에 null 로 되돌린다.
// 콜백과 지역 목록을 헤더/셀에 넘겨야 해서 컬럼 정의는 함수로 만든다 (컴포넌트에서 useMemo).
const buildColumnDefs = (
  enabledCell: EnabledCellParams,
  regions: Region[],
  regionHeader: ApplyAllHeaderParams<string | null>,
  deviceHeader: ApplyAllHeaderParams<Device | null>,
  priorityHeader: ApplyAllHeaderParams<Priority | null>
): ColDef<AdGroup>[] => [
  {
    field: "autobidEnabled",
    headerName: "자동입찰",
    width: 96,
    cellRenderer: EnabledCell,
    cellRendererParams: enabledCell,
  },
  { field: "campaignName", headerName: "캠페인명", flex: 1, minWidth: 160 },
  { field: "name", headerName: "그룹명", flex: 1, minWidth: 160 },
  {
    field: "siteUrl",
    headerName: "사이트주소",
    flex: 1,
    minWidth: 200,
    cellStyle: { color: "var(--muted-foreground)" },
  },
  {
    colId: "region",
    headerName: "지역",
    width: 110,
    cellClass: "bg-primary/8",
    editable: true,
    // 커스텀 헤더에는 정렬 UI 가 없다 — 드롭다운 클릭과 겹치지 않게 정렬은 끈다
    sortable: false,
    headerComponent: ApplyAllHeader,
    headerComponentParams: regionHeader,
    valueGetter: ({ data }) => data?.region ?? "",
    valueFormatter: ({ value }: ValueFormatterParams<AdGroup, string>) =>
      regionLabel(regions, value || null),
    cellEditor: "agSelectCellEditor",
    cellEditorParams: { values: ["", ...regions.map((r) => r.code)] },
  },
  {
    colId: "device",
    headerName: "기기",
    width: 110,
    cellClass: "bg-primary/8",
    editable: true,
    sortable: false,
    headerComponent: ApplyAllHeader,
    headerComponentParams: deviceHeader,
    valueGetter: ({ data }) => data?.device ?? "",
    valueFormatter: ({ value }: ValueFormatterParams<AdGroup, Device | "">) =>
      deviceLabel(value || null),
    cellEditor: "agSelectCellEditor",
    cellEditorParams: { values: ["", "PC", "MOBILE"] },
  },
  {
    colId: "priority",
    headerName: "우선순위",
    width: 110,
    cellClass: "bg-primary/8",
    editable: true,
    sortable: false,
    headerComponent: ApplyAllHeader,
    headerComponentParams: priorityHeader,
    valueGetter: ({ data }) => data?.priority ?? "",
    valueFormatter: ({ value }: ValueFormatterParams<AdGroup, Priority | "">) =>
      priorityLabel(value || null),
    cellEditor: "agSelectCellEditor",
    cellEditorParams: { values: ["", "HIGH", "NORMAL", "LOW"] },
  },
]

const getRowId: GetRowIdFunc<AdGroup> = ({ data }) => data.id

function GridOverlay({
  overlayType,
  query,
}: CustomOverlayProps<AdGroup> & OverlayParams) {
  let message: string
  switch (overlayType) {
    case "loading":
      message = "불러오는 중..."
      break
    case "noRows":
      message = "[계정 동기화] 버튼을 눌러 캠페인과 광고 그룹을 불러오세요."
      break
    case "noMatchingRows":
      message = query ? "검색 결과가 없습니다." : "광고 그룹이 없습니다."
      break
    default:
      return null
  }
  return <p className="text-sm text-muted-foreground">{message}</p>
}

/**
 * 캠페인/광고 그룹 목록. 자동입찰 열의 스위치로 그룹마다 켜고 끈다.
 * 지역·기기·우선순위 열은 셀을 더블클릭해 수정하면 즉시 저장되고, 헤더의 드롭다운으로 모든 그룹에 일괄 적용할 수도 있다.
 * 그 외 열을 클릭하면 상세 시트가 열린다.
 */
export function AdGroupTable({ syncing = false, actions }: AdGroupTableProps) {
  const { account } = useAccount()
  const customerId = account?.customerId
  const { data: groups = [], isLoading } = useAdGroups(customerId)
  const loading = isLoading || (syncing && groups.length === 0)
  const { data: regions = [] } = useRegions(!!customerId)
  const updateSetting = useUpdateAdGroupSetting(customerId)
  const { mutateAsync: applySettingToAll } = useApplySettingToAll(customerId)
  const updateRegion = useUpdateAdGroupRegion(customerId, regions)
  const { mutateAsync: applyRegionToAll } = useApplyRegionToAll(
    customerId,
    regions
  )
  const { mutate: updateEnabled } = useUpdateAdGroupEnabled(customerId)

  const [search, setSearch] = useState("")
  const query = search.trim()
  const overlayParams = useMemo<OverlayParams>(() => ({ query }), [query])

  /** 스위치·편집 셀을 제외한 셀 클릭은 상세 시트를 연다 */
  function handleCellClicked(e: CellClickedEvent<AdGroup>) {
    if (!e.data || INTERACTIVE_COLS.has(e.column.getColId())) return
    const group = e.data
    overlay.open(({ isOpen, close, unmount }) => (
      <AdGroupDetailSheet
        isOpen={isOpen}
        close={close}
        unmount={unmount}
        group={group}
      />
    ))
  }

  /** readOnlyEdit 이라 그리드는 요청만 보내고, 캐시를 낙관적으로 갱신하면 새 값이 다시 그려진다 */
  function handleCellEditRequest(e: CellEditRequestEvent<AdGroup>) {
    if (!e.data) return
    const colId = e.column.getColId()
    if (colId === "device") {
      const next = (e.newValue || null) as Device | null
      if (next === e.data.device) return
      updateSetting.mutate(
        { adGroupId: e.data.id, patch: { device: next } },
        {
          onError: (err) =>
            toast.error(errorMessage(err, "기기를 저장하지 못했습니다.")),
        }
      )
    } else if (colId === "priority") {
      const next = (e.newValue || null) as Priority | null
      if (next === e.data.priority) return
      updateSetting.mutate(
        { adGroupId: e.data.id, patch: { priority: next } },
        {
          onError: (err) =>
            toast.error(errorMessage(err, "우선순위를 저장하지 못했습니다.")),
        }
      )
    } else if (colId === "region") {
      const next = (e.newValue || null) as string | null
      if (next === e.data.region) return
      updateRegion.mutate(
        { adGroupId: e.data.id, region: next },
        {
          onError: (err) =>
            toast.error(errorMessage(err, "지역을 저장하지 못했습니다.")),
        }
      )
    }
  }

  /** 자동입찰 on/off. 실패하면 훅이 되돌리므로 여기서는 알림만 */
  const handleToggle = useCallback(
    (group: AdGroup, enabled: boolean) => {
      updateEnabled(
        { adGroupId: group.id, enabled },
        {
          onError: (err) =>
            toast.error(
              errorMessage(
                err,
                `${group.name} 그룹의 자동입찰을 ${enabled ? "시작" : "정지"}하지 못했습니다.`
              )
            ),
        }
      )
    },
    [updateEnabled]
  )

  /** 계정의 모든 그룹의 설정(기기 또는 우선순위)을 덮어쓰므로 확인을 받고 실행한다 */
  const applySettingAll = useCallback(
    (name: string, patch: AdGroupSettingPatch, label: string) => {
      if (groups.length === 0) return
      overlay.open(({ isOpen, close, unmount }) => (
        <ConfirmDialog
          isOpen={isOpen}
          close={close}
          unmount={unmount}
          title={`모든 그룹에 ${name}를 적용할까요?`}
          description={
            <>
              광고 그룹 <b>{groups.length}개</b>의 {name}가 <b>{label}</b>(으)로
              저장됩니다.
            </>
          }
          confirmLabel="적용"
          pendingLabel="적용 중..."
          onConfirm={async () => {
            // 실패하면 ConfirmDialog 가 에러를 다이얼로그 안에 보여준다
            const updated = await applySettingToAll(patch)
            toast.success(
              `그룹 ${updated}개의 ${name}를 ${label}(으)로 저장했습니다.`
            )
          }}
        />
      ))
    },
    [groups.length, applySettingToAll]
  )

  const handleApplyDeviceAll = useCallback(
    (device: Device | null) =>
      applySettingAll("기기", { device }, deviceLabel(device)),
    [applySettingAll]
  )

  const handleApplyPriorityAll = useCallback(
    (priority: Priority | null) =>
      applySettingAll("우선순위", { priority }, priorityLabel(priority)),
    [applySettingAll]
  )

  /** 계정의 모든 그룹의 네이버 지역 타겟을 바꾸므로 확인을 받고 실행한다 */
  const handleApplyRegionAll = useCallback(
    (region: string | null) => {
      if (groups.length === 0) return
      const label = regionLabel(regions, region)
      overlay.open(({ isOpen, close, unmount }) => (
        <ConfirmDialog
          isOpen={isOpen}
          close={close}
          unmount={unmount}
          title="모든 그룹에 지역을 적용할까요?"
          description={
            <>
              광고 그룹 <b>{groups.length}개</b>의 노출 지역이 <b>{label}</b>
              (으)로 바뀝니다. 네이버 광고 그룹의 지역 타겟이 직접 변경되며,
              지역 타겟이 없는 그룹은 건너뜁니다.
            </>
          }
          confirmLabel="적용"
          pendingLabel="적용 중..."
          onConfirm={async () => {
            const applied = await applyRegionToAll(region)
            toast.success(
              `그룹 ${applied}개의 지역을 ${label}(으)로 바꿨습니다.`
            )
          }}
        />
      ))
    },
    [groups.length, regions, applyRegionToAll]
  )

  const columnDefs = useMemo(
    () =>
      buildColumnDefs(
        { onToggle: handleToggle },
        regions,
        { options: regionOptions(regions), onApplyAll: handleApplyRegionAll },
        { options: DEVICE_OPTIONS, onApplyAll: handleApplyDeviceAll },
        { options: PRIORITY_OPTIONS, onApplyAll: handleApplyPriorityAll }
      ),
    [
      handleToggle,
      regions,
      handleApplyRegionAll,
      handleApplyDeviceAll,
      handleApplyPriorityAll,
    ]
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <InputGroup className="max-w-sm">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="검색"
            aria-label="광고 그룹 검색"
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
        {actions}
      </div>

      {/* 남은 높이를 모두 차지하고 그리드 안에서 세로 스크롤한다 (행 가상화) */}
      <div className="min-h-80 flex-1">
        <AgGridReact<AdGroup>
          theme={gridTheme}
          rowData={groups}
          getRowId={getRowId}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          onCellClicked={handleCellClicked}
          quickFilterText={query}
          loading={loading}
          overlayComponent={GridOverlay}
          overlayComponentParams={overlayParams}
          readOnlyEdit
          onCellEditRequest={handleCellEditRequest}
          stopEditingWhenCellsLoseFocus
          suppressCellFocus
          rowClass="cursor-pointer"
        />
      </div>
    </div>
  )
}
