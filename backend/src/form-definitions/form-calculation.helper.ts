export type FormulaAstNode =
  | { kind: 'NUMBER'; value: number }
  | { kind: 'REF'; key: string; tableKey?: string }
  | { kind: 'SUM'; tableKey: string; columnKey: string }
  | { kind: 'UNARY'; operator: '+' | '-'; operand: FormulaAstNode }
  | { kind: 'BINARY'; operator: '+' | '-' | '*' | '/'; left: FormulaAstNode; right: FormulaAstNode };

export interface FormulaParseResult {
  ast?: FormulaAstNode;
  error?: string;
}

export interface FormulaValidationIssue {
  path: string;
  code: string;
  message: string;
}

interface Token {
  type: 'NUMBER' | 'IDENT' | 'BRACKET' | 'OP' | 'LPAREN' | 'RPAREN' | 'DOT';
  value: string;
  pos: number;
}

const IDENT_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
const NUMERIC_TYPES = new Set(['NUMBER', 'CURRENCY']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function tokenizeFormula(expression: string): { tokens?: Token[]; error?: string } {
  const tokens: Token[] = [];
  let i = 0;
  const len = expression.length;

  while (i < len) {
    const ch = expression[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ type: 'OP', value: ch, pos: i });
      i += 1;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'LPAREN', value: ch, pos: i });
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'RPAREN', value: ch, pos: i });
      i += 1;
      continue;
    }
    if (ch === '.') {
      tokens.push({ type: 'DOT', value: ch, pos: i });
      i += 1;
      continue;
    }
    if (ch === '[') {
      const closeIdx = expression.indexOf(']', i + 1);
      if (closeIdx === -1) {
        return { error: 'Thiếu dấu đóng ngoặc vuông "]" cho mã trường trong công thức.' };
      }
      const inside = expression.slice(i + 1, closeIdx).trim();
      if (!inside) {
        return { error: 'Mã trường trong cặp ngoặc vuông "[]" không được để trống.' };
      }
      if (inside.includes('.')) {
        const parts = inside.split('.').map((p) => p.trim());
        if (parts.length !== 2 || !IDENT_PATTERN.test(parts[0]) || !IDENT_PATTERN.test(parts[1])) {
          return { error: `Tham chiếu "[${inside}]" không đúng định dạng [mã_bảng].[mã_cột].` };
        }
        tokens.push({ type: 'BRACKET', value: parts[0], pos: i });
        tokens.push({ type: 'DOT', value: '.', pos: i });
        tokens.push({ type: 'BRACKET', value: parts[1], pos: i });
      } else {
        if (!IDENT_PATTERN.test(inside)) {
          return { error: `Mã trường "[${inside}]" không hợp lệ.` };
        }
        tokens.push({ type: 'BRACKET', value: inside, pos: i });
      }
      i = closeIdx + 1;
      continue;
    }
    if (/\d/.test(ch)) {
      let numStr = '';
      let hasDot = false;
      const start = i;
      while (i < len && (/\d/.test(expression[i]) || expression[i] === '.')) {
        if (expression[i] === '.') {
          if (hasDot) {
            return { error: `Số "${numStr}." không hợp lệ trong công thức.` };
          }
          hasDot = true;
        }
        numStr += expression[i];
        i += 1;
      }
      const parsed = Number(numStr);
      if (!Number.isFinite(parsed)) {
        return { error: `Giá trị số "${numStr}" không hợp lệ.` };
      }
      tokens.push({ type: 'NUMBER', value: numStr, pos: start });
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let ident = '';
      const start = i;
      while (i < len && /[A-Za-z0-9_]/.test(expression[i])) {
        ident += expression[i];
        i += 1;
      }
      if (!IDENT_PATTERN.test(ident)) {
        return { error: `Từ khóa hoặc mã trường "${ident}" không hợp lệ.` };
      }
      tokens.push({ type: 'IDENT', value: ident, pos: start });
      continue;
    }
    return {
      error: `Ký tự "${ch}" không hợp lệ trong công thức. Chỉ hỗ trợ +, -, *, /, (), [mã_trường] và hàm SUM.`,
    };
  }

  return { tokens };
}

