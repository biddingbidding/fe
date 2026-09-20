/**
 * 백엔드 API 진입점. `import * as api from "@/lib/api"` 로 쓴다.
 *
 * 공통 클라이언트(request/refresh/ApiError)는 client.ts, 엔드포인트는 피처별 파일에 있다.
 * 새 엔드포인트는 해당 피처 파일에 추가하고 (새 피처면 파일을 만들고) 여기서 내보낸다.
 */
export { ApiError, refreshAccessToken } from "./client"
export * from "./auth"
export * from "./naver-account"
export * from "./ad-groups"
export * from "./keyword-settings"
export * from "./collections"
export * from "./autobid"
export * from "./bid-logs"
