import { useEffect, useRef, useState } from "react"

import { ACTION_LABEL, formatRank } from "@/lib/bid-log"
import { formatNumber } from "@/lib/format"
import { formatKstTime } from "@/lib/kst-date"
import { cn } from "@/lib/utils"
import type { BidLogItem } from "@/types/bid-log"

interface BidLogChartProps {
  /** 시각 순 (오래된 것부터) */
  items: BidLogItem[]
}

const HEIGHT = 320
const MARGIN = { top: 12, right: 64, bottom: 36, left: 36 }
/** 시각 라벨 하나가 차지하는 최소 폭(px) — 이보다 촘촘하면 건너뛰며 찍는다 */
const LABEL_MIN_GAP = 52

/** 금액 축 끝값: 최댓값보다 조금 큰 깔끔한 수 (1 · 1.2 · 1.5 · 2 · 2.5 · 3 · 4 · 5 · 6 · 8 × 10^n) */
function niceCeil(value: number) {
  if (value <= 0) return 100
  const target = value * 1.05
  const pow = 10 ** Math.floor(Math.log10(target))
  const step =
    [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((m) => m * pow >= target) ??
    10
  return step * pow
}

/** 컨테이너 폭을 따라가도록 폭을 잰다 */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.floor(entry.contentRect.width))
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/**
 * 키워드 하루치 입찰 그래프 (SVG).
 * - 막대: 결정한 입찰가 (오른쪽 금액 축)
 * - 점선: 입찰가 한도 (오른쪽 금액 축)
 * - 빨간 선: 새 입찰가의 예상 순위 (왼쪽 순위 축, 위가 1위, 맨 아래가 순위 밖)
 * - 노란 띠: 목표범위 = 희망순위 ±1
 * 가로축은 검토 순서다 (검토마다 같은 간격). 막대에 마우스를 올리면 그 검토의 자세한 값을 보여준다.
 */
