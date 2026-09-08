/** 광고 그룹 모음(즐겨찾기) 표시용 — 색 팔레트와 정렬 도우미 */
import type { AdGroup, Collection } from "@/types/ads"

/**
 * 모음 색. 서버는 32자 이하 문자열이면 무엇이든 받으므로 프론트에서 키를 정해 둔다.
 * 라이트/다크 어디서나 배지 배경으로 쓸 수 있게 중간 채도의 Tailwind 500 계열을 골랐다.
 */
export const COLLECTION_COLORS: { key: string; label: string; hex: string }[] = [
  { key: "red", label: "빨강", hex: "#ef4444" },
  { key: "orange", label: "주황", hex: "#f97316" },
  { key: "amber", label: "노랑", hex: "#f59e0b" },
  { key: "green", label: "초록", hex: "#22c55e" },
  { key: "teal", label: "청록", hex: "#14b8a6" },
  { key: "blue", label: "파랑", hex: "#3b82f6" },
  { key: "violet", label: "보라", hex: "#8b5cf6" },
  { key: "pink", label: "분홍", hex: "#ec4899" },
  { key: "gray", label: "회색", hex: "#6b7280" },
]

const DEFAULT_HEX = "#6b7280"

/** 팔레트 키 → hex. 모르는 값(직접 hex 를 넣은 경우 등)은 그대로, 없으면 회색 */
export function collectionHex(color: string | null | undefined): string {
  if (!color) return DEFAULT_HEX
  const found = COLLECTION_COLORS.find((c) => c.key === color)
  if (found) return found.hex
  return /^#[0-9a-f]{3,8}$/i.test(color) ? color : DEFAULT_HEX
}

/** 새 모음의 기본 색 — 아직 안 쓴 색 중 첫 번째, 다 썼으면 개수 기준 순환 */
export function nextCollectionColor(existing: Collection[]): string {
  const used = new Set(existing.map((c) => c.color))
  const free = COLLECTION_COLORS.find((c) => !used.has(c.key))
  return (free ?? COLLECTION_COLORS[existing.length % COLLECTION_COLORS.length])
    .key
}

/** 그룹이 담긴 모음들을 모음 표시 순서로 */
export function collectionsOf(
  group: AdGroup,
  collections: Collection[]
): Collection[] {
  const ids = new Set(group.collectionIds)
  return collections.filter((c) => ids.has(c.id))
}
