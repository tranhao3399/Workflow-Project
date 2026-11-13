import type { FormField, FormTableColumn } from '../types/workflow'

export type FormulaAstNode =
  | { kind: 'NUMBER'; value: number }
  | { kind: 'REF'; key: string; tableKey?: string }
  | { kind: 'SUM'; tableKey: string; columnKey: string }
  | { kind: 'UNARY'; operator: '+' | '-'; operand: FormulaAstNode }
  | { kind: 'BINARY'; operator: '+' | '-' | '*' | '/'; left: FormulaAstNode; right: FormulaAstNode }

export interface FormulaParseResult {
  ast?: FormulaAstNode
  error?: string
}

export interface FormulaIssue {
  path: string
  message: string
}

interface Token {
  type: 'NUMBER' | 'IDENT' | 'BRACKET' | 'OP' | 'LPAREN' | 'RPAREN' | 'DOT'
  value: string
  pos: number
}

const IDENT_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/
const NUMERIC_TYPES = new Set(['NUMBER', 'CURRENCY'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function tokenizeFormula(expression: string): { tokens?: Token[]; error?: string } {
  const tokens: Token[] = []
  let i = 0
  const len = expression.length

  while (i < len) {
    const ch = expression[i]
    if (/\s/.test(ch)) {
      i += 1
      continue
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ type: 'OP', value: ch, pos: i })
      i += 1
      continue
    }
    if (ch === '(') {
      tokens.push({ type: 'LPAREN', value: ch, pos: i })
      i += 1
      continue
    }
    if (ch === ')') {
      tokens.push({ type: 'RPAREN', value: ch, pos: i })
      i += 1
      continue
    }
    if (ch === '.') {
      tokens.push({ type: 'DOT', value: ch, pos: i })
      i += 1
      continue
    }
    if (ch === '[') {
      const closeIdx = expression.indexOf(']', i + 1)
      if (closeIdx === -1) {
        return { error: 'Thiếu dấu đóng ngoặc vuông "]" cho mã trường trong công thức.' }
      }
      const inside = expression.slice(i + 1, closeIdx).trim()
      if (!inside) {
        return { error: 'Mã trường trong cặp ngoặc vuông "[]" không được để trống.' }
      }
      if (inside.includes('.')) {
        const parts = inside.split('.').map((p) => p.trim())
        if (parts.length !== 2 || !IDENT_PATTERN.test(parts[0]) || !IDENT_PATTERN.test(parts[1])) {
          return { error: `Tham chiếu "[${inside}]" không đúng định dạng [mã_bảng].[mã_cột].` }
        }
        tokens.push({ type: 'BRACKET', value: parts[0], pos: i })
        tokens.push({ type: 'DOT', value: '.', pos: i })
        tokens.push({ type: 'BRACKET', value: parts[1], pos: i })
      } else {
        if (!IDENT_PATTERN.test(inside)) {
          return { error: `Mã trường "[${inside}]" không hợp lệ.` }
        }
        tokens.push({ type: 'BRACKET', value: inside, pos: i })
      }
      i = closeIdx + 1
      continue
    }
    if (/\d/.test(ch)) {
      let numStr = ''
      let hasDot = false
      const start = i
      while (i < len && (/\d/.test(expression[i]) || expression[i] === '.')) {
        if (expression[i] === '.') {
          if (hasDot) {
            return { error: `Số "${numStr}." không hợp lệ trong công thức.` }
          }
          hasDot = true
        }
        numStr += expression[i]
        i += 1
      }
      const parsed = Number(numStr)
      if (!Number.isFinite(parsed)) {
        return { error: `Giá trị số "${numStr}" không hợp lệ.` }
      }
      tokens.push({ type: 'NUMBER', value: numStr, pos: start })
      continue
    }
    if (/[A-Za-z_]/.test(ch)) {
      let ident = ''
      const start = i
      while (i < len && /[A-Za-z0-9_]/.test(expression[i])) {
        ident += expression[i]
        i += 1
      }
      if (!IDENT_PATTERN.test(ident)) {
        return { error: `Từ khóa hoặc mã trường "${ident}" không hợp lệ.` }
      }
      tokens.push({ type: 'IDENT', value: ident, pos: start })
      continue
    }
    return {
      error: `Ký tự "${ch}" không hợp lệ trong công thức. Chỉ hỗ trợ +, -, *, /, (), [mã_trường] và hàm SUM.`,
    }
  }

  return { tokens }
}

