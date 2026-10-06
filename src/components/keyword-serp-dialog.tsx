import { useState } from "react"
import {
  ExternalLink,
  ListOrdered,
  LoaderCircle,
  RefreshCw,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useKeywordSerpRank } from "@/hooks/use-serp"
import { formatKstTime } from "@/lib/kst-date"
import { naverSearchUrl } from "@/lib/naver"
import { cn } from "@/lib/utils"
import type { Device } from "@/types/ads"

interface KeywordSerpDialogProps {
  isOpen: boolean
  adGroupId: string
  keywordId: string
  /** 검색어 (제목에 표시) */
  keyword: string
  /** 처음 볼 기기 — 그룹의 기기 설정 */
  device: Device
  close: () => void
  unmount: () => void
}

const DEVICES: Device[] = ["PC", "MOBILE"]
const DEVICE_LABEL: Record<Device, string> = { PC: "PC", MOBILE: "모바일" }

/** 주소를 목록에 보일 모양으로 — 프로토콜·www.·끝 슬래시는 뺀다 */
function displayUrl(url: string) {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")
}

/**
 * 실시간 노출 순위 다이얼로그 — 네이버 검색 결과의 파워링크에 지금 누가 몇 위로 걸려 있는지. overlay-kit 으로 연다.
 * 네이버 검색광고 API 가 아니라 검색 페이지를 서버에서 읽은 것이라 전국 기준이며, 60초 안의 재조회는 서버 캐시를 쓴다.
 */
export function KeywordSerpDialog({
  isOpen,
  adGroupId,
  keywordId,
  keyword,
  device: initialDevice,
  close,
  unmount,
}: KeywordSerpDialogProps) {
  const [device, setDevice] = useState<Device>(initialDevice)
  const [refreshCount, setRefreshCount] = useState(0)
  const { data, isFetching, error } = useKeywordSerpRank(
    adGroupId,
    keywordId,
    device,
    refreshCount
  )
  const entries = data?.entries ?? []
  const myRank = entries.find((e) => e.mine)?.rank ?? null

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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListOrdered className="size-4 text-primary" />
            {keyword} · 실시간 순위
          </DialogTitle>
          <DialogDescription>
            네이버 검색 결과의 파워링크에 지금 걸린 광고입니다. 전국 기준이라
            지역 타겟 그룹은 순위확인지역과 다를 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            {DEVICES.map((d) => (
              <Button
                key={d}
                size="sm"
                variant={d === device ? "default" : "outline"}
                onClick={() => setDevice(d)}
              >
                {DEVICE_LABEL[d]}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {data && <span>{formatKstTime(data.at, true)} 기준</span>}
            <Button
              size="icon-sm"
              variant="outline"
              onClick={() => setRefreshCount((n) => n + 1)}
              disabled={isFetching}
              aria-label="다시 조회"
              title="다시 조회"
            >
              <RefreshCw className={cn(isFetching && "animate-spin")} />
            </Button>
          </div>
        </div>

        {isFetching && !data ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
            <LoaderCircle className="size-6 animate-spin text-primary" />
            네이버 검색 결과를 읽는 중...
          </div>
        ) : error ? (
          <p className="flex h-48 items-center justify-center text-center text-destructive">
            순위를 가져오지 못했습니다. {error.message}
          </p>
        ) : entries.length === 0 ? (
          <p className="flex h-48 items-center justify-center text-center text-muted-foreground">
            지금 이 키워드에는 파워링크 광고가 없습니다.
          </p>
        ) : (
          <ol className="divide-y rounded-md border tabular-nums">
            {entries.map((e) => (
              <li
                key={e.rank}
                className={cn(
                  "flex items-center gap-3 px-3 py-1.5 text-sm",
                  e.mine && "bg-primary/10 font-semibold"
                )}
              >
                <span className="w-6 text-right text-muted-foreground">
                  {e.rank}
                </span>
                <a
                  href={e.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate hover:underline"
                  title={e.url}
                >
                  {displayUrl(e.url)}
                </a>
                {e.mine && <Badge>내 광고</Badge>}
              </li>
            ))}
          </ol>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {data &&
              entries.length > 0 &&
              (myRank == null
                ? "내 광고는 노출되지 않았습니다"
                : `내 광고 ${myRank}위`)}
          </span>
          <a
            href={naverSearchUrl(keyword, device)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:underline"
          >
            네이버에서 보기 <ExternalLink className="size-3" />
          </a>
        </div>
      </DialogContent>
    </Dialog>
  )
}