export function BidLogChart({ items }: BidLogChartProps) {
  const [containerRef, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)

  const n = items.length
  const plotW = Math.max(0, width - MARGIN.left - MARGIN.right)
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom
  const step = n ? plotW / n : 0
  const bottom = MARGIN.top + plotH

  // 순위 축: 0(위) ~ 최대 순위 + 1(= 순위 밖, 맨 아래)
  const maxPosition = Math.max(1, ...items.map((i) => i.maxPosition))
  const rankEnd = maxPosition + 1
  const yRank = (r: number) => MARGIN.top + (r / rankEnd) * plotH

  // 금액 축: 0(아래) ~ 한도·입찰가 중 가장 큰 값
  const wonEnd = niceCeil(
    Math.max(0, ...items.flatMap((i) => [i.maxBid, i.prevBid, i.newBid]))
  )
  const yWon = (v: number) => bottom - (v / wonEnd) * plotH
  const wonTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(wonEnd * f))

  const xAt = (i: number) => MARGIN.left + i * step
  const cx = (i: number) => xAt(i) + step / 2
  const barW = Math.max(1, Math.min(step * 0.6, 24))
  const labelEvery = Math.max(1, Math.ceil(LABEL_MIN_GAP / Math.max(step, 1)))

  // 목표범위 띠: 희망순위가 같은 구간끼리 한 사각형으로
  const bands: { from: number; to: number; target: number }[] = []
  items.forEach((it, i) => {
    const last = bands.at(-1)
    if (last && last.target === it.targetRank && last.to === i) last.to = i + 1
    else bands.push({ from: i, to: i + 1, target: it.targetRank })
  })

  // 입찰가 한도: 검토 칸마다 가로선, 한도가 바뀌면 세로로 이어지는 계단선
  const maxBidPath = items
    .map(
      (it, i) =>
        `${i === 0 ? "M" : "L"} ${xAt(i)} ${yWon(it.maxBid)} H ${xAt(i + 1)}`
    )
    .join(" ")

  // 예상 순위: 모르는 값(null)에서 끊는다
  const rankPath = items
    .map((it, i) => {
      if (it.newRank == null) return null
      const prevKnown = i > 0 && items[i - 1].newRank != null
      return `${prevKnown ? "L" : "M"} ${cx(i)} ${yRank(it.newRank)}`
    })
    .filter(Boolean)
    .join(" ")

  const hovered = hover != null ? items[hover] : null

  return (
    // min-w-0: 다이얼로그가 grid 라 넓은 표가 옆에 있으면 그래프 폭까지 늘어나지 않게
    <div className="flex min-w-0 flex-col gap-3">
      <div ref={containerRef} className="relative w-full">
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label="입찰가와 예상 순위 그래프"
            className="block text-xs select-none"
            onMouseLeave={() => setHover(null)}
          >
            {/* 목표범위 (희망 ±1) */}
            {bands.map((b) => (
              <rect
                key={b.from}
                x={xAt(b.from)}
                width={xAt(b.to) - xAt(b.from)}
                y={yRank(Math.max(0, b.target - 1))}
                height={
                  yRank(Math.min(rankEnd, b.target + 1)) -
                  yRank(Math.max(0, b.target - 1))
                }
                className="fill-amber-300/40 dark:fill-amber-400/20"
              />
            ))}

            {/* 순위 축 눈금 + 가로 격자 */}
            {Array.from({ length: rankEnd + 1 }, (_, r) => (
              <g key={r}>
                <line
                  x1={MARGIN.left}
                  x2={MARGIN.left + plotW}
                  y1={yRank(r)}
                  y2={yRank(r)}
                  className="stroke-border"
                  strokeWidth={1}
                />
                <text
                  x={MARGIN.left - 6}
                  y={yRank(r)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-muted-foreground tabular-nums"
                >
                  {r === rankEnd ? "밖" : r === 0 ? "" : r}
                </text>
              </g>
            ))}

            {/* 금액 축 눈금 */}
            {wonTicks.map((v) => (
              <text
                key={v}
                x={MARGIN.left + plotW + 6}
                y={yWon(v)}
                dominantBaseline="middle"
                className="fill-muted-foreground tabular-nums"
              >
                {formatNumber(v)}
              </text>
            ))}

            {/* 입찰가 막대 */}
            {items.map((it, i) => (
              <rect
                key={it.at + i}
                x={cx(i) - barW / 2}
                width={barW}
                y={yWon(it.newBid)}
                height={bottom - yWon(it.newBid)}
                className={cn(
                  "fill-chart-2 transition-opacity",
                  hover != null && hover !== i && "opacity-50"
                )}
              />
            ))}

            {/* 입찰가 한도 */}
            {n > 0 && (
              <path
                d={maxBidPath}
                fill="none"
                strokeWidth={2}
                strokeDasharray="6 4"
                className="stroke-blue-600 dark:stroke-blue-400"
              />
            )}

            {/* 예상 순위 */}
            {rankPath && (
              <path
                d={rankPath}
                fill="none"
                strokeWidth={2}
                strokeLinejoin="round"
                className="stroke-destructive"
              />
            )}
            {step >= 8 &&
              items.map((it, i) =>
                it.newRank == null ? null : (
                  <circle
                    key={it.at + i}
                    cx={cx(i)}
                    cy={yRank(it.newRank)}
                    r={2.5}
                    className="fill-destructive"
                  />
                )
              )}

            {/* 시각 라벨 */}
            {items.map((it, i) =>
              i % labelEvery === 0 ? (
                <text
                  key={it.at + i}
                  x={cx(i)}
                  y={bottom + 22}
                  textAnchor="middle"
                  className="fill-muted-foreground tabular-nums"
                >
                  {formatKstTime(it.at)}
                </text>
              ) : null
            )}

            {/* 마우스 위치 표시 + 영역 */}
            {hover != null && (
              <line
                x1={cx(hover)}
                x2={cx(hover)}
                y1={MARGIN.top}
                y2={bottom}
                className="stroke-foreground/40"
                strokeWidth={1}
              />
            )}
            {items.map((it, i) => (
              <rect
                key={it.at + i}
                x={xAt(i)}
                width={step}
                y={MARGIN.top}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            ))}
          </svg>
        )}

        {hovered && hover != null && (
          <div
            className="pointer-events-none absolute top-2 z-10 w-56 rounded-md border bg-popover p-2 text-xs text-popover-foreground shadow-md"
            style={
              cx(hover) > width / 2
                ? { right: width - cx(hover) + 12 }
                : { left: cx(hover) + 12 }
            }
          >
            <p className="mb-1 font-medium tabular-nums">
              {formatKstTime(hovered.at, true)} · {ACTION_LABEL[hovered.action]}
              {hovered.sent && " · 전송됨"}
            </p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 tabular-nums">
              <dt className="text-muted-foreground">입찰가</dt>
              <dd>
                {formatNumber(hovered.prevBid)} → {formatNumber(hovered.newBid)}
                원
              </dd>
              <dt className="text-muted-foreground">예상 순위</dt>
              <dd>
                {formatRank(hovered.rank, hovered.maxPosition)} →{" "}
                {formatRank(hovered.newRank, hovered.maxPosition)}
              </dd>
              <dt className="text-muted-foreground">희망 / 한도</dt>
              <dd>
                {hovered.targetRank}위 / {formatNumber(hovered.maxBid)}원
              </dd>
            </dl>
            <p className="mt-1 break-keep text-muted-foreground">
              {hovered.reason}
            </p>
          </div>
        )}
      </div>

      <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <li className="flex items-center gap-2">
          <span className="h-3 w-5 rounded-sm bg-chart-2" />
          입찰가
        </li>
        <li className="flex items-center gap-2">
          <span className="w-6 border-t-2 border-dashed border-blue-600 dark:border-blue-400" />
          입찰가 한도
        </li>
        <li className="flex items-center gap-2">
          <span className="h-0.5 w-6 bg-destructive" />
          예상 순위
        </li>
        <li className="flex items-center gap-2">
          <span className="h-3 w-5 rounded-sm bg-amber-300/40 dark:bg-amber-400/20" />
          목표범위 (희망 ±1)
        </li>
      </ul>
    </div>
  )
}