export function parseFormulaExpression(rawExpression: string): FormulaParseResult {
  const trimmed = rawExpression.trim()
  if (!trimmed) {
    return { error: 'Công thức tính toán không được để trống.' }
  }

  const tokenized = tokenizeFormula(trimmed)
  if (tokenized.error || !tokenized.tokens) {
    return { error: tokenized.error ?? 'Công thức không hợp lệ.' }
  }
  const tokens = tokenized.tokens
  if (tokens.length === 0) {
    return { error: 'Công thức tính toán không được để trống.' }
  }

  let cursor = 0

  function peek(): Token | undefined {
    return tokens[cursor]
  }

  function consume(): Token {
    const token = tokens[cursor]
    cursor += 1
    return token
  }

  function parseExpression(): FormulaParseResult {
    const leftRes = parseTerm()
    if (leftRes.error || !leftRes.ast) return leftRes
    let left = leftRes.ast

    while (peek()?.type === 'OP' && (peek()!.value === '+' || peek()!.value === '-')) {
      const op = consume().value as '+' | '-'
      const rightRes = parseTerm()
      if (rightRes.error || !rightRes.ast) return rightRes
      left = { kind: 'BINARY', operator: op, left, right: rightRes.ast }
    }
    return { ast: left }
  }

  function parseTerm(): FormulaParseResult {
    const leftRes = parseUnary()
    if (leftRes.error || !leftRes.ast) return leftRes
    let left = leftRes.ast

    while (peek()?.type === 'OP' && (peek()!.value === '*' || peek()!.value === '/')) {
      const op = consume().value as '*' | '/'
      const rightRes = parseUnary()
      if (rightRes.error || !rightRes.ast) return rightRes
      left = { kind: 'BINARY', operator: op, left, right: rightRes.ast }
    }
    return { ast: left }
  }

  function parseUnary(): FormulaParseResult {
    if (peek()?.type === 'OP' && (peek()!.value === '+' || peek()!.value === '-')) {
      const op = consume().value as '+' | '-'
      const operandRes = parseUnary()
      if (operandRes.error || !operandRes.ast) return operandRes
      return { ast: { kind: 'UNARY', operator: op, operand: operandRes.ast } }
    }
    return parsePrimary()
  }

  function parsePrimary(): FormulaParseResult {
    const token = peek()
    if (!token) {
      return { error: 'Cú pháp không hợp lệ.' }
    }

    if (token.type === 'NUMBER') {
      consume()
      return { ast: { kind: 'NUMBER', value: Number(token.value) } }
    }

    if (token.type === 'LPAREN') {
      consume()
      if (peek()?.type === 'RPAREN') {
        return { error: 'Cú pháp không hợp lệ.' }
      }
      const inner = parseExpression()
      if (inner.error || !inner.ast) return inner
      if (peek()?.type !== 'RPAREN') {
        return { error: 'Cú pháp không hợp lệ (thiếu dấu ")").' }
      }
      consume()
      return inner
    }

    if (token.type === 'IDENT' && token.value.toUpperCase() === 'SUM') {
      consume()
      if (peek()?.type !== 'LPAREN') {
        return { error: 'Sau hàm SUM phải là dấu mở ngoặc đơn "(". Ví dụ: SUM([mã_bảng].[mã_cột]).' }
      }
      consume()
      const firstToken = peek()
      if (!firstToken || (firstToken.type !== 'BRACKET' && firstToken.type !== 'IDENT')) {
        return { error: 'Hàm SUM cần truyền vào [mã_bảng].[mã_cột]. Ví dụ: SUM([chi_tiet].[thanh_tien]).' }
      }
      const tableKey = consume().value
      if (peek()?.type !== 'DOT') {
        return {
          error: `Hàm SUM cần chỉ rõ cả mã bảng và mã cột theo cú pháp SUM([${tableKey}].[mã_cột]).`,
        }
      }
      consume()
      const secondToken = peek()
      if (!secondToken || (secondToken.type !== 'BRACKET' && secondToken.type !== 'IDENT')) {
        return { error: `Thiếu mã cột sau dấu chấm trong hàm SUM([${tableKey}].[mã_cột]).` }
      }
      const columnKey = consume().value
      if (peek()?.type !== 'RPAREN') {
        return { error: `Thiếu dấu đóng ngoặc ")" cho hàm SUM([${tableKey}].[${columnKey}]).` }
      }
      consume()
      return { ast: { kind: 'SUM', tableKey, columnKey } }
    }

    if (token.type === 'IDENT' || token.type === 'BRACKET') {
      const firstKey = consume().value
      if (token.type === 'IDENT' && peek()?.type === 'LPAREN') {
        return {
          error: `Không hỗ trợ hàm "${firstKey}(...)". Hệ thống chỉ hỗ trợ 4 phép toán (+, -, *, /) và hàm SUM.`,
        }
      }
      if (peek()?.type === 'DOT') {
        consume()
        const second = peek()
        if (!second || (second.type !== 'BRACKET' && second.type !== 'IDENT')) {
          return { error: `Thiếu mã cột sau dấu chấm của "[${firstKey}].".` }
        }
        const secondKey = consume().value
        return { ast: { kind: 'REF', tableKey: firstKey, key: secondKey } }
      }
      return { ast: { kind: 'REF', key: firstKey } }
    }

    return { error: 'Cú pháp không hợp lệ.' }
  }

  const result = parseExpression()
  if (result.error || !result.ast) return result
  if (cursor < tokens.length) {
    return {
      error: 'Cú pháp không hợp lệ.',
    }
  }
  return result
}

