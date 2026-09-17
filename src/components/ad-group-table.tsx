import { useCallback, useMemo, useRef, useState, type ReactNode } from "react"
import {
  SELECTION_COLUMN_ID,
  type CellClickedEvent,
  type ColDef,
  type GetRowIdFunc,
  type RowDataUpdatedEvent,
  type RowSelectionOptions,
  type SelectionChangedEvent,
} from "ag-grid-community"
import {
  AgGridReact,
  type CustomCellRendererProps,
  type CustomOverlayProps,
} from "ag-grid-react"
import { ChevronDown, FolderPlus, Plus, Search, X } from "lucide-react"
import { overlay } from "overlay-kit"
import { toast } from "sonner"

import { AdGroupDetailSheet } from "@/components/ad-group-detail-sheet"
import { AdStatusCell } from "@/components/ad-status-cell"
import { BiddingStateCell } from "@/components/bidding-state-cell"
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
import { useAdGroups } from "@/hooks/use-ad-groups"
import { useSetQueueMembership } from "@/hooks/use-autobid"
import {
  useCollections,
  useCreateCollection,
  useDeleteCollection,
  useSetCollectionMembership,
  useUpdateCollection,
} from "@/hooks/use-collections"
import { adStatusLabel } from "@/lib/ad-status"
import { gridTheme, refreshRowNumbers, rowNumberColDef } from "@/lib/ag-grid"
import { biddingStateLabel } from "@/lib/bidding-state"
import {
  collectionHex,
  collectionsOf,
  nextCollectionColor,
} from "@/lib/collection"
import { errorMessage } from "@/lib/toast"
import type { AdGroup, Collection } from "@/types/ads"

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
  // 모든 열 헤더 가운데 정렬 (셀 정렬은 열마다)
  headerClass: "ag-header-center",
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

/** 클릭해도 상세 시트를 열지 않는 열 — 체크박스·스위치·모음 드롭다운은 클릭이 조작이다 */
const INTERACTIVE_COLS = new Set([SELECTION_COLUMN_ID, "queued", "collections"])

interface QueuedCellParams {
  onToggle: (group: AdGroup, queued: boolean) => void
}

