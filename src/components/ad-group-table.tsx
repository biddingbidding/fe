import { useCallback, useMemo, useRef, useState, type ReactNode } from "react"
import type {
  CellClickedEvent,
  CellEditRequestEvent,
  ColDef,
  GetRowIdFunc,
  RowDataUpdatedEvent,
  RowSelectionOptions,
  SelectionChangedEvent,
  ValueFormatterParams,
} from "ag-grid-community"
import {
  AgGridReact,
  type CustomCellRendererProps,
  type CustomHeaderProps,
  type CustomOverlayProps,
} from "ag-grid-react"
import { ChevronDown, FolderPlus, Plus, Search, X } from "lucide-react"
import { overlay } from "overlay-kit"
import { toast } from "sonner"

import { AdGroupDetailSheet } from "@/components/ad-group-detail-sheet"
import { CollectionDialog } from "@/components/collection-dialog"
import { CollectionDot, CollectionFilter } from "@/components/collection-filter"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
import {
  useCollections,
  useCreateCollection,
  useDeleteCollection,
  useSetCollectionMembership,
  useUpdateCollection,
} from "@/hooks/use-collections"
import { gridTheme } from "@/lib/ag-grid"
import {
  collectionHex,
  collectionsOf,
  nextCollectionColor,
} from "@/lib/collection"
import { DEVICE_OPTIONS, deviceLabel } from "@/lib/device"
import { PRIORITY_OPTIONS, priorityLabel } from "@/lib/priority"
import { regionLabel, regionOptions } from "@/lib/region"
import { errorMessage } from "@/lib/toast"
import type {
  AdGroup,
  AdGroupSettingPatch,
  Collection,
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
  /** 선택된 모음 이름. 모음 필터 중이면 "이 모음에 담긴 그룹이 없다" 로 안내 */
  collectionName: string | null
}

const defaultColDef: ColDef<AdGroup> = {
  resizable: true,
  sortable: true,
  suppressHeaderMenuButton: true,
}

/**
 * 모음에 일괄로 담을 그룹은 체크박스로 고른다. 전체 선택은 검색·모음 필터로 걸러진 행 기준.
 * 행 클릭은 상세 시트를 여는 데 쓰므로 체크박스로만 선택한다.
 */
const rowSelection: RowSelectionOptions<AdGroup> = {
  mode: "multiRow",
  checkboxes: true,
  headerCheckbox: true,
  selectAll: "filtered",
  enableClickSelection: false,
}

const selectionColumnDef: ColDef<AdGroup> = {
  width: 44,
  resizable: false,
  suppressMovable: true,
}