interface CalcNodeMeta {
  nodeId: string
  label: string
  key: string
  path: string
  targetType: 'NUMBER' | 'CURRENCY'
  scope: 'FIELD' | 'COLUMN'
  tableKey?: string
  ast: FormulaAstNode
  dependencies: string[]
}

export function validateFormCalculationsAndCycles(fields: readonly FormField[]): FormulaIssue[] {
  const issues: FormulaIssue[] = []
  const fieldsByKey = new Map<string, { index: number; field: FormField }>()
  const tableColumnsByKey = new Map<
    string,
    Map<string, { colIndex: number; column: FormTableColumn }>
  >()

  fields.forEach((field, index) => {
    const key = field.key.trim()
    if (!key) return
    fieldsByKey.set(key, { index, field })
    if (field.type === 'TABLE' && field.tableConfig?.columns) {
      const colMap = new Map<string, { colIndex: number; column: FormTableColumn }>()
      field.tableConfig.columns.forEach((column, colIndex) => {
        const colKey = column.key.trim()
        if (colKey) colMap.set(colKey, { colIndex, column })
      })
      tableColumnsByKey.set(key, colMap)
    }
  })

  const calcNodes = new Map<string, CalcNodeMeta>()

  function displayLabel(label: string, key: string): string {
    return label.trim() ? `"${label.trim()}" (${key})` : key
  }

  fields.forEach((field, index) => {
    const fieldKey = field.key.trim()
    const formulaPath = `fields.${index}.formula`

    if (field.formula !== undefined && field.formula !== '') {
      if (!NUMERIC_TYPES.has(field.type)) {
        issues.push({
          path: formulaPath,
          message: 'Chỉ trường kiểu Số hoặc Tiền tệ mới được thiết lập công thức tính toán.',
        })
      } else if (field.autoFill) {
        issues.push({
          path: formulaPath,
          message: 'Trường đã cấu hình tự động điền từ hồ sơ không thể gắn thêm công thức tính toán.',
        })
      } else {
        const parsed = parseFormulaExpression(field.formula)
        if (parsed.error || !parsed.ast) {
          issues.push({
            path: formulaPath,
            message: parsed.error ?? 'Công thức tính toán không hợp lệ.',
          })
        } else {
          const deps: string[] = []
          const refErrors: FormulaIssue[] = []
          collectAndValidateFieldDependencies(
            parsed.ast,
            formulaPath,
            fieldsByKey,
            tableColumnsByKey,
            deps,
            refErrors,
          )
          if (refErrors.length > 0) {
            issues.push(...refErrors)
          } else {
            calcNodes.set(`field:${fieldKey}`, {
              nodeId: `field:${fieldKey}`,
              label: `trường ${displayLabel(field.label, fieldKey)}`,
              key: fieldKey,
              path: formulaPath,
              targetType: field.type as 'NUMBER' | 'CURRENCY',
              scope: 'FIELD',
              ast: parsed.ast,
              dependencies: [...new Set(deps)],
            })
          }
        }
      }
    }

    if (field.type === 'TABLE' && field.tableConfig?.columns) {
      const colMap = tableColumnsByKey.get(fieldKey) ?? new Map()
      field.tableConfig.columns.forEach((column, colIndex) => {
        const colKey = column.key.trim()
        const colFormulaPath = `fields.${index}.tableConfig.columns.${colIndex}.formula`
        if (column.formula === undefined || column.formula === '') return

        if (!NUMERIC_TYPES.has(column.type)) {
          issues.push({
            path: colFormulaPath,
            message: 'Chỉ cột kiểu Số hoặc Tiền tệ mới được thiết lập công thức tính toán.',
          })
          return
        }
        const parsed = parseFormulaExpression(column.formula)
        if (parsed.error || !parsed.ast) {
          issues.push({
            path: colFormulaPath,
            message: parsed.error ?? 'Công thức cột không hợp lệ.',
          })
          return
        }
        const deps: string[] = []
        const refErrors: FormulaIssue[] = []
        collectAndValidateColumnDependencies(
          parsed.ast,
          fieldKey,
          colFormulaPath,
          colMap,
          fieldsByKey,
          deps,
          refErrors,
        )
        if (refErrors.length > 0) {
          issues.push(...refErrors)
        } else {
          calcNodes.set(`table:${fieldKey}.col:${colKey}`, {
            nodeId: `table:${fieldKey}.col:${colKey}`,
            label: `cột ${displayLabel(column.label, colKey)}`,
            key: colKey,
            path: colFormulaPath,
            targetType: column.type as 'NUMBER' | 'CURRENCY',
            scope: 'COLUMN',
            tableKey: fieldKey,
            ast: parsed.ast,
            dependencies: [...new Set(deps)],
          })
        }
      })
    }
  })

  detectFormulaCycles(calcNodes, issues)
  return issues
}

