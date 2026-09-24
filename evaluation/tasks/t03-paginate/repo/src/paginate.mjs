export function paginate(items, page, pageSize) {
  const start = page * pageSize
  const pages = Math.floor(items.length / pageSize)
  return { items: items.slice(start, start + pageSize), page, pages }
}
