export function subtotal(lines) {
  return lines.reduce((sum, line) => sum + line.unitCents, 0)
}