function collectAndValidateFieldDependencies(
  node: FormulaAstNode,
  formulaPath: string,
  fieldsByKey: ReadonlyMap<string, { index: number; field: FormField }>,
  tableColumnsByKey: ReadonlyMap<
    string,
    ReadonlyMap<string, { colIndex: number; column: FormTableColumn }>
  >,
  deps: string[],
  errors: FormulaIssue[],
): void {
  if (node.kind === 'NUMBER') return
  if (node.kind === 'UNARY') {
    collectAndValidateFieldDependencies(
      node.operand,
      formulaPath,
      fieldsByKey,
      tableColumnsByKey,
      deps,
      errors,
    )
    return
  }
  if (node.kind === 'BINARY') {
    collectAndValidateFieldDependencies(
      node.left,
      formulaPath,
      fieldsByKey,
      tableColumnsByKey,
      deps,
      errors,
    )
    collectAndValidateFieldDependencies(
      node.right,
      formulaPath,
      fieldsByKey,
      tableColumnsByKey,
      deps,
      errors,
    )
    return
  }
  if (node.kind === 'REF') {
    if (node.tableKey) {
      errors.push({
        path: formulaPath,
        message: `Không thể gọi trực tiếp "[${node.tableKey}].[${node.key}]" ở trường ngoài bảng. Hãy dùng hàm SUM([${node.tableKey}].[${node.key}]).`,
      })
      return
    }
    const target = fieldsByKey.get(node.key)
    if (!target) {
      errors.push({
        path: formulaPath,
        message: `Trường "[${node.key}]" trong công thức không tồn tại trên biểu mẫu.`,
      })
      return
    }
    if (!NUMERIC_TYPES.has(target.field.type)) {
      errors.push({
        path: formulaPath,
        message: `Trường "${target.field.label}" ([${node.key}]) không phải kiểu Số hoặc Tiền tệ nên không thể đưa vào công thức.`,
      })
      return
    }
    deps.push(`field:${node.key}`)
    return
  }
  if (node.kind === 'SUM') {
    const tableEntry = fieldsByKey.get(node.tableKey)
    if (!tableEntry || tableEntry.field.type !== 'TABLE') {
      errors.push({
        path: formulaPath,
        message: `Bảng "[${node.tableKey}]" trong hàm SUM không tồn tại hoặc không phải trường Bảng dữ liệu.`,
      })
      return
    }
    const colMap = tableColumnsByKey.get(node.tableKey)
    const colEntry = colMap?.get(node.columnKey)
    if (!colEntry) {
      errors.push({
        path: formulaPath,
        message: `Cột "[${node.columnKey}]" không tồn tại trong bảng "${tableEntry.field.label}" ([${node.tableKey}]).`,
      })
      return
    }
    if (!NUMERIC_TYPES.has(colEntry.column.type)) {
      errors.push({
        path: formulaPath,
        message: `Cột "${colEntry.column.label}" ([${node.columnKey}]) phải là kiểu Số hoặc Tiền tệ để tính tổng SUM.`,
      })
      return
    }
    deps.push(`table:${node.tableKey}.col:${node.columnKey}`)
  }
}