export function parseFormulaExpression(rawExpression: string): FormulaParseResult {
  const trimmed = rawExpression.trim();
  if (!trimmed) {
    return { error: 'Công thức tính toán không được để trống.' };
  }

  const tokenized = tokenizeFormula(trimmed);
  if (tokenized.error || !tokenized.tokens) {
    return { error: tokenized.error ?? 'Công thức không hợp lệ.' };
  }
  const tokens = tokenized.tokens;
  if (tokens.length === 0) {
    return { error: 'Công thức tính toán không được để trống.' };
  }

  let cursor = 0;

  function peek(): Token | undefined {
    return tokens[cursor];
  }

  function consume(): Token {
    const token = tokens[cursor];
    cursor += 1;
    return token;
  }

  function parseExpression(): FormulaParseResult {
    let leftRes = parseTerm();
    if (leftRes.error || !leftRes.ast) return leftRes;
    let left = leftRes.ast;

    while (peek()?.type === 'OP' && (peek()!.value === '+' || peek()!.value === '-')) {
      const op = consume().value as '+' | '-';
      const rightRes = parseTerm();
      if (rightRes.error || !rightRes.ast) return rightRes;
      left = { kind: 'BINARY', operator: op, left, right: rightRes.ast };
    }
    return { ast: left };
  }

  function parseTerm(): FormulaParseResult {
    let leftRes = parseUnary();
    if (leftRes.error || !leftRes.ast) return leftRes;
    let left = leftRes.ast;

    while (peek()?.type === 'OP' && (peek()!.value === '*' || peek()!.value === '/')) {
      const op = consume().value as '*' | '/';
      const rightRes = parseUnary();
      if (rightRes.error || !rightRes.ast) return rightRes;
      left = { kind: 'BINARY', operator: op, left, right: rightRes.ast };
    }
    return { ast: left };
  }

  function parseUnary(): FormulaParseResult {
    if (peek()?.type === 'OP' && (peek()!.value === '+' || peek()!.value === '-')) {
      const op = consume().value as '+' | '-';
      const operandRes = parseUnary();
      if (operandRes.error || !operandRes.ast) return operandRes;
      return { ast: { kind: 'UNARY', operator: op, operand: operandRes.ast } };
    }
    return parsePrimary();
  }

  function parsePrimary(): FormulaParseResult {
    const token = peek();
    if (!token) {
      return { error: 'Cú pháp không hợp lệ.' };
    }

    if (token.type === 'NUMBER') {
      consume();
      return { ast: { kind: 'NUMBER', value: Number(token.value) } };
    }

    if (token.type === 'LPAREN') {
      consume();
      if (peek()?.type === 'RPAREN') {
        return { error: 'Cú pháp không hợp lệ.' };
      }
      const inner = parseExpression();
      if (inner.error || !inner.ast) return inner;
      if (peek()?.type !== 'RPAREN') {
        return { error: 'Cú pháp không hợp lệ (thiếu dấu ")").' };
      }
      consume();
      return inner;
    }

    if (token.type === 'IDENT' && token.value.toUpperCase() === 'SUM') {
      consume();
      if (peek()?.type !== 'LPAREN') {
        return { error: 'Sau hàm SUM phải là dấu mở ngoặc đơn "(". Ví dụ: SUM([mã_bảng].[mã_cột]).' };
      }
      consume();
      const firstToken = peek();
      if (!firstToken || (firstToken.type !== 'BRACKET' && firstToken.type !== 'IDENT')) {
        return { error: 'Hàm SUM cần truyền vào [mã_bảng].[mã_cột]. Ví dụ: SUM([chi_tiet].[thanh_tien]).' };
      }
      const tableKey = consume().value;
      if (peek()?.type !== 'DOT') {
        return {
          error: `Hàm SUM cần chỉ rõ cả mã bảng và mã cột theo cú pháp SUM([${tableKey}].[mã_cột]).`,
        };
      }
      consume();
      const secondToken = peek();
      if (!secondToken || (secondToken.type !== 'BRACKET' && secondToken.type !== 'IDENT')) {
        return { error: `Thiếu mã cột sau dấu chấm trong hàm SUM([${tableKey}].[mã_cột]).` };
      }
      const columnKey = consume().value;
      if (peek()?.type !== 'RPAREN') {
        return { error: `Thiếu dấu đóng ngoặc ")" cho hàm SUM([${tableKey}].[${columnKey}]).` };
      }
      consume();
      return { ast: { kind: 'SUM', tableKey, columnKey } };
    }

    if (token.type === 'IDENT' || token.type === 'BRACKET') {
      const firstKey = consume().value;
      if (token.type === 'IDENT' && peek()?.type === 'LPAREN') {
        return {
          error: `Không hỗ trợ hàm "${firstKey}(...)". Hệ thống chỉ hỗ trợ 4 phép toán (+, -, *, /) và hàm SUM.`,
        };
      }
      if (peek()?.type === 'DOT') {
        consume();
        const second = peek();
        if (!second || (second.type !== 'BRACKET' && second.type !== 'IDENT')) {
          return { error: `Thiếu mã cột sau dấu chấm của "[${firstKey}].".` };
        }
        const secondKey = consume().value;
        return { ast: { kind: 'REF', tableKey: firstKey, key: secondKey } };
      }
      return { ast: { kind: 'REF', key: firstKey } };
    }

    return { error: 'Cú pháp không hợp lệ.' };
  }

  const result = parseExpression();
  if (result.error || !result.ast) return result;
  if (cursor < tokens.length) {
    return {
      error: 'Cú pháp không hợp lệ.',
    };
  }
  return result;
}

