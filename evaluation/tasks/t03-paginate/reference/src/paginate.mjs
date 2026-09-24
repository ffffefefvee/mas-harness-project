export function paginate(items, page, pageSize) {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new RangeError('pageSize must be a positive integer')
  const pages = Math.ceil(items.length / pageSize)
  if (!Number.isInteger(page) || page < 1 || page > Math.max(pages, 1)) throw new RangeError(`page out of range: ${page}`)
  const start = (page - 1) * pageSize
  return { items: items.slice(start, start + pageSize), page, pages }
}