function collectAndValidateColumnDependencies(
  node: FormulaAstNode,
  currentTableKey: string,
  formulaPath: string,
  colMap: ReadonlyMap<string, { colIndex: number; column: FormTableColumn }>,
  fieldsByKey: ReadonlyMap<string, { index: number; field: FormField }>,
  deps: string[],
  errors: FormulaIssue[],
): void {
  if (node.kind === 'NUMBER') return
  if (node.kind === 'UNARY') {
    collectAndValidateColumnDependencies(
      node.operand,
      currentTableKey,
      formulaPath,
      colMap,
      fieldsByKey,
      deps,
      errors,
    )
    return
  }
  if (node.kind === 'BINARY') {
    collectAndValidateColumnDependencies(
      node.left,
      currentTableKey,
      formulaPath,
      colMap,
      fieldsByKey,
      deps,
      errors,
    )
    collectAndValidateColumnDependencies(
      node.right,
      currentTableKey,
      formulaPath,
      colMap,
      fieldsByKey,
      deps,
      errors,
    )
    return
  }
  if (node.kind === 'SUM') {
    errors.push({
      path: formulaPath,
      message:
        'Cột trong bảng tính toán theo từng dòng, không sử dụng hàm SUM. Hãy dùng hàm SUM ở trường ngoài bảng.',
    })
    return
  }
  if (node.kind === 'REF') {
    if (node.tableKey && node.tableKey !== currentTableKey) {
      errors.push({
        path: formulaPath,
        message: `Công thức dòng của bảng "[${currentTableKey}]" không thể tham chiếu sang bảng khác "[${node.tableKey}]".`,
      })
      return
    }
    const targetCol = colMap.get(node.key)
    if (targetCol) {
      if (!NUMERIC_TYPES.has(targetCol.column.type)) {
        errors.push({
          path: formulaPath,
          message: `Cột "${targetCol.column.label}" ([${node.key}]) không phải kiểu Số hoặc Tiền tệ nên không thể đưa vào công thức.`,
        })
        return
      }
      deps.push(`table:${currentTableKey}.col:${node.key}`)
      return
    }
    if (!node.tableKey) {
      const topField = fieldsByKey.get(node.key)
      if (topField) {
        if (!NUMERIC_TYPES.has(topField.field.type)) {
          errors.push({
            path: formulaPath,
            message: `Trường "${topField.field.label}" ([${node.key}]) không phải kiểu Số hoặc Tiền tệ nên không thể đưa vào công thức.`,
          })
          return
        }
        deps.push(`field:${node.key}`)
        return
      }
    }
    errors.push({
      path: formulaPath,
      message: `Cột "[${node.key}]" trong công thức không tồn tại trong bảng.`,
    })
  }
}

function detectFormulaCycles(
  calcNodes: ReadonlyMap<string, CalcNodeMeta>,
  issues: FormulaIssue[],
): void {
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const reportedPaths = new Set<string>()

  function dfs(nodeId: string, trail: string[]): void {
    if (visiting.has(nodeId)) {
      const cycleStart = trail.indexOf(nodeId)
      const cycleIds = cycleStart >= 0 ? trail.slice(cycleStart) : [nodeId]
      const labels = cycleIds.map((id) => calcNodes.get(id)?.label ?? id)
      const message =
        cycleIds.length === 1
          ? `Công thức của ${labels[0]} không được tự tham chiếu chính nó. Vui lòng kiểm tra lại.`
          : `Công thức bị lặp vòng giữa ${labels.join(' và ')}. Vui lòng kiểm tra lại.`
      for (const id of cycleIds) {
        const meta = calcNodes.get(id)
        if (meta && !reportedPaths.has(meta.path)) {
          reportedPaths.add(meta.path)
          issues.push({
            path: meta.path,
            message,
          })
        }
      }
      return
    }
    if (visited.has(nodeId)) return

    visiting.add(nodeId)
    const meta = calcNodes.get(nodeId)
    if (meta) {
      for (const depId of meta.dependencies) {
        if (calcNodes.has(depId)) {
          dfs(depId, [...trail, nodeId])
        }
      }
    }
    visiting.delete(nodeId)
    visited.add(nodeId)
  }

  for (const nodeId of calcNodes.keys()) {
    if (!visited.has(nodeId)) {
      dfs(nodeId, [])
    }
  }
}

