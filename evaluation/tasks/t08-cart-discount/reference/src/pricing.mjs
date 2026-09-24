const isCount = value => Number.isInteger(value) && value >= 0

export function subtotal(lines) {
  return lines.reduce((sum, line) => {
    if (!isCount(line.quantity) || !isCount(line.unitCents)) throw new RangeError(`invalid line for ${line.sku}`)
    return sum + line.quantity * line.unitCents
  }, 0)
}