interface CalcNodeMeta {
  nodeId: string;
  label: string;
  key: string;
  path: string;
  targetType: 'NUMBER' | 'CURRENCY';
  scope: 'FIELD' | 'COLUMN';
  tableKey?: string;
  ast: FormulaAstNode;
  dependencies: string[];
}

export function validateFormCalculationsAndCycles(fields: readonly unknown[]): FormulaValidationIssue[] {
  const issues: FormulaValidationIssue[] = [];
  const fieldsByKey = new Map<string, { index: number; record: Record<string, unknown> }>();
  const tableColumnsByKey = new Map<
    string,
    Map<string, { colIndex: number; record: Record<string, unknown> }>
  >();

  for (const [index, raw] of fields.entries()) {
    if (!isRecord(raw) || typeof raw.key !== 'string') continue;
    fieldsByKey.set(raw.key, { index, record: raw });
    if (raw.type === 'TABLE' && isRecord(raw.tableConfig) && Array.isArray(raw.tableConfig.columns)) {
      const colMap = new Map<string, { colIndex: number; record: Record<string, unknown> }>();
      for (const [colIndex, colRaw] of raw.tableConfig.columns.entries()) {
        if (isRecord(colRaw) && typeof colRaw.key === 'string') {
          colMap.set(colRaw.key, { colIndex, record: colRaw });
        }
      }
      tableColumnsByKey.set(raw.key, colMap);
    }
  }

  const calcNodes = new Map<string, CalcNodeMeta>();

  function fieldDisplayLabel(record: Record<string, unknown>, fallbackKey: string): string {
    return typeof record.label === 'string' && record.label.trim()
      ? `"${record.label.trim()}" (${fallbackKey})`
      : fallbackKey;
  }

  for (const [index, raw] of fields.entries()) {
    if (!isRecord(raw) || typeof raw.key !== 'string') continue;
    const fieldKey = raw.key;
    const fieldType = typeof raw.type === 'string' ? raw.type : '';
    const formulaPath = `fields.${index}.formula`;

    if (raw.formula !== undefined && raw.formula !== null && raw.formula !== '') {
      if (typeof raw.formula !== 'string') {
        issues.push({
          path: formulaPath,
          code: 'INVALID_FORMULA',
          message: 'Công thức tính toán phải là chuỗi ký tự.',
        });
      } else if (!NUMERIC_TYPES.has(fieldType)) {
        issues.push({
          path: formulaPath,
          code: 'INVALID_FORMULA_TARGET_TYPE',
          message: 'Chỉ trường kiểu Số hoặc Tiền tệ mới được thiết lập công thức tính toán.',
        });
      } else if (isRecord(raw.autoFill)) {
        issues.push({
          path: formulaPath,
          code: 'FORMULA_CONFLICTS_WITH_AUTOFILL',
          message: 'Trường đã cấu hình tự động điền từ hồ sơ không thể gắn thêm công thức tính toán.',
        });
      } else {
        const parsed = parseFormulaExpression(raw.formula);
        if (parsed.error || !parsed.ast) {
          issues.push({
            path: formulaPath,
            code: 'INVALID_FORMULA_SYNTAX',
            message: parsed.error ?? 'Công thức tính toán không hợp lệ.',
          });
        } else {
          const deps: string[] = [];
          const refErrors: FormulaValidationIssue[] = [];
          collectAndValidateFieldDependencies(
            parsed.ast,
            formulaPath,
            fieldsByKey,
            tableColumnsByKey,
            deps,
            refErrors,
          );
          if (refErrors.length > 0) {
            issues.push(...refErrors);
          } else {
            calcNodes.set(`field:${fieldKey}`, {
              nodeId: `field:${fieldKey}`,
              label: `trường ${fieldDisplayLabel(raw, fieldKey)}`,
              key: fieldKey,
              path: formulaPath,
              targetType: fieldType as 'NUMBER' | 'CURRENCY',
              scope: 'FIELD',
              ast: parsed.ast,
              dependencies: [...new Set(deps)],
            });
          }
        }
      }
    }

    if (fieldType === 'TABLE' && isRecord(raw.tableConfig) && Array.isArray(raw.tableConfig.columns)) {
      const colMap = tableColumnsByKey.get(fieldKey) ?? new Map();
      for (const [colIndex, colRaw] of raw.tableConfig.columns.entries()) {
        if (!isRecord(colRaw) || typeof colRaw.key !== 'string') continue;
        const colKey = colRaw.key;
        const colType = typeof colRaw.type === 'string' ? colRaw.type : '';
        const colFormulaPath = `fields.${index}.tableConfig.columns.${colIndex}.formula`;

        if (colRaw.formula === undefined || colRaw.formula === null || colRaw.formula === '') continue;
        if (typeof colRaw.formula !== 'string') {
          issues.push({
            path: colFormulaPath,
            code: 'INVALID_FORMULA',
            message: 'Công thức cột phải là chuỗi ký tự.',
          });
          continue;
        }
        if (!NUMERIC_TYPES.has(colType)) {
          issues.push({
            path: colFormulaPath,
            code: 'INVALID_FORMULA_TARGET_TYPE',
            message: 'Chỉ cột kiểu Số hoặc Tiền tệ mới được thiết lập công thức tính toán.',
          });
          continue;
        }
        const parsed = parseFormulaExpression(colRaw.formula);
        if (parsed.error || !parsed.ast) {
          issues.push({
            path: colFormulaPath,
            code: 'INVALID_FORMULA_SYNTAX',
            message: parsed.error ?? 'Công thức cột không hợp lệ.',
          });
          continue;
        }
        const deps: string[] = [];
        const refErrors: FormulaValidationIssue[] = [];
        collectAndValidateColumnDependencies(
          parsed.ast,
          fieldKey,
          colFormulaPath,
          colMap,
          fieldsByKey,
          deps,
          refErrors,
        );
        if (refErrors.length > 0) {
          issues.push(...refErrors);
        } else {
          calcNodes.set(`table:${fieldKey}.col:${colKey}`, {
            nodeId: `table:${fieldKey}.col:${colKey}`,
            label: `cột ${fieldDisplayLabel(colRaw, colKey)}`,
            key: colKey,
            path: colFormulaPath,
            targetType: colType as 'NUMBER' | 'CURRENCY',
            scope: 'COLUMN',
            tableKey: fieldKey,
            ast: parsed.ast,
            dependencies: [...new Set(deps)],
          });
        }
      }
    }
  }

  detectFormulaCycles(calcNodes, issues);

  return issues;
}

