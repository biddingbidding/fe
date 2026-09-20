/** 한국 날짜·시각 도우미. 서버의 "하루" 는 한국 날짜 기준이다 (입찰 기록 등). */

const KST = "Asia/Seoul"

/** 오늘 한국 날짜 YYYY-MM-DD */
export function todayKst(): string {
  // en-CA 는 YYYY-MM-DD 형식으로 준다
  return new Intl.DateTimeFormat("en-CA", { timeZone: KST }).format(new Date())
}

/** YYYY-MM-DD 에 days 일을 더한 날짜 */
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const timeFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: KST,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
})
const timeWithSecondsFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: KST,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
})

/** ISO 시각 → 한국 시각 "14:05" (seconds 면 "14:05:09") */
export function formatKstTime(iso: string, seconds = false): string {
  return (seconds ? timeWithSecondsFormat : timeFormat).format(new Date(iso))
}