export function evaluateFormCalculations(
  fields: readonly FormField[],
  formData: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const validationIssues = validateFormCalculationsAndCycles(fields)
  const brokenPaths = new Set(validationIssues.map((i) => i.path))

  const fieldsByKey = new Map<string, FormField>()
  const calcNodes = new Map<string, CalcNodeMeta>()

  fields.forEach((field, index) => {
    const fieldKey = field.key.trim()
    if (!fieldKey) return
    fieldsByKey.set(fieldKey, field)
    const formulaPath = `fields.${index}.formula`

    if (
      typeof field.formula === 'string' &&
      field.formula.trim() &&
      NUMERIC_TYPES.has(field.type) &&
      !brokenPaths.has(formulaPath)
    ) {
      const parsed = parseFormulaExpression(field.formula)
      if (parsed.ast) {
        const deps: string[] = []
        collectQuickDeps(parsed.ast, 'FIELD', fieldKey, deps)
        calcNodes.set(`field:${fieldKey}`, {
          nodeId: `field:${fieldKey}`,
          label: fieldKey,
          key: fieldKey,
          path: formulaPath,
          targetType: field.type as 'NUMBER' | 'CURRENCY',
          scope: 'FIELD',
          ast: parsed.ast,
          dependencies: deps,
        })
      }
    }

    if (field.type === 'TABLE' && field.tableConfig?.columns) {
      const colKeys = new Set(field.tableConfig.columns.map((c) => c.key.trim()))
      field.tableConfig.columns.forEach((column, colIndex) => {
        const colKey = column.key.trim()
        const colFormulaPath = `fields.${index}.tableConfig.columns.${colIndex}.formula`
        if (
          typeof column.formula === 'string' &&
          column.formula.trim() &&
          NUMERIC_TYPES.has(column.type) &&
          !brokenPaths.has(colFormulaPath)
        ) {
          const parsed = parseFormulaExpression(column.formula)
          if (parsed.ast) {
            const deps: string[] = []
            collectQuickDeps(parsed.ast, 'COLUMN', fieldKey, deps, colKeys)
            calcNodes.set(`table:${fieldKey}.col:${colKey}`, {
              nodeId: `table:${fieldKey}.col:${colKey}`,
              label: colKey,
              key: colKey,
              path: colFormulaPath,
              targetType: column.type as 'NUMBER' | 'CURRENCY',
              scope: 'COLUMN',
              tableKey: fieldKey,
              ast: parsed.ast,
              dependencies: deps,
            })
          }
        }
      })
    }
  })

  if (calcNodes.size === 0) {
    return { ...formData }
  }

  const sortedOrder = topologicalSort(calcNodes)
  const nextData: Record<string, unknown> = { ...formData }

  for (const nodeId of sortedOrder) {
    const meta = calcNodes.get(nodeId)
    if (!meta) continue

    if (meta.scope === 'COLUMN' && meta.tableKey) {
      const rawRows = nextData[meta.tableKey]
      if (!Array.isArray(rawRows)) continue
      const tableField = fieldsByKey.get(meta.tableKey)
      const colSet = new Set(tableField?.tableConfig?.columns.map((c) => c.key) ?? [])
      nextData[meta.tableKey] = rawRows.map((row) => {
        if (!isRecord(row)) return row
        const rawVal = evalAst(meta.ast, {
          formData: nextData,
          currentRow: row,
          currentTableColumns: colSet,
        })
        return {
          ...row,
          [meta.key]: normalizeNumericResult(rawVal, meta.targetType),
        }
      })
    } else if (meta.scope === 'FIELD') {
      const rawVal = evalAst(meta.ast, {
        formData: nextData,
      })
      nextData[meta.key] = normalizeNumericResult(rawVal, meta.targetType)
    }
  }

  return nextData
}

