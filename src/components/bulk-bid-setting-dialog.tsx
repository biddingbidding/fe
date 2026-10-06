import { useState, type FormEvent, type ReactNode } from "react"

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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  BID_SETTING_HINTS,
  BID_SETTING_LABELS,
  BID_SETTING_RULES,
  toSettingValue,
} from "@/lib/bid-setting-rules"
import type { BidSettingValues } from "@/types/ads"

const FIELDS: (keyof BidSettingValues)[] = ["targetRank", "maxBid", "bidAdjust"]

type FieldKey = keyof BidSettingValues
type Draft = Record<FieldKey, string>
type Errors = Partial<Record<FieldKey, string>>

interface BulkBidSettingDialogProps {
  isOpen: boolean
  /** 적용 대상 키워드 수 (제목·설명에 표시) */
  count: number
  /** 설명 문구를 바꿀 때 (그룹 단위 적용 등). 없으면 "선택한 키워드 N개에 적용합니다" */
  description?: ReactNode
  /**
   * 저장 요청. 사용자가 값을 입력한 필드만 담긴다 — 비워 둔 필드는 바꾸지 않는다는 뜻.
   * resolve 되면 다이얼로그가 닫히고, reject 되면 에러를 보여주며 열린 채로 남는다.
   */
  onSubmit: (patch: Partial<BidSettingValues>) => Promise<unknown>
  /** 성공 시 true, 취소 시 false */
  close: (submitted: boolean) => void
  unmount: () => void
}

const EMPTY_DRAFT: Draft = { targetRank: "", maxBid: "", bidAdjust: "" }

/**
 * 선택한 키워드들의 희망순위·입찰가 한도·가감액을 한 번에 바꾸는 다이얼로그.
 * 세 칸 모두 선택 입력이며, 비워 둔 칸은 "변경 안 함"이다. overlay-kit 으로 연다.
 */
export function BulkBidSettingDialog({
  isOpen,
  count,
  description,
  onSubmit,
  close,
  unmount,
}: BulkBidSettingDialogProps) {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [errors, setErrors] = useState<Errors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const touched = FIELDS.filter((f) => draft[f].trim() !== "")
  const canSubmit = touched.length > 0 && !pending

  function setField(field: FieldKey, value: string) {
    setDraft((d) => ({ ...d, [field]: value }))
    // 다시 입력하기 시작하면 그 칸의 오류는 지운다
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }))
  }

  /** 입력값을 검증해 patch 로 바꾼다. 하나라도 틀리면 오류를 세팅하고 null */
  function buildPatch(): Partial<BidSettingValues> | null {
    const patch: Partial<BidSettingValues> = {}
    const nextErrors: Errors = {}
    for (const field of touched) {
      const value = toSettingValue(draft[field].trim())
      const error =
        value == null
          ? "숫자를 입력해 주세요."
          : BID_SETTING_RULES[field](value)
      if (error) nextErrors[field] = error
      else patch[field] = value
    }
    setErrors(nextErrors)
    return Object.keys(nextErrors).length > 0 ? null : patch
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    const patch = buildPatch()
    if (!patch) return
    setSubmitError(null)
    setPending(true)
    try {
      await onSubmit(patch)
      close(true)
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "설정을 저장하지 못했습니다."
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        // 요청 중에는 바깥 클릭/ESC 로 닫히지 않게
        if (!open && !pending) close(false)
      }}
      onOpenChangeComplete={(open) => {
        if (!open) unmount()
      }}
    >
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>입찰 설정 일괄 변경</DialogTitle>
            <DialogDescription>
              {description ?? <>선택한 키워드 {count}개에 적용합니다.</>} 비워
              둔 항목은 바꾸지 않습니다.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            {FIELDS.map((field, i) => {
              const id = `bulk-${field}`
              const error = errors[field]
              return (
                <Field key={field} data-invalid={error ? true : undefined}>
                  <FieldLabel htmlFor={id}>
                    {BID_SETTING_LABELS[field]}
                  </FieldLabel>
                  <Input
                    id={id}
                    inputMode="numeric"
                    autoComplete="off"
                    autoFocus={i === 0}
                    placeholder="변경 안 함"
                    disabled={pending}
                    aria-invalid={error ? true : undefined}
                    value={draft[field]}
                    onChange={(e) => setField(field, e.target.value)}
                  />
                  {error ? (
                    <FieldError>{error}</FieldError>
                  ) : (
                    <FieldDescription>
                      {BID_SETTING_HINTS[field]}
                    </FieldDescription>
                  )}
                </Field>
              )
            })}
          </FieldGroup>

          {submitError && (
            <p role="alert" className="text-sm text-destructive">
              {submitError}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => close(false)}
            >
              취소
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {pending ? "저장 중..." : `${count}개에 적용`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