/** "대기열" 셀 — 켜면 그룹이 자동입찰 큐에 들어간다(입찰은 자동 입찰 페이지에서 따로 시작). 끄면 빠지고 입찰 중이었으면 멈춘다 */
function QueuedCell({
  data,
  onToggle,
}: CustomCellRendererProps<AdGroup, boolean> & QueuedCellParams) {
  if (!data) return null
  return (
    <div className="flex h-full items-center justify-center">
      <Switch
        size="sm"
        checked={data.queued}
        onCheckedChange={(checked) => onToggle(data, checked)}
        aria-label={`${data.name} 대기열`}
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
      <DropdownMenuContent
        align="start"
        className="max-h-80 w-56 overflow-y-auto"
      >
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

// 현재 API(AdGroup)로 받을 수 있는 필드만 컬럼으로 둔다. 지역·기기·우선순위는 상세 시트에서 본다.
// 대기열(queued)과 입찰 상태(autobidEnabled)는 별개 — 대기열은 여기서 켜고, 입찰 시작/중지는 자동 입찰 페이지에서 한다.
// 콜백과 모음 목록을 셀에 넘겨야 해서 컬럼 정의는 함수로 만든다 (컴포넌트에서 useMemo).
const buildColumnDefs = (
  queuedCell: QueuedCellParams,
  collectionsCell: CollectionsCellParams
): ColDef<AdGroup>[] => [
  rowNumberColDef<AdGroup>(),
  { field: "campaignName", headerName: "캠페인명", flex: 1, minWidth: 160 },
  { field: "name", headerName: "그룹명", flex: 1, minWidth: 160 },
  {
    colId: "collections",
    headerName: "모음",
    // 배지가 여러 개면 넓은 화면에서 더 보이도록 다른 이름 열처럼 늘어난다
    flex: 1,
    minWidth: 150,
    sortable: false,
    cellRenderer: CollectionsCell,
    cellRendererParams: collectionsCell,
    // 모음 이름으로도 검색되게 (quickFilter 는 valueGetter 값을 본다)
    valueGetter: ({ data }) =>
      data
        ? collectionsOf(data, collectionsCell.collections).map((c) => c.name)
        : [],
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
  // 상태 열은 오른쪽 끝에 광고 상태 → 입찰 상태 → 대기열 순으로 둔다.
  // 광고 상태(네이버 노출 가능 여부)와 입찰 상태를 나란히 두어 "입찰은 켰는데 광고가 꺼져 있는" 그룹을 바로 알 수 있게 한다.
  {
    // 광고 상태 — 읽기 전용
    colId: "adStatus",
    headerName: "광고 상태",
    width: 170,
    valueGetter: ({ data }) => (data ? adStatusLabel(data) : ""),
    tooltipValueGetter: ({ data }) => (data ? adStatusLabel(data) : undefined),
    cellRenderer: AdStatusCell,
  },
  {
    // 입찰 상태 — 읽기 전용 표시. 시작/중지는 자동 입찰 페이지의 버튼으로
    colId: "biddingState",
    headerName: "입찰 상태",
    width: 100,
    valueGetter: ({ data }) =>
      data ? biddingStateLabel(data.autobidEnabled) : "",
    cellRenderer: BiddingStateCell,
  },
  {
    // 대기열 스위치 — 가장 오른쪽
    colId: "queued",
    field: "queued",
    headerName: "대기열",
    headerClass: "ag-header-center",
    width: 90,
    cellRenderer: QueuedCell,
    cellRendererParams: queuedCell,
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
 * 캠페인/광고 그룹 목록. "대기열" 스위치로 그룹을 자동입찰 큐에 넣고 뺀다. 입찰 상태·광고 상태는 읽기 전용으로 보인다.
 * 입찰 시작/중지는 자동 입찰 페이지에서 한다 (큐 소속과 입찰 상태는 별개).
 * 모음(즐겨찾기): 필터 칩으로 걸러 보고, 모음 열이나 체크박스 선택 + [모음에 담기]로 담는다.
 * 그 외 열을 클릭하면 상세 시트가 열린다.
 */
export function AdGroupTable({ syncing = false, actions }: AdGroupTableProps) {
  const { account } = useAccount()
  const customerId = account?.customerId
  const { data: groups = [], isLoading } = useAdGroups(customerId)
  const loading = isLoading || (syncing && groups.length === 0)
  const { mutate: setQueueMembership } = useSetQueueMembership(customerId)
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
  const [selectedCollectionId, setSelectedCollectionId] = useState<
    string | null
  >(null)
  const selectedCollection =
    collections.find((c) => c.id === selectedCollectionId) ?? null
  const scopeId = selectedCollection?.id ?? null
  const visibleGroups = useMemo(
    () =>
      scopeId
        ? groups.filter((g) => g.collectionIds.includes(scopeId))
        : groups,
    [groups, scopeId]
  )
  const overlayParams = useMemo<OverlayParams>(
    () => ({ query, collectionName: selectedCollection?.name ?? null }),
    [query, selectedCollection?.name]
  )

  /** 체크박스·스위치·모음 셀을 제외한 셀 클릭은 상세 시트를 연다 */
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

  /** 대기열 스위치 — 그룹 하나를 큐에 넣거나 뺀다. 실패하면 훅이 스위치를 되돌리므로 여기서는 알림만 */
  const handleToggle = useCallback(
    (group: AdGroup, queued: boolean) => {
      setQueueMembership(
        { adGroupId: group.id, queued },
        {
          onSuccess: () =>
            toast.success(
              queued
                ? `${group.name} 그룹을 대기열에 넣었습니다. 입찰은 자동 입찰 페이지에서 시작하세요.`
                : `${group.name} 그룹을 대기열에서 뺐습니다.`
            ),
          onError: (err) =>
            toast.error(
              errorMessage(
                err,
                `${group.name} 그룹을 대기열에${queued ? " 넣지" : "서 빼지"} 못했습니다.`
              )
            ),
        }
      )
    },
    [setQueueMembership]
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
        }
      ),
    [handleToggle, collections, handleToggleMembership, openCreateCollection]
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
                  <DropdownMenuLabel>
                    선택한 그룹 {selectedCount}개를 담을 모음
                  </DropdownMenuLabel>
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
                    onClick={() =>
                      handleBulkMembership(selectedCollection, false)
                    }
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
          onSortChanged={refreshRowNumbers}
          onFilterChanged={refreshRowNumbers}
          quickFilterText={query}
          loading={loading}
          overlayComponent={GridOverlay}
          overlayComponentParams={overlayParams}
          suppressCellFocus
          rowClass="cursor-pointer"
        />
      </div>
    </div>
  )
}