/** 클릭해도 상세 시트를 열지 않는 열 — 스위치·편집 셀은 클릭이 조작이다 */
const INTERACTIVE_COLS = new Set([
  "ag-Grid-SelectionColumn",
  "autobidEnabled",
  "collections",
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

interface CollectionsCellParams {
  collections: Collection[]
  /** 그룹을 모음에 담거나(member=true) 뺀다 */
  onToggle: (group: AdGroup, collection: Collection, member: boolean) => void
  /** 이 그룹을 담은 새 모음 만들기 */
  onCreateWith: (group: AdGroup) => void
}

/**
 * "모음" 셀 — 그룹이 담긴 모음을 색 배지로 보여 주고, 클릭하면 체크 목록으로 담기/빼기.
 * 모음이 하나도 없으면 + 만 보인다.
 */
function CollectionsCell({
  data,
  collections,
  onToggle,
  onCreateWith,
}: CustomCellRendererProps<AdGroup, string[]> & CollectionsCellParams) {
  if (!data) return null
  const mine = collectionsOf(data, collections)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex h-full w-full items-center gap-1 overflow-hidden text-left outline-none"
            aria-label={`${data.name} 모음`}
          />
        }
      >
        {mine.length === 0 ? (
          <Plus className="size-3.5 text-muted-foreground/60" />
        ) : (
          mine.map((c) => (
            <Badge
              key={c.id}
              variant="secondary"
              className="max-w-28 truncate text-white"
              style={{ backgroundColor: collectionHex(c.color) }}
            >
              {c.name}
            </Badge>
          ))
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
        {collections.length > 0 && (
          <DropdownMenuGroup>
            <DropdownMenuLabel>담을 모음</DropdownMenuLabel>
            {collections.map((c) => {
              const member = data.collectionIds.includes(c.id)
              return (
                <DropdownMenuCheckboxItem
                  key={c.id}
                  checked={member}
                  closeOnClick={false}
                  onCheckedChange={(checked) => onToggle(data, c, checked)}
                >
                  <CollectionDot color={c.color} />
                  <span className="truncate">{c.name}</span>
                </DropdownMenuCheckboxItem>
              )
            })}
          </DropdownMenuGroup>
        )}
        {collections.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem onClick={() => onCreateWith(data)}>
          <Plus />새 모음 만들기
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// 현재 API(AdGroup)로 받을 수 있는 필드만 컬럼으로 둔다.
// 지역·기기·우선순위 열은 편집 가능(더블클릭/Enter). 셀렉트 에디터는 null 을 못 다루므로 미입력은 "" 로 두고
// 저장 시점(handleCellEditRequest)에 null 로 되돌린다.
// 콜백과 지역 목록을 헤더/셀에 넘겨야 해서 컬럼 정의는 함수로 만든다 (컴포넌트에서 useMemo).
const buildColumnDefs = (
  enabledCell: EnabledCellParams,
  collectionsCell: CollectionsCellParams,
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
    colId: "collections",
    headerName: "모음",
    width: 150,
    sortable: false,
    cellRenderer: CollectionsCell,
    cellRendererParams: collectionsCell,
    // 모음 이름으로도 검색되게 (quickFilter 는 valueGetter 값을 본다)
    valueGetter: ({ data }) =>
      data ? collectionsOf(data, collectionsCell.collections).map((c) => c.name) : [],
    getQuickFilterText: ({ value }) =>
      Array.isArray(value) ? value.join(" ") : "",
  },
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
  collectionName,
}: CustomOverlayProps<AdGroup> & OverlayParams) {
  let message: string
  switch (overlayType) {
    case "loading":
      message = "불러오는 중..."
      break
    case "noRows":
      message = collectionName
        ? `"${collectionName}" 모음에 담긴 그룹이 없습니다. 그룹의 모음 열에서 담을 수 있습니다.`
        : "[계정 동기화] 버튼을 눌러 캠페인과 광고 그룹을 불러오세요."
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
  const { data: collections = [] } = useCollections(customerId)
  const { mutateAsync: createCollection } = useCreateCollection(customerId)
  const { mutateAsync: updateCollection } = useUpdateCollection(customerId)
  const { mutate: deleteCollection } = useDeleteCollection(customerId)
  const setMembership = useSetCollectionMembership(customerId)
  const { mutate: toggleMembership } = setMembership

  const gridRef = useRef<AgGridReact<AdGroup>>(null)
  // 툴바 버튼 활성화·개수 표시용. 실제 대상 행은 클릭 시점에 그리드에서 다시 읽는다.
  const [selectedCount, setSelectedCount] = useState(0)
  function syncSelectedCount({
    api,
  }: SelectionChangedEvent<AdGroup> | RowDataUpdatedEvent<AdGroup>) {
    setSelectedCount(api.getSelectedNodes().length)
  }

  const [search, setSearch] = useState("")
  const query = search.trim()

  // 모음 필터 — 선택된 모음에 담긴 그룹만 그리드에 넣는다 (서버는 collectionIds 만 주고 필터는 프론트 몫).
  // 선택한 모음이 삭제되면 전체로 돌아간다.
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null)
  const selectedCollection =
    collections.find((c) => c.id === selectedCollectionId) ?? null
  const scopeId = selectedCollection?.id ?? null
  const visibleGroups = useMemo(
    () =>
      scopeId ? groups.filter((g) => g.collectionIds.includes(scopeId)) : groups,
    [groups, scopeId]
  )
  /** "모든 그룹에 적용" 확인 문구용 — 모음 필터 중이면 그 모음 이름과 그룹 수 */
  const scopeLabel = selectedCollection
    ? `"${selectedCollection.name}" 모음의 그룹`
    : "광고 그룹"
  const overlayParams = useMemo<OverlayParams>(
    () => ({ query, collectionName: selectedCollection?.name ?? null }),
    [query, selectedCollection?.name]
  )

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

  /**
   * 그룹 설정(기기 또는 우선순위)을 덮어쓰므로 확인을 받고 실행한다.
   * 모음 필터 중이면 그 모음에 담긴 그룹만 (서버 collectionId 범위).
   */
  const applySettingAll = useCallback(
    (name: string, patch: AdGroupSettingPatch, label: string) => {
      if (visibleGroups.length === 0) return
      overlay.open(({ isOpen, close, unmount }) => (
        <ConfirmDialog
          isOpen={isOpen}
          close={close}
          unmount={unmount}
          title={`${scopeId ? "이 모음의 모든 그룹" : "모든 그룹"}에 ${name}를 적용할까요?`}
          description={
            <>
              {scopeLabel} <b>{visibleGroups.length}개</b>의 {name}가{" "}
              <b>{label}</b>(으)로 저장됩니다.
            </>
          }
          confirmLabel="적용"
          pendingLabel="적용 중..."
          onConfirm={async () => {
            // 실패하면 ConfirmDialog 가 에러를 다이얼로그 안에 보여준다
            const updated = await applySettingToAll({
              patch,
              collectionId: scopeId,
            })
            toast.success(
              `그룹 ${updated}개의 ${name}를 ${label}(으)로 저장했습니다.`
            )
          }}
        />
      ))
    },
    [visibleGroups.length, scopeId, scopeLabel, applySettingToAll]
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

  /** 그룹들의 네이버 지역 타겟을 바꾸므로 확인을 받고 실행한다. 모음 필터 중이면 그 모음만 */
  const handleApplyRegionAll = useCallback(
    (region: string | null) => {
      if (visibleGroups.length === 0) return
      const label = regionLabel(regions, region)
      overlay.open(({ isOpen, close, unmount }) => (
        <ConfirmDialog
          isOpen={isOpen}
          close={close}
          unmount={unmount}
          title={`${scopeId ? "이 모음의 모든 그룹" : "모든 그룹"}에 지역을 적용할까요?`}
          description={
            <>
              {scopeLabel} <b>{visibleGroups.length}개</b>의 노출 지역이{" "}
              <b>{label}</b>(으)로 바뀝니다. 네이버 광고 그룹의 지역 타겟이 직접
              변경되며, 지역 타겟이 없는 그룹은 건너뜁니다.
            </>
          }
          confirmLabel="적용"
          pendingLabel="적용 중..."
          onConfirm={async () => {
            const applied = await applyRegionToAll({
              region,
              collectionId: scopeId,
            })
            toast.success(
              `그룹 ${applied}개의 지역을 ${label}(으)로 바꿨습니다.`
            )
          }}
        />
      ))
    },
    [visibleGroups.length, scopeId, scopeLabel, regions, applyRegionToAll]
  )

  // ── 모음(즐겨찾기) ──────────────────────────────────────────

  /**
   * 새 모음 만들기. 그룹을 주면 그 그룹들을 담은 채로 만든다. 만든 뒤 필터를 그 모음으로 옮기지는 않는다.
   * onCreated 는 성공 뒤 후처리 (예: 그리드 선택 해제).
   */
  const openCreateCollection = useCallback(
    (withGroups: AdGroup[] = [], onCreated?: () => void) => {
      overlay.open(({ isOpen, close, unmount }) => (
        <CollectionDialog
          isOpen={isOpen}
          close={close}
          unmount={unmount}
          mode="create"
          count={withGroups.length}
          initial={{ name: "", color: nextCollectionColor(collections) }}
          onSubmit={async ({ name, color }) => {
            const created = await createCollection({
              name,
              color,
              adGroupIds: withGroups.map((g) => g.id),
            })
            toast.success(
              withGroups.length === 1
                ? `"${created.name}" 모음을 만들고 ${withGroups[0].name} 그룹을 담았습니다.`
                : withGroups.length > 1
                  ? `"${created.name}" 모음을 만들고 그룹 ${withGroups.length}개를 담았습니다.`
                  : `"${created.name}" 모음을 만들었습니다.`
            )
            onCreated?.()
          }}
        />
      ))
    },
    [collections, createCollection]
  )

  const handleEditCollection = useCallback(
    (collection: Collection) => {
      overlay.open(({ isOpen, close, unmount }) => (
        <CollectionDialog
          isOpen={isOpen}
          close={close}
          unmount={unmount}
          mode="edit"
          initial={{ name: collection.name, color: collection.color }}
          onSubmit={async ({ name, color }) => {
            const patch: { name?: string; color?: string | null } = {}
            if (name !== collection.name) patch.name = name
            if (color !== collection.color) patch.color = color
            if (Object.keys(patch).length === 0) return
            await updateCollection({ id: collection.id, patch })
          }}
        />
      ))
    },
    [updateCollection]
  )

  /** 모음 삭제 — 담긴 그룹의 설정·토글은 그대로라 확인만 받는다 */
  const handleDeleteCollection = useCallback(
    (collection: Collection) => {
      overlay.open(({ isOpen, close, unmount }) => (
        <ConfirmDialog
          isOpen={isOpen}
          close={close}
          unmount={unmount}
          destructive
          title={`"${collection.name}" 모음을 삭제할까요?`}
          description={
            <>
              모음만 없어지고, 담긴 그룹 <b>{collection.adGroupIds.length}개</b>
              의 자동입찰 설정은 그대로 유지됩니다.
            </>
          }
          confirmLabel="삭제"
          onConfirm={() => {
            deleteCollection(collection.id, {
              onSuccess: () =>
                toast.success(`"${collection.name}" 모음을 삭제했습니다.`),
              onError: (err) =>
                toast.error(errorMessage(err, "모음을 삭제하지 못했습니다.")),
            })
            return Promise.resolve()
          }}
        />
      ))
    },
    [deleteCollection]
  )

  /** 그룹 하나를 모음에 담기/빼기 (모음 셀). 낙관적으로 반영되고 실패하면 훅이 되돌리므로 알림만 */
  const handleToggleMembership = useCallback(
    (group: AdGroup, collection: Collection, member: boolean) => {
      toggleMembership(
        { collectionId: collection.id, adGroupIds: [group.id], member },
        {
          onError: (err) =>
            toast.error(
              errorMessage(
                err,
                `${group.name} 그룹을 "${collection.name}" 모음에 ${member ? "담지" : "서 빼지"} 못했습니다.`
              )
            ),
        }
      )
    },
    [toggleMembership]
  )

  /** 체크한 그룹들을 모음에 한 번에 담거나(member=true) 뺀다. 끝나면 선택을 푼다 */
  const handleBulkMembership = useCallback(
    (collection: Collection, member: boolean) => {
      const api = gridRef.current?.api
      const targets = api?.getSelectedRows() ?? []
      if (targets.length === 0) return
      toggleMembership(
        {
          collectionId: collection.id,
          adGroupIds: targets.map((g) => g.id),
          member,
        },
        {
          onSuccess: (_updated, _vars, ctx) => {
            const changed = ctx?.changed ?? targets.length
            toast.success(
              member
                ? `그룹 ${changed}개를 "${collection.name}" 모음에 담았습니다.` +
                    (changed < targets.length
                      ? ` (이미 담긴 ${targets.length - changed}개 제외)`
                      : "")
                : `그룹 ${changed}개를 "${collection.name}" 모음에서 뺐습니다.`
            )
            api?.deselectAll()
          },
          onError: (err) =>
            toast.error(
              errorMessage(
                err,
                `선택한 그룹을 "${collection.name}" 모음에 ${member ? "담지" : "서 빼지"} 못했습니다.`
              )
            ),
        }
      )
    },
    [toggleMembership]
  )

  /** 체크한 그룹들을 담은 새 모음 만들기 */
  const handleBulkCreateCollection = useCallback(() => {
    const api = gridRef.current?.api
    const targets = api?.getSelectedRows() ?? []
    if (targets.length === 0) return
    openCreateCollection(targets, () => api?.deselectAll())
  }, [openCreateCollection])

  const columnDefs = useMemo(
    () =>
      buildColumnDefs(
        { onToggle: handleToggle },
        {
          collections,
          onToggle: handleToggleMembership,
          onCreateWith: (group: AdGroup) => openCreateCollection([group]),
        },
        regions,
        { options: regionOptions(regions), onApplyAll: handleApplyRegionAll },
        { options: DEVICE_OPTIONS, onApplyAll: handleApplyDeviceAll },
        { options: PRIORITY_OPTIONS, onApplyAll: handleApplyPriorityAll }
      ),
    [
      handleToggle,
      collections,
      handleToggleMembership,
      openCreateCollection,
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
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  disabled={selectedCount === 0 || setMembership.isPending}
                />
              }
            >
              <FolderPlus />
              모음에 담기
              {selectedCount > 0 && (
                <Badge variant="secondary" className="tabular-nums">
                  {selectedCount}
                </Badge>
              )}
              <ChevronDown className="text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="max-h-80 w-56 overflow-y-auto"
            >
              {collections.length > 0 && (
                <DropdownMenuGroup>
                  <DropdownMenuLabel>선택한 그룹 {selectedCount}개를 담을 모음</DropdownMenuLabel>
                  {collections.map((c) => (
                    <DropdownMenuItem
                      key={c.id}
                      onClick={() => handleBulkMembership(c, true)}
                    >
                      <CollectionDot color={c.color} />
                      <span className="truncate">{c.name}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              )}
              {collections.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem onClick={handleBulkCreateCollection}>
                <Plus />새 모음 만들기
              </DropdownMenuItem>
              {selectedCollection && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => handleBulkMembership(selectedCollection, false)}
                  >
                    <X />"{selectedCollection.name}" 모음에서 빼기
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {actions}
        </div>
      </div>

      <CollectionFilter
        collections={collections}
        selected={scopeId}
        onSelect={setSelectedCollectionId}
        total={groups.length}
        onCreate={() => openCreateCollection()}
        onEdit={handleEditCollection}
        onDelete={handleDeleteCollection}
      />

      {/* 남은 높이를 모두 차지하고 그리드 안에서 세로 스크롤한다 (행 가상화) */}
      <div className="min-h-80 flex-1">
        <AgGridReact<AdGroup>
          ref={gridRef}
          theme={gridTheme}
          rowData={visibleGroups}
          getRowId={getRowId}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          rowSelection={rowSelection}
          selectionColumnDef={selectionColumnDef}
          onSelectionChanged={syncSelectedCount}
          onRowDataUpdated={syncSelectedCount}
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