function collectAndValidateFieldDependencies(
  node: FormulaAstNode,
  formulaPath: string,
  fieldsByKey: ReadonlyMap<string, { index: number; record: Record<string, unknown> }>,
  tableColumnsByKey: ReadonlyMap<
    string,
    ReadonlyMap<string, { colIndex: number; record: Record<string, unknown> }>
  >,
  deps: string[],
  errors: FormulaValidationIssue[],
): void {
  if (node.kind === 'NUMBER') return;
  if (node.kind === 'UNARY') {
    collectAndValidateFieldDependencies(
      node.operand,
      formulaPath,
      fieldsByKey,
      tableColumnsByKey,
      deps,
      errors,
    );
    return;
  }
  if (node.kind === 'BINARY') {
    collectAndValidateFieldDependencies(
      node.left,
      formulaPath,
      fieldsByKey,
      tableColumnsByKey,
      deps,
      errors,
    );
    collectAndValidateFieldDependencies(
      node.right,
      formulaPath,
      fieldsByKey,
      tableColumnsByKey,
      deps,
      errors,
    );
    return;
  }
  if (node.kind === 'REF') {
    if (node.tableKey) {
      errors.push({
        path: formulaPath,
        code: 'INVALID_TABLE_COLUMN_DIRECT_REF',
        message: `Không thể gọi trực tiếp "[${node.tableKey}].[${node.key}]" ở trường ngoài bảng. Hãy dùng hàm SUM([${node.tableKey}].[${node.key}]).`,
      });
      return;
    }
    const target = fieldsByKey.get(node.key);
    if (!target) {
      errors.push({
        path: formulaPath,
        code: 'UNKNOWN_FORMULA_FIELD',
        message: `Trường "[${node.key}]" trong công thức không tồn tại trên biểu mẫu.`,
      });
      return;
    }
    const targetType = typeof target.record.type === 'string' ? target.record.type : '';
    if (!NUMERIC_TYPES.has(targetType)) {
      errors.push({
        path: formulaPath,
        code: 'INVALID_FORMULA_FIELD_TYPE',
        message: `Trường "[${node.key}]" không phải kiểu Số hoặc Tiền tệ nên không thể đưa vào công thức tính toán.`,
      });
      return;
    }
    deps.push(`field:${node.key}`);
    return;
  }
  if (node.kind === 'SUM') {
    const tableField = fieldsByKey.get(node.tableKey);
    if (!tableField || tableField.record.type !== 'TABLE') {
      errors.push({
        path: formulaPath,
        code: 'UNKNOWN_FORMULA_TABLE',
        message: `Bảng "[${node.tableKey}]" trong hàm SUM không tồn tại hoặc không phải trường Bảng dữ liệu.`,
      });
      return;
    }
    const colMap = tableColumnsByKey.get(node.tableKey);
    const col = colMap?.get(node.columnKey);
    if (!col) {
      errors.push({
        path: formulaPath,
        code: 'UNKNOWN_FORMULA_TABLE_COLUMN',
        message: `Cột "[${node.columnKey}]" không tồn tại trong bảng "[${node.tableKey}]".`,
      });
      return;
    }
    const colType = typeof col.record.type === 'string' ? col.record.type : '';
    if (!NUMERIC_TYPES.has(colType)) {
      errors.push({
        path: formulaPath,
        code: 'INVALID_FORMULA_TABLE_COLUMN_TYPE',
        message: `Cột "[${node.columnKey}]" trong bảng "[${node.tableKey}]" phải là kiểu Số hoặc Tiền tệ để tính tổng SUM.`,
      });
      return;
    }
    deps.push(`table:${node.tableKey}.col:${node.columnKey}`);
  }
}

