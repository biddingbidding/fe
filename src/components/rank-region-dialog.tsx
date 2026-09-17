import { useState } from "react"
import { ChevronDown, ChevronUp, LoaderCircle, MapPin } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useRankRegions } from "@/hooks/use-ad-groups"
import { findRankRegion, shortSidoName } from "@/lib/rank-region"
import { cn } from "@/lib/utils"

interface RankRegionDialogProps {
  isOpen: boolean
  /** 설정할 그룹 이름 (설명에 표시) */
  groupName: string
  /** 현재 순위확인지역 code. 미설정이면 null */
  value: string | null
  /**
   * 지역을 골랐을 때(null 이면 설정 해제). resolve 되면 닫히고,
   * reject 되면 에러를 보여주며 열린 채로 남는다.
   */
  onSelect: (code: string | null) => Promise<unknown>
  close: () => void
  unmount: () => void
}

/** 목록을 불러오거나 저장하는 동안 보이는 로딩 표시 — 돌아가는 아이콘 + 문구 */
function LoadingIndicator({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-2 text-muted-foreground"
    >
      <LoaderCircle className="size-6 animate-spin text-primary" />
      <span>{label}</span>
    </div>
  )
}

/**
 * 순위확인지역 선택 다이얼로그. overlay-kit 으로 연다.
 * 시/도 이름을 누르면 그 시/도 전체로 바로 설정하고, 화살표를 누르면 아래에 시/군/구 목록이 펼쳐진다.
 */
export function RankRegionDialog({
  isOpen,
  groupName,
  value,
  onSelect,
  close,
  unmount,
}: RankRegionDialogProps) {
  const { data: regions = [], isLoading, error: loadError } = useRankRegions()
  const current = findRankRegion(regions, value)
  // 처음에는 현재 지역의 시/도를 펼쳐 둔다. 사용자가 바꾸기 전까지는 목록 도착 후에도 따라간다
  const [expanded, setExpanded] = useState<string | null | undefined>(undefined)
  const expandedCode =
    expanded === undefined
      ? current?.sido.districts.length
        ? current.sido.code
        : null
      : expanded
  const expandedSido = regions.find((r) => r.code === expandedCode) ?? null

  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function choose(code: string | null) {
    if (pending) return
    if (code === value) {
      close()
      return
    }
    setError(null)
    setPending(true)
    try {
      await onSelect(code)
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장하지 못했습니다.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !pending) close()
      }}
      onOpenChangeComplete={(open) => {
        if (!open) unmount()
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="size-4 text-primary" />
            순위확인지역
          </DialogTitle>
          <DialogDescription>
            <b className="font-medium text-foreground">{groupName}</b> 그룹의
            순위를 선택한 지역에서 검색했을 때 기준으로 확인합니다. 광고 노출
            지역은 바뀌지 않습니다.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          // 목록이 오면 시/도 표가 들어설 자리 — 높이를 잡아 두어 다이얼로그가 튀지 않게 한다
          <div className="flex min-h-64 items-center justify-center">
            <LoadingIndicator label="지역 목록을 불러오는 중..." />
          </div>
        ) : loadError ? (
          <p className="py-10 text-center text-destructive">
            지역 목록을 불러오지 못했습니다. {loadError.message}
          </p>
        ) : (
          <div className="relative">
            <div
              className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto"
              aria-busy={pending}
            >
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {regions.map((sido) => {
                  const selected = current?.sido.code === sido.code
                  const open = expandedCode === sido.code
                  const hasDistricts = sido.districts.length > 0
                  return (
                    <div
                      key={sido.code}
                      className={cn(
                        "flex h-9 overflow-hidden rounded-md border transition-colors",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "bg-background",
                        open && !selected && "border-primary/60"
                      )}
                    >
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => void choose(sido.code)}
                        title={`${sido.name} 전체로 설정`}
                        aria-pressed={selected && !current?.district}
                        className={cn(
                          "min-w-0 flex-1 truncate px-3 text-left font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
                          !selected && "hover:bg-muted"
                        )}
                      >
                        {shortSidoName(sido.name)}
                      </button>
                      {hasDistricts && (
                        <button
                          type="button"
                          onClick={() => setExpanded(open ? null : sido.code)}
                          aria-expanded={open}
                          aria-label={`${sido.name} 시/군/구 ${open ? "접기" : "펼치기"}`}
                          className={cn(
                            "flex w-8 shrink-0 items-center justify-center outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                            selected
                              ? "hover:bg-primary-foreground/15"
                              : "text-muted-foreground hover:bg-muted"
                          )}
                        >
                          {open ? (
                            <ChevronUp className="size-4" />
                          ) : (
                            <ChevronDown className="size-4" />
                          )}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>

              {expandedSido && (
                <div className="flex flex-col gap-2 rounded-lg bg-muted/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {shortSidoName(expandedSido.name)} 시/군/구
                    </span>
                    <Button
                      size="xs"
                      variant={
                        value === expandedSido.code ? "default" : "outline"
                      }
                      disabled={pending}
                      onClick={() => void choose(expandedSido.code)}
                    >
                      {shortSidoName(expandedSido.name)} 전체
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 md:grid-cols-5">
                    {expandedSido.districts.map((d) => {
                      const selected = value === d.code
                      return (
                        <button
                          key={d.code}
                          type="button"
                          disabled={pending}
                          onClick={() => void choose(d.code)}
                          aria-pressed={selected}
                          title={d.name}
                          className={cn(
                            "h-8 truncate rounded-md border px-2 text-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
                            selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "bg-background hover:bg-muted"
                          )}
                        >
                          {d.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
            {/* 저장 중에는 목록 위를 덮어 다른 지역을 누르지 못하게 하고 진행 중임을 보인다 */}
            {pending && (
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/70 backdrop-blur-[1px]">
                <LoadingIndicator label="저장하는 중..." />
              </div>
            )}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter className="sm:justify-between">
          <p className="self-center text-xs text-muted-foreground">
            시/도 이름을 누르면 시/도 전체, 화살표를 누르면 시/군/구를 고를 수
            있습니다.
          </p>
          <div className="flex gap-2">
            {value && (
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => void choose(null)}
              >
                설정 해제
              </Button>
            )}
            <Button variant="outline" disabled={pending} onClick={close}>
              닫기
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
