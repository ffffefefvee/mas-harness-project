export function escapeHtml(value) {
  return String(value)
}

export function render(template, values) {
  let output = template
  for (const [name, value] of Object.entries(values)) {
    output = output.replaceAll(`{{${name}}}`, String(value))
  }
  return output
}