function collectAndValidateColumnDependencies(
  node: FormulaAstNode,
  currentTableKey: string,
  formulaPath: string,
  colMap: ReadonlyMap<string, { colIndex: number; record: Record<string, unknown> }>,
  fieldsByKey: ReadonlyMap<string, { index: number; record: Record<string, unknown> }>,
  deps: string[],
  errors: FormulaValidationIssue[],
): void {
  if (node.kind === 'NUMBER') return;
  if (node.kind === 'UNARY') {
    collectAndValidateColumnDependencies(
      node.operand,
      currentTableKey,
      formulaPath,
      colMap,
      fieldsByKey,
      deps,
      errors,
    );
    return;
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
    );
    collectAndValidateColumnDependencies(
      node.right,
      currentTableKey,
      formulaPath,
      colMap,
      fieldsByKey,
      deps,
      errors,
    );
    return;
  }
  if (node.kind === 'SUM') {
    errors.push({
      path: formulaPath,
      code: 'SUM_NOT_ALLOWED_IN_ROW_FORMULA',
      message:
        'Cột trong bảng tính toán theo từng dòng, không sử dụng hàm SUM. Hãy dùng hàm SUM ở trường ngoài bảng.',
    });
    return;
  }
  if (node.kind === 'REF') {
    if (node.tableKey && node.tableKey !== currentTableKey) {
      errors.push({
        path: formulaPath,
        code: 'CROSS_TABLE_ROW_REF_NOT_ALLOWED',
        message: `Công thức dòng của bảng "[${currentTableKey}]" không thể tham chiếu sang bảng khác "[${node.tableKey}]".`,
      });
      return;
    }
    const targetCol = colMap.get(node.key);
    if (targetCol) {
      const colType = typeof targetCol.record.type === 'string' ? targetCol.record.type : '';
      if (!NUMERIC_TYPES.has(colType)) {
        errors.push({
          path: formulaPath,
          code: 'INVALID_FORMULA_COLUMN_TYPE',
          message: `Cột "[${node.key}]" không phải kiểu Số hoặc Tiền tệ nên không thể đưa vào công thức.`,
        });
        return;
      }
      deps.push(`table:${currentTableKey}.col:${node.key}`);
      return;
    }
    if (!node.tableKey) {
      const topField = fieldsByKey.get(node.key);
      if (topField) {
        const topType = typeof topField.record.type === 'string' ? topField.record.type : '';
        if (!NUMERIC_TYPES.has(topType)) {
          errors.push({
            path: formulaPath,
            code: 'INVALID_FORMULA_FIELD_TYPE',
            message: `Trường "[${node.key}]" không phải kiểu Số hoặc Tiền tệ nên không thể đưa vào công thức.`,
          });
          return;
        }
        deps.push(`field:${node.key}`);
        return;
      }
    }
    errors.push({
      path: formulaPath,
      code: 'UNKNOWN_FORMULA_COLUMN',
      message: `Cột "[${node.key}]" trong công thức không tồn tại trong bảng.`,
    });
  }
}

