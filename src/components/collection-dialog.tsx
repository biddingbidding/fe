import { useState, type FormEvent } from "react"
import { Check } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { COLLECTION_COLORS, collectionHex } from "@/lib/collection"
import { cn } from "@/lib/utils"

const NAME_MAX = 50

interface CollectionDialogProps {
  isOpen: boolean
  /** 수정이면 기존 값, 새로 만들면 빈 이름과 기본 색 */
  initial: { name: string; color: string | null }
  /** 제목·버튼 문구 */
  mode: "create" | "edit"
  /** 만들면서 바로 담을 그룹 수 (create 에서만 설명에 표시) */
  count?: number
  /**
   * 저장 요청. resolve 되면 닫히고, reject 되면 에러를 보여주며 열린 채로 남는다
   * (같은 이름이 있으면 서버가 409 로 알려 준다).
   */
  onSubmit: (values: { name: string; color: string | null }) => Promise<unknown>
  /** 저장 성공이면 true, 취소면 false */
  close: (submitted: boolean) => void
  unmount: () => void
}

/** 모음(즐겨찾기) 만들기/이름·색 수정 다이얼로그. overlay-kit 으로 연다. */
export function CollectionDialog({
  isOpen,
  initial,
  mode,
  count = 0,
  onSubmit,
  close,
  unmount,
}: CollectionDialogProps) {
  const [name, setName] = useState(initial.name)
  const [color, setColor] = useState<string | null>(initial.color)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const trimmed = name.trim()
  const canSubmit = trimmed.length > 0 && trimmed.length <= NAME_MAX && !pending

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setError(null)
    setPending(true)
    try {
      await onSubmit({ name: trimmed, color })
      close(true)
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
        if (!open && !pending) close(false)
      }}
      onOpenChangeComplete={(open) => {
        if (!open) unmount()
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {mode === "create" ? "새 모음" : "모음 수정"}
            </DialogTitle>
            <DialogDescription>
              {mode === "create" && count > 0
                ? `광고 그룹 ${count}개를 담은 모음을 만듭니다.`
                : "광고 그룹을 원하는 기준으로 모아 보는 즐겨찾기입니다. 자동입찰 설정에는 영향이 없습니다."}
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Field data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor="collection-name">이름</FieldLabel>
              <Input
                id="collection-name"
                autoFocus
                autoComplete="off"
                maxLength={NAME_MAX}
                disabled={pending}
                aria-invalid={error ? true : undefined}
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (error) setError(null)
                }}
                placeholder="예: 주력 상품, 서울 지점"
              />
              {error && <FieldError>{error}</FieldError>}
            </Field>
            <Field>
              <FieldLabel>색</FieldLabel>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="모음 색">
                {COLLECTION_COLORS.map((c) => {
                  const selected = c.key === color
                  return (
                    <button
                      key={c.key}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={c.label}
                      title={c.label}
                      disabled={pending}
                      onClick={() => setColor(c.key)}
                      className={cn(
                        "flex size-7 items-center justify-center rounded-full text-white transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                        selected
                          ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                          : "opacity-80 hover:opacity-100"
                      )}
                      style={{ backgroundColor: collectionHex(c.key) }}
                    >
                      {selected && <Check className="size-4" />}
                    </button>
                  )
                })}
              </div>
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => close(false)}
              disabled={pending}
            >
              취소
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {pending ? "저장 중..." : mode === "create" ? "만들기" : "저장"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
