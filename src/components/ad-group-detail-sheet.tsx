import { ExternalLink } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useAdGroupKeywords } from "@/hooks/use-ad-groups"
import { deviceLabel } from "@/lib/device"
import { priorityLabel } from "@/lib/priority"
import { REGION_ALL_LABEL } from "@/lib/region"
import { formatNumber } from "@/lib/format"
import type { AdGroup } from "@/types/ads"

interface AdGroupDetailSheetProps {
  isOpen: boolean
  close: () => void
  unmount: () => void
  group: AdGroup
}

/** 광고 그룹 행 클릭 시 열리는 상세 시트 — 기본 정보 + 키워드 목록(읽기 전용). overlay-kit으로 연다. */
export function AdGroupDetailSheet({
  isOpen,
  close,
  unmount,
  group,
}: AdGroupDetailSheetProps) {
  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) close()
      }}
      onOpenChangeComplete={(open) => {
        if (!open) unmount()
      }}
    >
      <SheetContent className="sm:max-w-lg">
        <DetailBody group={group} />
      </SheetContent>
    </Sheet>
  )
}

function DetailBody({ group }: { group: AdGroup }) {
  const {
    data: keywords,
    isLoading,
    isError,
    error,
  } = useAdGroupKeywords(group.id)
  const siteHref = /^https?:\/\//.test(group.siteUrl)
    ? group.siteUrl
    : `https://${group.siteUrl}`

  return (
    <>
      <SheetHeader>
        <SheetTitle>{group.name}</SheetTitle>
        <SheetDescription>{group.campaignName}</SheetDescription>
      </SheetHeader>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-4 text-sm">
        <dt className="text-muted-foreground">자동입찰</dt>
        <dd>
          {group.autobidEnabled ? (
            <span>진행 중</span>
          ) : (
            <span className="text-muted-foreground">정지</span>
          )}
        </dd>
        <dt className="text-muted-foreground">지역</dt>
        <dd>
          {group.regionName ? (
            <span>{group.regionName}</span>
          ) : (
            <span className="text-muted-foreground">{REGION_ALL_LABEL}</span>
          )}
        </dd>
        <dt className="text-muted-foreground">기기</dt>
        <dd>
          {group.device ? (
            <span>{deviceLabel(group.device)}</span>
          ) : (
            <span className="text-muted-foreground">미입력</span>
          )}
        </dd>
        <dt className="text-muted-foreground">우선순위</dt>
        <dd>
          {group.priority ? (
            <span>{priorityLabel(group.priority)}</span>
          ) : (
            <span className="text-muted-foreground">{priorityLabel(null)}</span>
          )}
        </dd>
        <dt className="text-muted-foreground">사이트</dt>
        <dd className="truncate">
          <a
            href={siteHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:underline"
          >
            {group.siteUrl}
            <ExternalLink className="size-3" />
          </a>
        </dd>
      </dl>

      <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 pb-4">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium">키워드</h4>
          {keywords && <Badge variant="secondary">{keywords.length}개</Badge>}
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-md border">
          {isLoading ? (
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : isError ? (
            <p className="p-4 text-center text-xs text-muted-foreground">
              키워드를 불러오지 못했습니다.
              <br />
              <span className="opacity-70">{error.message}</span>
            </p>
          ) : !keywords || keywords.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">
              등록된 키워드가 없습니다.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>키워드</TableHead>
                  <TableHead className="w-24 text-right">입찰가</TableHead>
                  <TableHead className="w-12 text-center">품질</TableHead>
                  <TableHead className="w-16 text-center">상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keywords.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell className="font-medium">{k.keyword}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {k.useGroupBidAmt ? (
                        <span className="text-muted-foreground">
                          그룹 입찰가
                        </span>
                      ) : (
                        `${formatNumber(k.bidAmt)}원`
                      )}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {k.qualityIndex ?? "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={k.userLock ? "outline" : "secondary"}
                        className="h-4 px-1.5"
                      >
                        {k.userLock ? "OFF" : "ON"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </>
  )
}