function detectFormulaCycles(
  calcNodes: ReadonlyMap<string, CalcNodeMeta>,
  issues: FormulaValidationIssue[],
): void {
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const reportedPaths = new Set<string>();

  function dfs(nodeId: string, trail: string[]): void {
    if (visiting.has(nodeId)) {
      const cycleStart = trail.indexOf(nodeId);
      const cycleIds = cycleStart >= 0 ? trail.slice(cycleStart) : [nodeId];
      const labels = cycleIds.map((id) => calcNodes.get(id)?.label ?? id);
      const message =
        cycleIds.length === 1
          ? `Công thức của ${labels[0]} không được tự tham chiếu chính nó. Vui lòng kiểm tra lại.`
          : `Công thức bị lặp vòng giữa ${labels.join(' và ')}. Vui lòng kiểm tra lại.`;
      for (const id of cycleIds) {
        const meta = calcNodes.get(id);
        if (meta && !reportedPaths.has(meta.path)) {
          reportedPaths.add(meta.path);
          issues.push({
            path: meta.path,
            code: 'CIRCULAR_FORMULA_DEPENDENCY',
            message,
          });
        }
      }
      return;
    }
    if (visited.has(nodeId)) return;

    visiting.add(nodeId);
    const meta = calcNodes.get(nodeId);
    if (meta) {
      for (const depId of meta.dependencies) {
        if (calcNodes.has(depId)) {
          dfs(depId, [...trail, nodeId]);
        }
      }
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
  }

  for (const nodeId of calcNodes.keys()) {
    if (!visited.has(nodeId)) {
      dfs(nodeId, []);
    }
  }
}

export function evaluateFormCalculations(
  fields: readonly unknown[],
  formData: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const validationIssues = validateFormCalculationsAndCycles(fields);
  const brokenPaths = new Set(validationIssues.map((i) => i.path));

  const fieldsByKey = new Map<string, Record<string, unknown>>();
  const calcNodes = new Map<string, CalcNodeMeta>();

  for (const [index, raw] of fields.entries()) {
    if (!isRecord(raw) || typeof raw.key !== 'string') continue;
    const fieldKey = raw.key;
    fieldsByKey.set(fieldKey, raw);
    const fieldType = typeof raw.type === 'string' ? raw.type : '';
    const formulaPath = `fields.${index}.formula`;

    if (
      typeof raw.formula === 'string' &&
      raw.formula.trim() &&
      NUMERIC_TYPES.has(fieldType) &&
      !brokenPaths.has(formulaPath)
    ) {
      const parsed = parseFormulaExpression(raw.formula);
      if (parsed.ast) {
        const deps: string[] = [];
        collectQuickDeps(parsed.ast, 'FIELD', fieldKey, deps);
        calcNodes.set(`field:${fieldKey}`, {
          nodeId: `field:${fieldKey}`,
          label: fieldKey,
          key: fieldKey,
          path: formulaPath,
          targetType: fieldType as 'NUMBER' | 'CURRENCY',
          scope: 'FIELD',
          ast: parsed.ast,
          dependencies: deps,
        });
      }
    }

    if (fieldType === 'TABLE' && isRecord(raw.tableConfig) && Array.isArray(raw.tableConfig.columns)) {
      const colKeys = new Set<string>();
      for (const colRaw of raw.tableConfig.columns) {
        if (isRecord(colRaw) && typeof colRaw.key === 'string') colKeys.add(colRaw.key);
      }
      for (const [colIndex, colRaw] of raw.tableConfig.columns.entries()) {
        if (!isRecord(colRaw) || typeof colRaw.key !== 'string') continue;
        const colKey = colRaw.key;
        const colType = typeof colRaw.type === 'string' ? colRaw.type : '';
        const colFormulaPath = `fields.${index}.tableConfig.columns.${colIndex}.formula`;
        if (
          typeof colRaw.formula === 'string' &&
          colRaw.formula.trim() &&
          NUMERIC_TYPES.has(colType) &&
          !brokenPaths.has(colFormulaPath)
        ) {
          const parsed = parseFormulaExpression(colRaw.formula);
          if (parsed.ast) {
            const deps: string[] = [];
            collectQuickDeps(parsed.ast, 'COLUMN', fieldKey, deps, colKeys);
            calcNodes.set(`table:${fieldKey}.col:${colKey}`, {
              nodeId: `table:${fieldKey}.col:${colKey}`,
              label: colKey,
              key: colKey,
              path: colFormulaPath,
              targetType: colType as 'NUMBER' | 'CURRENCY',
              scope: 'COLUMN',
              tableKey: fieldKey,
              ast: parsed.ast,
              dependencies: deps,
            });
          }
        }
      }
    }
  }

  if (calcNodes.size === 0) {
    return { ...formData };
  }

  const sortedOrder = topologicalSort(calcNodes);
  const nextData: Record<string, unknown> = { ...formData };

  for (const nodeId of sortedOrder) {
    const meta = calcNodes.get(nodeId);
    if (!meta) continue;

    if (meta.scope === 'COLUMN' && meta.tableKey) {
      const rawRows = nextData[meta.tableKey];
      if (!Array.isArray(rawRows)) continue;
      const tableRecord = fieldsByKey.get(meta.tableKey);
      const colSet = new Set<string>();
      if (
        tableRecord &&
        isRecord(tableRecord.tableConfig) &&
        Array.isArray(tableRecord.tableConfig.columns)
      ) {
        for (const c of tableRecord.tableConfig.columns) {
          if (isRecord(c) && typeof c.key === 'string') colSet.add(c.key);
        }
      }
      nextData[meta.tableKey] = rawRows.map((row) => {
        if (!isRecord(row)) return row;
        const rawVal = evalAst(meta.ast, {
          formData: nextData,
          currentRow: row,
          currentTableColumns: colSet,
        });
        return {
          ...row,
          [meta.key]: normalizeNumericResult(rawVal, meta.targetType),
        };
      });
    } else if (meta.scope === 'FIELD') {
      const rawVal = evalAst(meta.ast, {
        formData: nextData,
      });
      nextData[meta.key] = normalizeNumericResult(rawVal, meta.targetType);
    }
  }

  return nextData;
}

function collectQuickDeps(
  node: FormulaAstNode,
  scope: 'FIELD' | 'COLUMN',
  contextTableKey: string,
  deps: string[],
  tableColKeys?: ReadonlySet<string>,
): void {
  if (node.kind === 'NUMBER') return;
  if (node.kind === 'UNARY') {
    collectQuickDeps(node.operand, scope, contextTableKey, deps, tableColKeys);
    return;
  }
  if (node.kind === 'BINARY') {
    collectQuickDeps(node.left, scope, contextTableKey, deps, tableColKeys);
    collectQuickDeps(node.right, scope, contextTableKey, deps, tableColKeys);
    return;
  }
  if (node.kind === 'SUM') {
    deps.push(`table:${node.tableKey}.col:${node.columnKey}`);
    return;
  }
  if (node.kind === 'REF') {
    if (scope === 'COLUMN') {
      if (tableColKeys?.has(node.key)) {
        deps.push(`table:${contextTableKey}.col:${node.key}`);
      } else {
        deps.push(`field:${node.key}`);
      }
    } else {
      deps.push(`field:${node.key}`);
    }
  }
}

function topologicalSort(calcNodes: ReadonlyMap<string, CalcNodeMeta>): string[] {
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const order: string[] = [];

  function visit(nodeId: string): void {
    if (visited.has(nodeId) || visiting.has(nodeId)) return;
    visiting.add(nodeId);
    const meta = calcNodes.get(nodeId);
    if (meta) {
      for (const depId of meta.dependencies) {
        if (calcNodes.has(depId)) {
          visit(depId);
        }
      }
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    order.push(nodeId);
  }

  for (const nodeId of calcNodes.keys()) {
    visit(nodeId);
  }
  return order;
}

function toNumericValue(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim() !== '') {
    const num = Number(val);
    if (Number.isFinite(num)) return num;
  }
  return 0;
}

function evalAst(
  node: FormulaAstNode,
  ctx: {
    formData: Readonly<Record<string, unknown>>;
    currentRow?: Readonly<Record<string, unknown>>;
    currentTableColumns?: ReadonlySet<string>;
  },
): number {
  if (node.kind === 'NUMBER') return node.value;
  if (node.kind === 'UNARY') {
    const val = evalAst(node.operand, ctx);
    return node.operator === '-' ? -val : val;
  }
  if (node.kind === 'BINARY') {
    const left = evalAst(node.left, ctx);
    const right = evalAst(node.right, ctx);
    if (node.operator === '+') return left + right;
    if (node.operator === '-') return left - right;
    if (node.operator === '*') return left * right;
    if (node.operator === '/') {
      return right === 0 ? 0 : left / right;
    }
    return 0;
  }
  if (node.kind === 'REF') {
    if (ctx.currentRow) {
      if (ctx.currentTableColumns?.has(node.key)) {
        return toNumericValue(ctx.currentRow[node.key]);
      }
      if (Object.prototype.hasOwnProperty.call(ctx.currentRow, node.key)) {
        return toNumericValue(ctx.currentRow[node.key]);
      }
    }
    return toNumericValue(ctx.formData[node.key]);
  }
  if (node.kind === 'SUM') {
    const tableVal = ctx.formData[node.tableKey];
    if (!Array.isArray(tableVal)) return 0;
    let total = 0;
    for (const row of tableVal) {
      if (isRecord(row)) {
        total += toNumericValue(row[node.columnKey]);
      }
    }
    return total;
  }
  return 0;
}

function normalizeNumericResult(raw: number, targetType: 'NUMBER' | 'CURRENCY'): number {
  if (!Number.isFinite(raw)) return 0;
  const clamped = Math.max(0, raw);
  if (targetType === 'CURRENCY') {
    return Math.round(clamped);
  }
  return Math.round(clamped * 10000) / 10000;
}
