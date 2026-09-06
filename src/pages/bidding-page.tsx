import { useEffect } from "react"
import { ArrowRight, Gavel } from "lucide-react"
import { useNavigate, useSearchParams } from "react-router"

import { BiddingKeywordGrid } from "@/components/bidding-keyword-grid"
import { Button } from "@/components/ui/button"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import { useAccount } from "@/hooks/use-account"
import { useAdGroups } from "@/hooks/use-ad-groups"
import { routes } from "@/lib/pages"
import { cn } from "@/lib/utils"
import type { AdGroup } from "@/types/ads"

/** 콤보박스 입력창과 검색에 쓰는 그룹 표시 문자열 */
const groupLabel = (g: AdGroup) => `${g.campaignName} › ${g.name}`
const sameGroup = (a: AdGroup, b: AdGroup) => a.id === b.id

/** 그룹 앞의 상태 점 — 초록: 자동입찰 진행 중, 회색: 정지 */
function StatusDot({ enabled }: { enabled: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        enabled ? "bg-emerald-500" : "bg-muted-foreground/40"
      )}
    />
  )
}

/**
 * 자동 입찰 — 콤보박스로 광고 그룹을 고르면 그 그룹의 키워드 그리드를 보인다.
 * 선택한 그룹은 URL 쿼리(?group=)에 두어 새로고침해도 유지된다. 그룹 설정(토글·지역·기기)은 캠페인/그룹 페이지에서.
 */
export function BiddingPage() {
  const navigate = useNavigate()
  const goAdGroups = () => void navigate(routes.adGroups)
  const { account } = useAccount()
  const { data: groups = [], isLoading } = useAdGroups(account?.customerId)

  const [params, setParams] = useSearchParams()
  const groupParam = params.get("group")

  // URL 의 그룹이 없거나 사라졌으면 첫 그룹 자동 선택 (그리드가 비어 보이는 순간을 없앤다)
  const activeGroup =
    groups.find((g) => g.id === groupParam) ?? groups[0] ?? null

  // 유도된 선택을 URL 에 되써서 상태와 주소를 일치시킨다
  useEffect(() => {
    const nextGroup = activeGroup?.id ?? null
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
  }, [activeGroup, groupParam, setParams])

  function selectGroup(group: AdGroup | null) {
    // 지우기(null)는 무시 — 위 effect 가 첫 그룹으로 되돌리므로 현재 선택을 유지한다
    if (!group) return
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set("group", group.id)
      return next
    })
  }

  if (!account) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        계정을 연결하면 자동 입찰을 설정할 수 있습니다.
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        불러오는 중...
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Gavel className="size-5 text-muted-foreground" />
        </div>
        <div className="flex flex-col gap-1">
          <p className="font-medium">광고 그룹이 없습니다</p>
          <p className="text-sm text-muted-foreground">
            캠페인/그룹 페이지에서 계정을 동기화해 그룹을 불러오세요.
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
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* 그룹 선택 */}
      <div className="flex items-center justify-between gap-2">
        <Combobox
          items={groups}
          value={activeGroup}
          onValueChange={selectGroup}
          itemToStringLabel={groupLabel}
          isItemEqualToValue={sameGroup}
        >
          <ComboboxInput
            placeholder="광고 그룹 선택"
            aria-label="광고 그룹 선택"
            className="w-full max-w-md"
          />
          <ComboboxContent>
            <ComboboxEmpty>검색 결과가 없습니다.</ComboboxEmpty>
            <ComboboxList>
              {(g: AdGroup) => (
                <ComboboxItem key={g.id} value={g}>
                  <StatusDot enabled={g.autobidEnabled} />
                  <span className="truncate text-muted-foreground">
                    {g.campaignName}
                  </span>
                  <span className="text-muted-foreground">›</span>
                  <span className="truncate">{g.name}</span>
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        <Button
          variant="link"
          size="sm"
          className="h-auto shrink-0 p-0 text-xs"
          onClick={goAdGroups}
        >
          그룹 설정은 캠페인/그룹에서
          <ArrowRight />
        </Button>
      </div>

      <BiddingKeywordGrid group={activeGroup} />
    </div>
  )
}
