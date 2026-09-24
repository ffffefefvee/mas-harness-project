export function parseCsvLine(line) {
  const fields = []
  let field = ''
  let index = 0
  let quoted = false
  while (index <= line.length) {
    if (!quoted && field === '' && line[index] === '"') {
      quoted = true
      index += 1
      let closed = false
      while (index < line.length) {
        if (line[index] === '"') {
          if (line[index + 1] === '"') {
            field += '"'
            index += 2
            continue
          }
          closed = true
          index += 1
          break
        }
        field += line[index]
        index += 1
      }
      if (!closed) throw new SyntaxError('unterminated quoted field')
      continue
    }
    if (index === line.length || line[index] === ',') {
      fields.push(field)
      field = ''
      quoted = false
      index += 1
      continue
    }
    if (quoted) throw new SyntaxError(`unexpected character after closing quote at ${index}`)
    field += line[index]
    index += 1
  }
  return fields
}
