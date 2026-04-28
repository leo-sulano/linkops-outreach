// Simple in-process throttle — prevents rapid-fire calls within a single serverless instance.
// Not a distributed rate limiter; meant to guard against accidental quota exhaustion.
const lastCalled = new Map<string, number>()

export function throttle(key: string, minIntervalMs: number): boolean {
  const now = Date.now()
  const last = lastCalled.get(key) ?? 0
  if (now - last < minIntervalMs) return false
  lastCalled.set(key, now)
  return true
}