function collectQuickDeps(
  node: FormulaAstNode,
  scope: 'FIELD' | 'COLUMN',
  contextTableKey: string,
  deps: string[],
  tableColKeys?: ReadonlySet<string>,
): void {
  if (node.kind === 'NUMBER') return
  if (node.kind === 'UNARY') {
    collectQuickDeps(node.operand, scope, contextTableKey, deps, tableColKeys)
    return
  }
  if (node.kind === 'BINARY') {
    collectQuickDeps(node.left, scope, contextTableKey, deps, tableColKeys)
    collectQuickDeps(node.right, scope, contextTableKey, deps, tableColKeys)
    return
  }
  if (node.kind === 'SUM') {
    deps.push(`table:${node.tableKey}.col:${node.columnKey}`)
    return
  }
  if (node.kind === 'REF') {
    if (scope === 'COLUMN') {
      if (tableColKeys?.has(node.key)) {
        deps.push(`table:${contextTableKey}.col:${node.key}`)
      } else {
        deps.push(`field:${node.key}`)
      }
    } else {
      deps.push(`field:${node.key}`)
    }
  }
}

function topologicalSort(calcNodes: ReadonlyMap<string, CalcNodeMeta>): string[] {
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const order: string[] = []

  function visit(nodeId: string): void {
    if (visited.has(nodeId) || visiting.has(nodeId)) return
    visiting.add(nodeId)
    const meta = calcNodes.get(nodeId)
    if (meta) {
      for (const depId of meta.dependencies) {
        if (calcNodes.has(depId)) {
          visit(depId)
        }
      }
    }
    visiting.delete(nodeId)
    visited.add(nodeId)
    order.push(nodeId)
  }

  for (const nodeId of calcNodes.keys()) {
    visit(nodeId)
  }
  return order
}

function toNumericValue(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val
  if (typeof val === 'string' && val.trim() !== '') {
    const num = Number(val)
    if (Number.isFinite(num)) return num
  }
  return 0
}

function evalAst(
  node: FormulaAstNode,
  ctx: {
    formData: Readonly<Record<string, unknown>>
    currentRow?: Readonly<Record<string, unknown>>
    currentTableColumns?: ReadonlySet<string>
  },
): number {
  if (node.kind === 'NUMBER') return node.value
  if (node.kind === 'UNARY') {
    const val = evalAst(node.operand, ctx)
    return node.operator === '-' ? -val : val
  }
  if (node.kind === 'BINARY') {
    const left = evalAst(node.left, ctx)
    const right = evalAst(node.right, ctx)
    if (node.operator === '+') return left + right
    if (node.operator === '-') return left - right
    if (node.operator === '*') return left * right
    if (node.operator === '/') {
      return right === 0 ? 0 : left / right
    }
    return 0
  }
  if (node.kind === 'REF') {
    if (ctx.currentRow) {
      if (ctx.currentTableColumns?.has(node.key)) {
        return toNumericValue(ctx.currentRow[node.key])
      }
      if (Object.prototype.hasOwnProperty.call(ctx.currentRow, node.key)) {
        return toNumericValue(ctx.currentRow[node.key])
      }
    }
    return toNumericValue(ctx.formData[node.key])
  }
  if (node.kind === 'SUM') {
    const tableVal = ctx.formData[node.tableKey]
    if (!Array.isArray(tableVal)) return 0
    let total = 0
    for (const row of tableVal) {
      if (isRecord(row)) {
        total += toNumericValue(row[node.columnKey])
      }
    }
    return total
  }
  return 0
}

function normalizeNumericResult(raw: number, targetType: 'NUMBER' | 'CURRENCY'): number {
  if (!Number.isFinite(raw)) return 0
  const clamped = Math.max(0, raw)
  if (targetType === 'CURRENCY') {
    return Math.round(clamped)
  }
  return Math.round(clamped * 10000) / 10000
}

