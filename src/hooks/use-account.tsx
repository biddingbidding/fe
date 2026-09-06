import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import * as api from "@/lib/api"
import { authToken } from "@/lib/auth-token"
import { queryKeys } from "@/lib/query-keys"
import type { Account, AccountCredentials } from "@/types/ads"
import type { MeResponse, User, UserCredentials } from "@/types/auth"

interface AccountContextValue {
  /** 앱 로그인 사용자. 미로그인이면 null */
  user: User | null
  /** 연결된 네이버 광고 계정. 미연결이면 null */
  account: Account | null
  /** 세션 확인이 끝났는지 */
  ready: boolean
  login: (credentials: UserCredentials) => Promise<void>
  /** 회원가입 후 바로 로그인 */
  register: (credentials: UserCredentials) => Promise<void>
  logout: () => Promise<void>
  connectNaver: (credentials: AccountCredentials) => Promise<void>
  disconnectNaver: () => Promise<void>
}

const AccountContext = createContext<AccountContextValue | null>(null)

/** 새로고침 후 세션 복구: access 토큰이 없으면 refresh 쿠키로 받아온 뒤 /me 조회 */
async function loadMe(): Promise<MeResponse | null> {
  if (!authToken.get()) {
    const token = await api.refreshAccessToken()
    if (!token) return null
  }
  return api.getMe().catch(() => null)
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  const { data, isPending } = useQuery({
    queryKey: queryKeys.me,
    queryFn: loadMe,
    staleTime: Infinity,
  })
  const me = data ?? null

  const clearSession = useCallback(() => {
    queryClient.setQueryData<MeResponse | null>(queryKeys.me, null)
    // 사용자 종속 데이터는 캐시에서 제거
    queryClient.removeQueries({ queryKey: ["adGroups"] })
    queryClient.removeQueries({ queryKey: ["adGroupKeywords"] })
  }, [queryClient])

  // refresh 까지 실패하면 (세션 만료) 로그아웃 상태로 전환 → ProtectedRoute 가 /login 으로 보냄
  useEffect(() => {
    const unsubscribe = authToken.onUnauthorized(clearSession)
    return () => {
      unsubscribe()
    }
  }, [clearSession])

  const login = useCallback(
    async (credentials: UserCredentials) => {
      await api.login(credentials)
      const fresh = await api.getMe()
      queryClient.setQueryData<MeResponse | null>(queryKeys.me, fresh)
    },
    [queryClient]
  )

  const register = useCallback(
    async (credentials: UserCredentials) => {
      await api.register(credentials)
      await login(credentials)
    },
    [login]
  )

  const logout = useCallback(async () => {
    await api.logout()
    clearSession()
  }, [clearSession])

  const connectNaver = useCallback(
    async (credentials: AccountCredentials) => {
      const account = await api.connectNaver(credentials)
      queryClient.setQueryData<MeResponse | null>(queryKeys.me, (prev) =>
        prev ? { ...prev, naverAccount: account } : prev
      )
    },
    [queryClient]
  )

  const disconnectNaver = useCallback(async () => {
    await api.disconnectNaver()
    queryClient.setQueryData<MeResponse | null>(queryKeys.me, (prev) =>
      prev ? { ...prev, naverAccount: null } : prev
    )
    queryClient.removeQueries({ queryKey: ["adGroups"] })
    queryClient.removeQueries({ queryKey: ["adGroupKeywords"] })
  }, [queryClient])

  const value = useMemo(
    () => ({
      user: me?.user ?? null,
      account: me?.naverAccount ?? null,
      ready: !isPending,
      login,
      register,
      logout,
      connectNaver,
      disconnectNaver,
    }),
    [me, isPending, login, register, logout, connectNaver, disconnectNaver]
  )
  return (
    <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAccount() {
  const ctx = useContext(AccountContext)
  if (!ctx) throw new Error("useAccount must be used within AccountProvider")
  return ctx
}
