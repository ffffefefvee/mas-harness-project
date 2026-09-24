const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ENTITIES[character])
}

export function render(template, values) {
  return template.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (_, name) => {
    const value = values[name]
    if (value === undefined || value === null) throw new ReferenceError(`missing template value: ${name}`)
    return escapeHtml(value)
  })
}
