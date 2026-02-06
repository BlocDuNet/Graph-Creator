const OPERATORS = {
  or: { prec: 1, type: 'binary', op: 'or' },
  '||': { prec: 1, type: 'binary', op: 'or' },
  and: { prec: 2, type: 'binary', op: 'and' },
  '&&': { prec: 2, type: 'binary', op: 'and' },
  '==': { prec: 3, type: 'binary', op: 'eq' },
  '!=': { prec: 3, type: 'binary', op: 'neq' },
  '>=': { prec: 3, type: 'binary', op: 'gte' },
  '<=': { prec: 3, type: 'binary', op: 'lte' },
  '>': { prec: 3, type: 'binary', op: 'gt' },
  '<': { prec: 3, type: 'binary', op: 'lt' },
  '+': { prec: 4, type: 'binary', op: 'add' },
  '-': { prec: 4, type: 'binary', op: 'sub' },
  '&': { prec: 4, type: 'binary', op: 'concat' },
  '*': { prec: 5, type: 'binary', op: 'mul' },
  '/': { prec: 5, type: 'binary', op: 'div' }
};

function isWhitespace(ch) {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

function isDigit(ch) {
  return ch >= '0' && ch <= '9';
}

function isAlpha(ch) {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
}

function isAlphaNum(ch) {
  return isAlpha(ch) || isDigit(ch);
}

function isSafeIdentifier(name) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

export function tokenize(input) {
  const tokens = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (isWhitespace(ch)) {
      i += 1;
      continue;
    }

    if (isDigit(ch)) {
      let start = i;
      i += 1;
      while (i < input.length && isDigit(input[i])) i += 1;
      if (i < input.length && (input[i] === '.' || input[i] === ',')) {
        const sep = input[i];
        if (i + 1 < input.length && isDigit(input[i + 1])) {
          i += 1;
          while (i < input.length && isDigit(input[i])) i += 1;
          const raw = input.slice(start, i);
          tokens.push({ type: 'number', value: raw, sep });
          continue;
        }
      }
      const raw = input.slice(start, i);
      tokens.push({ type: 'number', value: raw });
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      i += 1;
      let value = '';
      while (i < input.length && input[i] !== quote) {
        if (input[i] === '\\' && i + 1 < input.length) {
          const next = input[i + 1];
          value += next;
          i += 2;
        } else {
          value += input[i];
          i += 1;
        }
      }
      i += 1; // skip closing
      tokens.push({ type: 'string', value });
      continue;
    }

    if (isAlpha(ch)) {
      let start = i;
      i += 1;
      while (i < input.length && isAlphaNum(input[i])) i += 1;
      const word = input.slice(start, i);
      if (word === 'true' || word === 'false') {
        tokens.push({ type: 'boolean', value: word === 'true' });
      } else if (word === 'and' || word === 'or' || word === 'not') {
        tokens.push({ type: 'operator', value: word });
      } else {
        tokens.push({ type: 'identifier', value: word });
      }
      continue;
    }

    const two = input.slice(i, i + 2);
    if (['>=', '<=', '==', '!=', '&&', '||'].includes(two)) {
      tokens.push({ type: 'operator', value: two });
      i += 2;
      continue;
    }

    if (['+', '-', '*', '/', '>', '<', '!', '&'].includes(ch)) {
      tokens.push({ type: 'operator', value: ch });
      i += 1;
      continue;
    }

    if (ch === '(' || ch === ')') {
      tokens.push({ type: 'paren', value: ch });
      i += 1;
      continue;
    }

    if (ch === ',') {
      tokens.push({ type: 'comma' });
      i += 1;
      continue;
    }

    throw new Error(`Caractere invalide: ${ch}`);
  }
  tokens.push({ type: 'eof' });
  return tokens;
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek() {
    return this.tokens[this.pos];
  }

  next() {
    return this.tokens[this.pos++];
  }

  match(type, value = null) {
    const t = this.peek();
    if (!t || t.type !== type) return false;
    if (value != null && t.value !== value) return false;
    this.pos += 1;
    return true;
  }

  parseExpression() {
    return this.parseOr();
  }

  parseOr() {
    let node = this.parseAnd();
    while (true) {
      const t = this.peek();
      if (t.type === 'operator' && (t.value === 'or' || t.value === '||')) {
        this.next();
        node = { type: 'binary', op: 'or', left: node, right: this.parseAnd() };
        continue;
      }
      break;
    }
    return node;
  }

  parseAnd() {
    let node = this.parseComparison();
    while (true) {
      const t = this.peek();
      if (t.type === 'operator' && (t.value === 'and' || t.value === '&&')) {
        this.next();
        node = { type: 'binary', op: 'and', left: node, right: this.parseComparison() };
        continue;
      }
      break;
    }
    return node;
  }

  parseComparison() {
    let node = this.parseAdd();
    while (true) {
      const t = this.peek();
      if (t.type === 'operator' && ['==', '!=', '>=', '<=', '>', '<'].includes(t.value)) {
        const opMap = { '==': 'eq', '!=': 'neq', '>=': 'gte', '<=': 'lte', '>': 'gt', '<': 'lt' };
        const op = opMap[t.value];
        this.next();
        node = { type: 'binary', op, left: node, right: this.parseAdd() };
        continue;
      }
      break;
    }
    return node;
  }

  parseAdd() {
    let node = this.parseMul();
    while (true) {
      const t = this.peek();
      if (t.type === 'operator' && ['+', '-', '&'].includes(t.value)) {
        const opMap = { '+': 'add', '-': 'sub', '&': 'concat' };
        const op = opMap[t.value];
        this.next();
        node = { type: 'binary', op, left: node, right: this.parseMul() };
        continue;
      }
      break;
    }
    return node;
  }

  parseMul() {
    let node = this.parseUnary();
    while (true) {
      const t = this.peek();
      if (t.type === 'operator' && ['*', '/'].includes(t.value)) {
        const opMap = { '*': 'mul', '/': 'div' };
        const op = opMap[t.value];
        this.next();
        node = { type: 'binary', op, left: node, right: this.parseUnary() };
        continue;
      }
      break;
    }
    return node;
  }

  parseUnary() {
    const t = this.peek();
    if (t.type === 'operator' && (t.value === '!' || t.value === 'not')) {
      this.next();
      return { type: 'unary', op: 'not', expr: this.parseUnary() };
    }
    if (t.type === 'operator' && t.value === '-') {
      this.next();
      return { type: 'unary', op: 'neg', expr: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  parsePrimary() {
    const t = this.peek();
    if (t.type === 'number') {
      this.next();
      const raw = t.value;
      let normalized = raw;
      if (raw.includes(',') && raw.includes('.')) {
        normalized = raw.replace(/\./g, '');
      }
      normalized = normalized.replace(',', '.');
      return { type: 'literal', value: Number(normalized), valueType: 'number' };
    }
    if (t.type === 'string') {
      this.next();
      return { type: 'literal', value: t.value, valueType: 'text' };
    }
    if (t.type === 'boolean') {
      this.next();
      return { type: 'literal', value: t.value, valueType: 'boolean' };
    }
    if (t.type === 'identifier') {
      const ident = t.value;
      this.next();
      if (this.match('paren', '(')) {
        const args = [];
        if (!this.match('paren', ')')) {
          do {
            args.push(this.parseExpression());
          } while (this.match('comma'));
          if (!this.match('paren', ')')) {
            throw new Error('Parenthese fermante manquante');
          }
        }
        if (ident === 'field' && args.length === 1 && args[0].type === 'literal') {
          return { type: 'field', name: String(args[0].value) };
        }
        return { type: 'call', name: ident, args };
      }
      return { type: 'field', name: ident };
    }
    if (this.match('paren', '(')) {
      const expr = this.parseExpression();
      if (!this.match('paren', ')')) {
        throw new Error('Parenthese fermante manquante');
      }
      return expr;
    }
    throw new Error('Expression invalide');
  }
}

export function parseExpression(input) {
  const tokens = tokenize(input);
  const parser = new Parser(tokens);
  const ast = parser.parseExpression();
  return ast;
}

function escapeString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function serializeToFunctional(ast) {
  if (!ast) return '';
  switch (ast.type) {
    case 'literal':
      if (ast.valueType === 'text') return `"${escapeString(ast.value)}"`;
      if (ast.valueType === 'boolean') return ast.value ? 'true' : 'false';
      return String(ast.value);
    case 'field':
      return isSafeIdentifier(ast.name) ? ast.name : `field("${escapeString(ast.name)}")`;
    case 'unary':
      if (ast.op === 'not') return `not(${serializeToFunctional(ast.expr)})`;
      if (ast.op === 'neg') return `neg(${serializeToFunctional(ast.expr)})`;
      return `${ast.op}(${serializeToFunctional(ast.expr)})`;
    case 'binary': {
      const opMap = {
        add: 'add',
        sub: 'sub',
        mul: 'mul',
        div: 'div',
        concat: 'concat',
        gt: 'gt',
        gte: 'gte',
        lt: 'lt',
        lte: 'lte',
        eq: 'eq',
        neq: 'neq',
        and: 'and',
        or: 'or'
      };
      const fn = opMap[ast.op] || ast.op;
      return `${fn}(${serializeToFunctional(ast.left)}, ${serializeToFunctional(ast.right)})`;
    }
    case 'call':
      return `${ast.name}(${(ast.args || []).map(serializeToFunctional).join(', ')})`;
    default:
      return '';
  }
}

function toNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value == null) return 0;
  if (typeof value === 'string') {
    let normalized = value.trim();
    if (normalized === '') return 0;
    if (normalized.includes(',') && normalized.includes('.')) {
      normalized = normalized.replace(/\./g, '');
    }
    normalized = normalized.replace(',', '.');
    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true' || v === '1' || v === 'yes' || v === 'oui') return true;
    if (v === 'false' || v === '0' || v === 'no' || v === 'non') return false;
  }
  return !!value;
}

function isEmpty(value) {
  return value === null || value === undefined || value === '';
}

const FUNCTIONS = {
  if: (cond, a, b) => (toBoolean(cond) ? a : b),
  concat: (...args) => args.map(v => (v == null ? '' : String(v))).join(''),
  add: (a, b) => toNumber(a) + toNumber(b),
  sub: (a, b) => toNumber(a) - toNumber(b),
  mul: (a, b) => toNumber(a) * toNumber(b),
  div: (a, b) => {
    const denom = toNumber(b);
    return denom === 0 ? 0 : toNumber(a) / denom;
  },
  gt: (a, b) => toNumber(a) > toNumber(b),
  gte: (a, b) => toNumber(a) >= toNumber(b),
  lt: (a, b) => toNumber(a) < toNumber(b),
  lte: (a, b) => toNumber(a) <= toNumber(b),
  eq: (a, b) => a === b,
  neq: (a, b) => a !== b,
  and: (a, b) => toBoolean(a) && toBoolean(b),
  or: (a, b) => toBoolean(a) || toBoolean(b),
  not: a => !toBoolean(a),
  len: a => (a == null ? 0 : String(a).length),
  upper: a => (a == null ? '' : String(a).toUpperCase()),
  lower: a => (a == null ? '' : String(a).toLowerCase()),
  trim: a => (a == null ? '' : String(a).trim()),
  coalesce: (...args) => args.find(v => !isEmpty(v)) ?? '',
  round: a => Math.round(toNumber(a)),
  min: (a, b) => Math.min(toNumber(a), toNumber(b)),
  max: (a, b) => Math.max(toNumber(a), toNumber(b)),
  toNumber: a => toNumber(a),
  toText: a => (a == null ? '' : String(a)),
  toBool: a => toBoolean(a),
  contains: (a, b) => String(a ?? '').includes(String(b ?? '')),
  startsWith: (a, b) => String(a ?? '').startsWith(String(b ?? '')),
  endsWith: (a, b) => String(a ?? '').endsWith(String(b ?? '')),
  replace: (a, b, c) => String(a ?? '').split(String(b ?? '')).join(String(c ?? ''))
};

export function evaluateExpression(ast, ctx = {}) {
  if (!ast) return '';
  switch (ast.type) {
    case 'literal':
      return ast.value;
    case 'field': {
      const getter = ctx.getField || (() => null);
      return getter(ast.name);
    }
    case 'unary': {
      const v = evaluateExpression(ast.expr, ctx);
      if (ast.op === 'not') return !toBoolean(v);
      if (ast.op === 'neg') return -toNumber(v);
      return v;
    }
    case 'binary': {
      const left = evaluateExpression(ast.left, ctx);
      const right = evaluateExpression(ast.right, ctx);
      const fn = FUNCTIONS[ast.op];
      return fn ? fn(left, right) : '';
    }
    case 'call': {
      if (ast.name === 'field' && ast.args?.length === 1) {
        const arg = evaluateExpression(ast.args[0], ctx);
        const getter = ctx.getField || (() => null);
        return getter(String(arg));
      }
      const fn = FUNCTIONS[ast.name];
      if (!fn) return '';
      const args = (ast.args || []).map(arg => evaluateExpression(arg, ctx));
      return fn(...args);
    }
    default:
      return '';
  }
}

export function inferExpressionType(ast, getFieldType) {
  const errors = [];

  const infer = node => {
    if (!node) return 'text';
    if (node.type === 'literal') return node.valueType || 'text';
    if (node.type === 'field') return getFieldType ? getFieldType(node.name) : 'text';
    if (node.type === 'unary') {
      if (node.op === 'not') return 'boolean';
      if (node.op === 'neg') return 'number';
      return infer(node.expr);
    }
    if (node.type === 'binary') {
      if (['add', 'sub', 'mul', 'div'].includes(node.op)) return 'number';
      if (['gt', 'gte', 'lt', 'lte', 'eq', 'neq'].includes(node.op)) return 'boolean';
      if (['and', 'or'].includes(node.op)) return 'boolean';
      if (node.op === 'concat') return 'text';
      return 'text';
    }
    if (node.type === 'call') {
      const name = node.name;
      if (name === 'if') {
        const t1 = infer(node.args?.[1]);
        const t2 = infer(node.args?.[2]);
        return t1 === t2 ? t1 : 'text';
      }
      if (['add', 'sub', 'mul', 'div', 'len', 'round', 'min', 'max', 'toNumber'].includes(name)) return 'number';
      if (['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'and', 'or', 'not', 'toBool', 'contains', 'startsWith', 'endsWith'].includes(name)) return 'boolean';
      if (['concat', 'upper', 'lower', 'trim', 'toText', 'coalesce', 'replace'].includes(name)) return 'text';
      if (name === 'field') return 'text';
      return 'text';
    }
    return 'text';
  };

  const type = infer(ast);
  return { type, errors };
}
