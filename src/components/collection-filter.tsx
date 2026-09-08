import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { collectionHex } from "@/lib/collection"
import { cn } from "@/lib/utils"
import type { Collection } from "@/types/ads"

interface CollectionFilterProps {
  collections: Collection[]
  /** 선택된 모음 id. null 이면 전체 */
  selected: string | null
  onSelect: (id: string | null) => void
  /** 전체 그룹 수 ("전체" 칩의 개수 표시) */
  total: number
  onCreate: () => void
  onEdit: (collection: Collection) => void
  onDelete: (collection: Collection) => void
}

/** 모음 색 점 */
export function CollectionDot({
  color,
  className,
}: {
  color: string | null
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: collectionHex(color) }}
    />
  )
}

/**
 * 그리드 위의 모음(즐겨찾기) 필터 칩 줄 — "전체" 와 모음들. 칩을 누르면 그 모음의 그룹만 보인다.
 * 선택된 모음 칩의 ⋯ 로 이름·색 수정, 삭제. 맨 뒤 + 로 새 모음.
 */
export function CollectionFilter({
  collections,
  selected,
  onSelect,
  total,
  onCreate,
  onEdit,
  onDelete,
}: CollectionFilterProps) {
  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="tablist"
      aria-label="모음 필터"
    >
      <Chip active={selected === null} onClick={() => onSelect(null)}>
        전체
        <Count n={total} />
      </Chip>
      {collections.map((c) => {
        const active = selected === c.id
        return (
          <div key={c.id} className="flex items-center">
            <Chip
              active={active}
              onClick={() => onSelect(active ? null : c.id)}
              className={active ? "rounded-r-none pr-1.5" : undefined}
            >
              <CollectionDot color={c.color} />
              <span className="max-w-40 truncate">{c.name}</span>
              <Count n={c.adGroupIds.length} />
            </Chip>
            {active && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      size="sm"
                      variant="secondary"
                      className="rounded-l-none border-l border-l-background/40 px-1.5"
                      aria-label={`${c.name} 모음 메뉴`}
                    />
                  }
                >
                  <MoreHorizontal />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-40">
                  <DropdownMenuItem onClick={() => onEdit(c)}>
                    <Pencil />
                    이름·색 수정
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDelete(c)}
                  >
                    <Trash2 />
                    모음 삭제
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )
      })}
      <Button
        size="sm"
        variant="ghost"
        className="text-muted-foreground"
        onClick={onCreate}
      >
        <Plus />
        새 모음
      </Button>
    </div>
  )
}

function Chip({
  active,
  onClick,
  className,
  children,
}: {
  active: boolean
  onClick: () => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <Button
      size="sm"
      variant={active ? "secondary" : "outline"}
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn("gap-1.5", className)}
    >
      {children}
    </Button>
  )
}

function Count({ n }: { n: number }) {
  return (
    <span className="tabular-nums text-muted-foreground text-xs">{n}</span>
  )
}
