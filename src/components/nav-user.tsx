import { ChevronsUpDown, KeyRound, Link2, LogOut, Unlink } from "lucide-react"
import { overlay } from "overlay-kit"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/confirm-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { useAccount } from "@/hooks/use-account"
import { formatNumber } from "@/lib/format"
import { openAccountDialog } from "@/lib/overlays"
import { errorMessage } from "@/lib/toast"

export function NavUser() {
  const { user, account, logout, disconnectNaver } = useAccount()
  const { isMobile } = useSidebar()

  if (!user) return null

  function handleDisconnect() {
    overlay.open(({ isOpen, close, unmount }) => (
      <ConfirmDialog
        isOpen={isOpen}
        close={close}
        unmount={unmount}
        title="광고 계정 연결을 해제할까요?"
        description="연결을 해제하면 광고 그룹과 자동입찰 설정을 볼 수 없습니다. 다시 연결하면 복구됩니다."
        confirmLabel="연결 해제"
        pendingLabel="해제 중..."
        destructive
        onConfirm={async () => {
          await disconnectNaver()
          toast.success("광고 계정 연결을 해제했습니다.")
        }}
      />
    ))
  }

  function handleLogout() {
    const id = toast.loading("로그아웃 중...")
    logout()
      .then(() => toast.dismiss(id))
      .catch((err: unknown) =>
        toast.error(errorMessage(err, "로그아웃에 실패했습니다."), { id })
      )
  }

  // loginId 는 조회 실패 시 customerId 로 대체되어 내려온다. 그 경우 숫자 ID 는 노출하지 않는다
  const loginId =
    account && account.loginId !== account.customerId ? account.loginId : null
  const balanceText = account
    ? account.balance === null
      ? "잔액 조회 불가"
      : `잔액 ${formatNumber(account.balance)}원`
    : null
  const subtitle = account
    ? [loginId, balanceText].filter(Boolean).join(" · ")
    : "네이버 광고 계정 미연결"

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                tooltip={user.email}
                className="data-[popup-open]:bg-sidebar-accent data-[popup-open]:text-sidebar-accent-foreground"
              />
            }
          >
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.email}</span>
              <span className="truncate text-xs text-muted-foreground">
                {subtitle}
              </span>
            </div>
            <ChevronsUpDown className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-60 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex flex-col gap-0.5 px-2 py-1.5 text-sm">
                  <span className="font-medium">{user.email}</span>
                  <span className="text-xs text-muted-foreground">앱 계정</span>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuGroup>
              <DropdownMenuLabel>네이버 광고 계정</DropdownMenuLabel>
              {account ? (
                <>
                  <div className="flex flex-col gap-1 px-2 py-1.5 text-sm">
                    {loginId && (
                      <span className="font-medium">{loginId}</span>
                    )}
                    <div className="mt-1 grid grid-cols-2 gap-x-2 text-xs">
                      <span className="text-muted-foreground">소진액</span>
                      <span className="text-right tabular-nums">
                        {account.spent === null
                          ? "-"
                          : formatNumber(account.spent)}
                      </span>
                      <span className="text-muted-foreground">잔액</span>
                      <span className="text-right tabular-nums">
                        {account.balance === null
                          ? "-"
                          : formatNumber(account.balance)}
                      </span>
                    </div>
                  </div>
                  <DropdownMenuItem onClick={() => void openAccountDialog()}>
                    <KeyRound />
                    다른 광고 계정 연결
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDisconnect}>
                    <Unlink />
                    연결 해제
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem onClick={() => void openAccountDialog()}>
                  <Link2 />
                  광고 계정 연결
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={handleLogout}>
              <LogOut />
              로그아웃
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
