function isPositiveInt(n) {
  return Number.isInteger(n) && n > 0;
}

function requireString(name, v, maxLen) {
  if (typeof v !== 'string' || !v.trim()) throw new Error(`${name} is required`);
  const s = v.trim();
  if (maxLen && s.length > maxLen) throw new Error(`${name} too long`);
  return s;
}

function requireOneOf(name, v, allowed) {
  if (!allowed.includes(v)) throw new Error(`${name} must be one of: ${allowed.join(', ')}`);
  return v;
}

function requireArray(name, v, { min = 0, max = Infinity } = {}) {
  if (!Array.isArray(v)) throw new Error(`${name} must be an array`);
  if (v.length < min) throw new Error(`${name} must have at least ${min} items`);
  if (v.length > max) throw new Error(`${name} must have at most ${max} items`);
  return v;
}

module.exports = {
  isPositiveInt,
  requireString,
  requireOneOf,
  requireArray
};
