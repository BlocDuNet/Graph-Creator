export const FIELD_TYPES = [
  { id: 'text', label: 'Texte' },
  { id: 'number', label: 'Nombre' },
  { id: 'boolean', label: 'Booleen' },
  { id: 'date', label: 'Date' },
  { id: 'object', label: 'Objet' }
];

const TYPE_ALIASES = {
  string: 'text',
  text: 'text',
  number: 'number',
  int: 'number',
  float: 'number',
  boolean: 'boolean',
  bool: 'boolean',
  date: 'date',
  datetime: 'date',
  object: 'object',
  json: 'object'
};

export function normalizeType(type) {
  const key = String(type || '').trim().toLowerCase();
  return TYPE_ALIASES[key] || 'text';
}

export function toExternalType(type) {
  const normalized = normalizeType(type);
  return normalized === 'text' ? 'string' : normalized;
}

export function fromExternalType(type) {
  return normalizeType(type);
}

export function getDefaultValueForType(_type) {
  return '';
}

export function isEmptyValue(value) {
  return value === null || value === undefined || value === '';
}

function isNumericString(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed === '') return false;
  return !Number.isNaN(Number(trimmed));
}

function isBooleanString(value) {
  if (typeof value !== 'string') return false;
  const v = value.trim().toLowerCase();
  return v === 'true' || v === 'false' || v === '1' || v === '0';
}

function isDateString(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  const t = Date.parse(trimmed);
  return !Number.isNaN(t);
}

export function coerceValueToType(value, type) {
  const t = normalizeType(type);
  if (isEmptyValue(value)) {
    return { value: '', ok: true };
  }

  if (t === 'text') {
    return { value: String(value), ok: true };
  }

  if (t === 'number') {
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return { value, ok: true };
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed === '') return { value: '', ok: true };
      const parsed = Number(trimmed);
      if (!Number.isNaN(parsed)) return { value: parsed, ok: true };
    }
    return { value, ok: false, reason: 'not_number' };
  }

  if (t === 'boolean') {
    if (typeof value === 'boolean') return { value, ok: true };
    if (typeof value === 'number') {
      if (value === 0) return { value: false, ok: true };
      if (value === 1) return { value: true, ok: true };
    }
    if (typeof value === 'string') {
      const v = value.trim().toLowerCase();
      if (v === '') return { value: '', ok: true };
      if (v === 'true' || v === '1') return { value: true, ok: true };
      if (v === 'false' || v === '0') return { value: false, ok: true };
    }
    return { value, ok: false, reason: 'not_boolean' };
  }

  if (t === 'date') {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return { value: value.toISOString().slice(0, 10), ok: true };
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed === '') return { value: '', ok: true };
      const time = Date.parse(trimmed);
      if (!Number.isNaN(time)) {
        return { value: new Date(time).toISOString().slice(0, 10), ok: true };
      }
    }
    return { value, ok: false, reason: 'not_date' };
  }

  if (t === 'object') {
    if (typeof value === 'object') return { value, ok: true };
    return { value, ok: false, reason: 'not_object' };
  }

  return { value, ok: true };
}

export function isValueValid(value, type) {
  if (isEmptyValue(value)) return true;
  return coerceValueToType(value, type).ok;
}

export function formatValueForInput(value, type) {
  const t = normalizeType(type);
  if (isEmptyValue(value)) return '';

  if (t === 'boolean') {
    if (value === true) return 'true';
    if (value === false) return 'false';
    if (typeof value === 'string') {
      const v = value.trim().toLowerCase();
      if (v === 'true' || v === 'false' || v === '1' || v === '0') return v === '1' ? 'true' : v;
    }
    return '';
  }

  if (t === 'date') {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10);
    }
    if (typeof value === 'string') {
      return isDateString(value) ? new Date(Date.parse(value)).toISOString().slice(0, 10) : '';
    }
    return '';
  }

  if (t === 'number') {
    if (typeof value === 'number') return String(value);
    if (typeof value === 'string') return value;
    return '';
  }

  if (t === 'object') {
    if (value && typeof value === 'object') return '[object]';
    return '';
  }

  return String(value);
}

export function inferTypeFromValues(values) {
  const filtered = (values || []).filter(v => !isEmptyValue(v));
  if (!filtered.length) return 'text';

  if (filtered.some(v => v && typeof v === 'object' && !(v instanceof Date))) {
    return 'object';
  }

  if (filtered.every(v => v instanceof Date || isDateString(v))) {
    return 'date';
  }

  if (filtered.every(v => typeof v === 'boolean' || isBooleanString(v) || v === 0 || v === 1)) {
    return 'boolean';
  }

  if (filtered.every(v => typeof v === 'number' || isNumericString(v))) {
    return 'number';
  }

  return 'text';
}

export function getTypeLabel(type) {
  const normalized = normalizeType(type);
  return FIELD_TYPES.find(t => t.id === normalized)?.label || normalized;
}