export function describeFormulaHumanReadable(
  formula: string | undefined,
  allFields: readonly FormField[],
  currentTableField?: FormField,
): string | undefined {
  if (!formula || !formula.trim()) return undefined
  const parsed = parseFormulaExpression(formula)
  if (parsed.error || !parsed.ast) return undefined

  const fieldsByKey = new Map(allFields.map((f) => [f.key, f]))
  const currentColsByKey = new Map(
    (currentTableField?.tableConfig?.columns ?? []).map((c) => [c.key, c]),
  )

  function render(node: FormulaAstNode, parentPrecedence = 0): string {
    if (node.kind === 'NUMBER') return String(node.value)
    if (node.kind === 'UNARY') {
      return `${node.operator}${render(node.operand, 3)}`
    }
    if (node.kind === 'BINARY') {
      const prec = node.operator === '*' || node.operator === '/' ? 2 : 1
      const opSymbol = node.operator === '*' ? '×' : node.operator === '/' ? '÷' : node.operator
      const leftStr = render(node.left, prec)
      const rightStr = render(node.right, prec + (node.operator === '-' || node.operator === '/' ? 0.5 : 0))
      const combined = `${leftStr} ${opSymbol} ${rightStr}`
      return prec < parentPrecedence ? `(${combined})` : combined
    }
    if (node.kind === 'REF') {
      const col = currentColsByKey.get(node.key)
      if (col) return `[${col.label || node.key}]`
      const field = fieldsByKey.get(node.key)
      if (field) return `[${field.label || node.key}]`
      return `[${node.key}]`
    }
    if (node.kind === 'SUM') {
      const table = fieldsByKey.get(node.tableKey)
      const col = table?.tableConfig?.columns.find((c) => c.key === node.columnKey)
      const tableLabel = table?.label || node.tableKey
      const colLabel = col?.label || node.columnKey
      return `Tổng cột [${tableLabel} → ${colLabel}]`
    }
    return ''
  }

  return `= ${render(parsed.ast)}`
}

export function replaceFieldKeyInFormula(
  formula: string | undefined,
  oldKey: string,
  newKey: string,
): string | undefined {
  if (!formula || oldKey === newKey) return formula
  const escaped = oldKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return formula
    .replace(new RegExp(`\\[\\s*${escaped}\\s*\\]`, 'g'), `[${newKey}]`)
    .replace(new RegExp(`\\b${escaped}\\b`, 'g'), newKey)
}

export function replaceTableColumnKeyInFormula(
  formula: string | undefined,
  tableKey: string,
  oldColKey: string,
  newColKey: string,
): string | undefined {
  if (!formula || oldColKey === newColKey) return formula
  const escapedTable = tableKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const escapedCol = oldColKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return formula.replace(
    new RegExp(`(\\[\\s*${escapedTable}\\s*\\]\\s*\\.\\s*\\[)\\s*${escapedCol}\\s*(\\])`, 'g'),
    `$1${newColKey}$2`,
  )
}

export interface FormulaEditorTag {
  kind: 'FIELD' | 'SUM'
  raw: string
  fieldKey?: string
  tableKey?: string
  columnKey?: string
}

export interface FormulaEditorSlots {
  textSlots: string[]
  tags: FormulaEditorTag[]
}

export function parseFormulaToEditorSlots(formula: string): FormulaEditorSlots {
  if (!formula) {
    return { textSlots: [''], tags: [] }
  }
  const tagPattern =
    /(SUM\s*\(\s*\[\s*([A-Za-z][A-Za-z0-9_]*)\s*\]\s*\.\s*\[\s*([A-Za-z][A-Za-z0-9_]*)\s*\]\s*\))|(\[\s*([A-Za-z][A-Za-z0-9_]*)\s*\])/gi
  const textSlots: string[] = []
  const tags: FormulaEditorTag[] = []
  let lastIndex = 0

  for (const match of formula.matchAll(tagPattern)) {
    const matchIndex = match.index ?? 0
    textSlots.push(formula.slice(lastIndex, matchIndex))
    if (match[1]) {
      const tableKey = match[2]
      const columnKey = match[3]
      tags.push({
        kind: 'SUM',
        raw: `SUM([${tableKey}].[${columnKey}])`,
        tableKey,
        columnKey,
      })
    } else if (match[4]) {
      const fieldKey = match[5]
      tags.push({
        kind: 'FIELD',
        raw: `[${fieldKey}]`,
        fieldKey,
      })
    }
    lastIndex = matchIndex + match[0].length
  }

  textSlots.push(formula.slice(lastIndex))
  return { textSlots, tags }
}

export function buildFormulaFromEditorSlots(
  textSlots: readonly string[],
  tags: readonly FormulaEditorTag[],
): string {
  let out = textSlots[0] ?? ''
  for (let i = 0; i < tags.length; i += 1) {
    out += tags[i].raw + (textSlots[i + 1] ?? '')
  }
  return out
}
