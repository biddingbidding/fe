import { Link, useLocation } from "react-router"

import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { useAccount } from "@/hooks/use-account"
import { useAdGroups } from "@/hooks/use-ad-groups"
import { pages, type PageKey } from "@/lib/pages"

export function AppSidebar() {
  const { pathname } = useLocation()
  const { account } = useAccount()
  const { data: groups = [] } = useAdGroups(account?.customerId)
  // 자동입찰 큐(대기열)에 있는 그룹 수
  const badges: Partial<Record<PageKey, number>> = {
    bidding: groups.filter((g) => g.queued).length,
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="px-2 py-1 text-sm font-semibold group-data-[collapsible=icon]:hidden">
          비딩비딩
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>네이버 자동입찰</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {pages.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={pathname.startsWith(item.path)}
                    render={<Link to={item.path} />}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                  {badges[item.key] ? (
                    <SidebarMenuBadge>{badges[item.key]}</SidebarMenuBadge>
                  ) : null}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
