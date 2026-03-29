/**
 * Formula shape:
 * {
 *   base_type: "variable" | "number",
 *   base_value: "wholesale_price" | 0.05,
 *   steps: [
 *     { op: "+"|"-"|"*"|"/", val_type: "number"|"variable", val: 1.2 | "adjustment_factor" }
 *   ]
 * }
 */

function resolveValue(type, val, variables) {
  if (type === 'variable') return Number(variables[val] ?? 0)
  return Number(val ?? 0)
}

function formatValue(type, val, variables) {
  if (type === 'variable') {
    const resolved = variables[val]
    return resolved != null ? `${val}(${resolved})` : val
  }
  return val != null && val !== '' ? String(val) : '?'
}

export function evaluateFormula(formula, variables = {}) {
  if (!formula) return null

  let result = resolveValue(formula.base_type, formula.base_value, variables)

  for (const step of formula.steps || []) {
    const val = resolveValue(step.val_type || 'number', step.val, variables)
    switch (step.op) {
      case '+': result += val; break
      case '-': result -= val; break
      case '*': result *= val; break
      case '/': result = val !== 0 ? result / val : result; break
    }
  }

  return Math.round(result * 100000) / 100000
}

export function computeAutoPrice(plan, variables, { night = false } = {}) {
  const tea = Number(variables.TEA ?? variables.tea ?? 0)
  const tv = Number((night ? (plan.night_tv ?? plan.tv) : plan.tv) ?? 0)
  const ll = Number((night ? (plan.night_ll ?? plan.ll) : plan.ll) ?? 0)
  const lu = Number((night ? (plan.night_lu ?? plan.lu) : plan.lu) ?? 0)
  const alpha = Number((night ? (plan.night_alpha ?? plan.alpha) : plan.alpha) ?? 0)

  let md = 0
  if (tea < ll) {
    md = alpha * (tea - ll)
  } else if (tea > lu) {
    md = alpha * (tea - lu)
  }

  return Math.round((tv + md) * 100000) / 100000
}

export function formulaToDisplayParts(formula, variables = {}) {
  if (!formula) return { text: '', result: null }

  const parts = [formatValue(formula.base_type, formula.base_value, variables)]

  for (const step of formula.steps || []) {
    const opSymbol = { '+': '+', '-': '−', '*': '×', '/': '÷' }[step.op] || step.op
    parts.push(opSymbol)
    parts.push(formatValue(step.val_type || 'number', step.val, variables))
  }

  const result = evaluateFormula(formula, variables)
  return { text: parts.join(' '), result }
}
