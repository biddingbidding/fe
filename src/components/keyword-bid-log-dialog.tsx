import { useState } from "react"
import {
  ChartColumn,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
} from "lucide-react"

import { BidLogChart } from "@/components/bid-log-chart"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useKeywordBidLogs } from "@/hooks/use-bid-logs"
import { ACTION_LABEL, formatRank } from "@/lib/bid-log"
import { formatNumber } from "@/lib/format"
import { formatKstTime, shiftDate, todayKst } from "@/lib/kst-date"
import { cn } from "@/lib/utils"
import type { BidLogItem } from "@/types/bid-log"

/** 서버 응답 전에 날짜 선택 범위를 잡을 때 쓰는 보관 일수 (서버 기본값) */
const DEFAULT_RETENTION_DAYS = 14

interface KeywordBidLogDialogProps {
  isOpen: boolean
  adGroupId: string
  keywordId: string
  /** 검색어 (제목에 표시) */
  keyword: string
  close: () => void
  unmount: () => void
}

const ACTION_CLASS: Record<BidLogItem["action"], string> = {
  raise: "text-destructive",
  lower: "text-blue-600 dark:text-blue-400",
  hold: "text-muted-foreground",
}

/**
 * 키워드 입찰 기록 다이얼로그 — 날짜를 골라 그날의 입찰 그래프와 검토별 표를 본다. overlay-kit 으로 연다.
 * 오늘을 보고 있으면 60초마다 새 검토가 붙는다.
 */
export function KeywordBidLogDialog({
  isOpen,
  adGroupId,
  keywordId,
  keyword,
  close,
  unmount,
}: KeywordBidLogDialogProps) {
  const today = todayKst()
  const [date, setDate] = useState(today)
  const { data, isLoading, error } = useKeywordBidLogs(
    adGroupId,
    keywordId,
    date
  )
  const retentionDays = data?.retentionDays ?? DEFAULT_RETENTION_DAYS
  const minDate = shiftDate(today, -(retentionDays - 1))
  const items = data?.items ?? []
  const changed = items.filter((i) => i.action !== "hold").length
  const devices = [...new Set(items.map((i) => i.device))]

  function moveTo(next: string) {
    if (next >= minDate && next <= today) setDate(next)
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) close()
      }}
      onOpenChangeComplete={(open) => {
        if (!open) unmount()
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ChartColumn className="size-4 text-primary" />
            {keyword} · 입찰 기록
          </DialogTitle>
          <DialogDescription>
            자동입찰이 이 키워드를 검토할 때마다 남긴 입찰가와 예상 순위입니다.
            예상 순위는 네이버 예상 입찰가로 추정한 값이라 실제 노출 순위와 다를
            수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button
              size="icon-sm"
              variant="outline"
              onClick={() => moveTo(shiftDate(date, -1))}
              disabled={date <= minDate}
              aria-label="이전 날짜"
            >
              <ChevronLeft />
            </Button>
            <Input
              type="date"
              value={date}
              min={minDate}
              max={today}
              onChange={(e) => e.target.value && moveTo(e.target.value)}
              className="h-7 w-36 tabular-nums"
              aria-label="날짜"
            />
            <Button
              size="icon-sm"
              variant="outline"
              onClick={() => moveTo(shiftDate(date, 1))}
              disabled={date >= today}
              aria-label="다음 날짜"
            >
              <ChevronRight />
            </Button>
            {date !== today && (
              <Button size="sm" variant="ghost" onClick={() => setDate(today)}>
                오늘
              </Button>
            )}
          </div>
          {items.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <Badge variant="secondary" className="tabular-nums">
                검토 {items.length}회
              </Badge>
              <Badge variant="secondary" className="tabular-nums">
                입찰가 변경 {changed}회
              </Badge>
              <Badge variant="outline">{devices.join(" · ")} 기준</Badge>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex h-80 flex-col items-center justify-center gap-2 text-muted-foreground">
            <LoaderCircle className="size-6 animate-spin text-primary" />
            입찰 기록을 불러오는 중...
          </div>
        ) : error ? (
          <p className="flex h-80 items-center justify-center text-destructive">
            입찰 기록을 불러오지 못했습니다. {error.message}
          </p>
        ) : items.length === 0 ? (
          <p className="flex h-80 items-center justify-center text-center text-muted-foreground">
            {date === today
              ? "오늘은 아직 검토한 기록이 없습니다. 입찰이 켜져 있으면 차례가 올 때 기록됩니다."
              : "이 날짜에는 검토한 기록이 없습니다."}
            <br />
            기록은 최근 {retentionDays}일만 보관합니다.
          </p>
        ) : (
          <>
            <BidLogChart items={items} />
            <BidLogTable items={items} />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** 검토별 표 — 최근 검토가 위 */
function BidLogTable({ items }: { items: BidLogItem[] }) {
  const rows = items.map((item, i) => ({ item, no: i + 1 })).reverse()
  return (
    <div className="min-w-0 rounded-md border">
      <Table className="tabular-nums">
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 text-center">No</TableHead>
            <TableHead className="text-center">검토 시각</TableHead>
            <TableHead className="text-center">결과</TableHead>
            <TableHead className="text-center">
              희망순위 / 입찰가 한도
            </TableHead>
            <TableHead className="text-center">
              이전 입찰가 / 예상 순위
            </TableHead>
            <TableHead className="text-center">새 입찰가 / 예상 순위</TableHead>
            <TableHead>사유</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ item, no }) => (
            <TableRow key={item.at + no}>
              <TableCell className="text-center text-muted-foreground">
                {no}
              </TableCell>
              <TableCell className="text-center">
                {formatKstTime(item.at, true)}
              </TableCell>
              <TableCell className="text-center">
                <span className={cn("font-medium", ACTION_CLASS[item.action])}>
                  {ACTION_LABEL[item.action]}
                </span>
                {item.sent && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    전송됨
                  </span>
                )}
              </TableCell>
              <TableCell className="text-center">
                {item.targetRank}위 / {formatNumber(item.maxBid)}원
              </TableCell>
              <TableCell className="text-center">
                {formatNumber(item.prevBid)}원 /{" "}
                {formatRank(item.rank, item.maxPosition)}
              </TableCell>
              <TableCell className="text-center font-medium">
                {formatNumber(item.newBid)}원 /{" "}
                {formatRank(item.newRank, item.maxPosition)}
              </TableCell>
              <TableCell
                className="max-w-72 truncate text-muted-foreground"
                title={item.reason}
              >
                {item.reason}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
