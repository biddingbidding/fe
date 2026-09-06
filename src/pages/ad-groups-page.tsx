import { useCallback, useEffect, useRef } from "react"
import { RefreshCw, UserPlus } from "lucide-react"
import { toast } from "sonner"

import { AdGroupTable } from "@/components/ad-group-table"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useAccount } from "@/hooks/use-account"
import { useAdGroups, useSyncAccount } from "@/hooks/use-ad-groups"
import { formatDateTime } from "@/lib/format"
import { openAccountDialog } from "@/lib/overlays"
import { errorMessage } from "@/lib/toast"

export function AdGroupsPage() {
  const { account } = useAccount()

  const customerId = account?.customerId
  const adGroups = useAdGroups(customerId)
  const syncAccount = useSyncAccount(customerId)
  const syncing = syncAccount.isPending
  const { mutate: runSync } = syncAccount

  const handleSync = useCallback(() => {
    const id = toast.loading("계정 동기화 중...")
    runSync(undefined, {
      onSuccess: (result) =>
        toast.success(
          `계정 동기화 완료 (${formatDateTime(result.syncedAt)}) — 캠페인 ${result.campaigns}개, 그룹 ${result.adGroups}개.`,
          { id }
        ),
      onError: (err) =>
        toast.error(errorMessage(err, "동기화에 실패했습니다."), { id }),
    })
  }, [runSync])

  // 연결만 하고 동기화한 적 없는 계정(그룹 0개)은 첫 진입 시 자동으로 1회 동기화
  const autoSyncedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!customerId || autoSyncedFor.current === customerId) return
    if (!adGroups.isSuccess || adGroups.data.length > 0) return
    autoSyncedFor.current = customerId
    handleSync()
  }, [customerId, adGroups.isSuccess, adGroups.data, handleSync])

  if (!account) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <UserPlus className="size-5 text-muted-foreground" />
        </div>
        <div className="flex flex-col gap-1">
          <p className="font-medium">네이버 광고 계정이 연결되지 않았습니다</p>
          <p className="text-sm text-muted-foreground">
            계정을 연결하면 캠페인과 광고 그룹을 불러올 수 있습니다.
          </p>
        </div>
        <Button onClick={() => void openAccountDialog()}>계정 연결</Button>
      </div>
    )
  }

  return (
    <AdGroupTable
      syncing={syncing}
      actions={
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-sm"
                variant="outline"
                onClick={handleSync}
                disabled={syncing}
                aria-label="계정 동기화"
              />
            }
          >
            <RefreshCw className={syncing ? "animate-spin" : undefined} />
          </TooltipTrigger>
          <TooltipContent>
            <p className="font-medium">계정 동기화</p>
            <p>캠페인과 광고 그룹을 다시 불러옵니다</p>
          </TooltipContent>
        </Tooltip>
      }
    />
  )
}
