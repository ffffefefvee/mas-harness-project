export function mergeIntervals(intervals) {
  const pairs = intervals.map(([start, end]) => {
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) throw new RangeError(`invalid interval [${start}, ${end}]`)
    return [start, end]
  })
  pairs.sort((left, right) => left[0] - right[0] || left[1] - right[1])
  const merged = []
  for (const pair of pairs) {
    const last = merged.at(-1)
    if (last && pair[0] <= last[1]) last[1] = Math.max(last[1], pair[1])
    else merged.push(pair)
  }
  return merged
}
