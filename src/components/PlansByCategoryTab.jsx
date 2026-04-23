import React, { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { cacheGet, cacheSet, cacheInvalidate } from '../lib/cache'
import { computeAutoPrice } from '../lib/formula'
import { logAction } from '../lib/audit'
import EditPanel from './EditPanel'
import './PlansByCategoryTab.css'

const FIELD_LABELS = {
  price_per_kwh: 'Τιμή/kWh',
  night_price_per_kwh: 'Νυχτερινή τιμή/kWh',
  monthly_fee_eur: 'Μηνιαίο πάγιο (€)',
  duration: 'Διάρκεια (μήνες)',
  social_tariff: 'Κοινωνικό τιμολόγιο',
  info_text: 'Κείμενο',
  tea: 'ΤΕΑ',
  ll: 'Ll',
  lu: 'Lu',
  tv: 'Τβ',
  alpha: 'α',
  price_mode: 'Τρόπος τιμολόγησης (ημέρα)',
  night_price_mode: 'Τρόπος τιμολόγησης (νύχτα)',
  pricing_tiers: 'Κλιμάκια',
}

function formatDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('el-GR', { dateStyle: 'short', timeStyle: 'short' })
}

function computePricingDiff(original, editData) {
  const changes = {}

  for (const field of ['price_per_kwh', 'night_price_per_kwh', 'monthly_fee_eur', 'tea', 'll', 'lu', 'tv', 'alpha']) {
    const oldVal = String(original[field] ?? '')
    const newVal = String(editData[field] ?? '')
    if (oldVal !== newVal) {
      changes[field] = { old: oldVal || '—', new: newVal || '—' }
    }
  }

  if (String(original.duration ?? '') !== String(editData.duration ?? '')) {
    changes.duration = { old: original.duration ?? '—', new: editData.duration || '—' }
  }

  if (!!original.social_tariff !== !!editData.social_tariff) {
    changes.social_tariff = { old: original.social_tariff ? 'Ναι' : 'Όχι', new: editData.social_tariff ? 'Ναι' : 'Όχι' }
  }

  const oldInfo = original.info_text ?? ''
  const newInfo = editData.info_text ?? ''
  if (oldInfo !== newInfo) {
    changes.info_text = { old: oldInfo || '—', new: newInfo || '—' }
  }

  const origPriceMode = original.price_formula?.base_type === 'auto' ? 'auto' : 'static'
  if (origPriceMode !== editData.price_mode) {
    changes.price_mode = { old: origPriceMode === 'auto' ? 'Αυτόματο ΤΕΑ' : 'Στατική τιμή', new: editData.price_mode === 'auto' ? 'Αυτόματο ΤΕΑ' : 'Στατική τιμή' }
  }

  const origNightMode = original.night_price_formula?.base_type === 'auto' ? 'auto' : 'static'
  if (origNightMode !== editData.night_price_mode) {
    changes.night_price_mode = { old: origNightMode === 'auto' ? 'Αυτόματο ΤΕΑ' : 'Στατική τιμή', new: editData.night_price_mode === 'auto' ? 'Αυτόματο ΤΕΑ' : 'Στατική τιμή' }
  }

  if (JSON.stringify(original.pricing_tiers ?? []) !== JSON.stringify(serializeTiers(editData.pricing_tiers))) {
    changes.pricing_tiers = { old: '(παλιά κλιμάκια)', new: '(νέα κλιμάκια)' }
  }

  return changes
}

function TruncateCell({ children }) {
  const [tip, setTip] = useState(null)

  const onEnter = useCallback((e) => {
    const el = e.currentTarget
    if (el.scrollWidth <= el.clientWidth) return
    const rect = el.getBoundingClientRect()
    setTip({ text: el.textContent, x: rect.left, y: rect.bottom + 4 })
  }, [])

  const onLeave = useCallback(() => setTip(null), [])

  return (
    <td className="truncate-cell" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      {children}
      {tip && createPortal(
        <div className="instant-tooltip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>,
        document.body
      )}
    </td>
  )
}

const safeNumber = (val, def = 0) => { const n = Number(val); return isNaN(n) ? def : n }

const CACHE_KEY_PLANS = 'admin_plans'
const CACHE_KEY_PROVIDERS = 'admin_providers'

const TARIFF_TYPES = [
  'Σταθερό Τιμολόγιο',
  'Κυμαινόμενο Τιμολόγιο',
  'Ειδικό Τιμολόγιο',
  'Δυναμικό Τιμολόγιο'
]

const emptyTier = { min_kwh: '', max_kwh: '', price_per_kwh: '' }

function TierEditor({ tiers, onChange }) {
  function updateTier(i, field, value) {
    const updated = tiers.map((t, idx) =>
      idx === i ? { ...t, [field]: value } : t
    )
    onChange(updated)
  }

  function addTier() {
    onChange([...tiers, { ...emptyTier }])
  }

  function removeTier(i) {
    onChange(tiers.filter((_, idx) => idx !== i))
  }

  return (
    <div className="tier-editor">
      <div className="tier-header">
        <span className="tier-label">Κλιμάκια τιμολόγησης</span>
        <button type="button" className="btn-tier-add" onClick={addTier}>+ Κλιμάκιο</button>
      </div>
      {tiers.map((tier, i) => (
        <div className="tier-block" key={i}>
          <div className="tier-row">
            <input
              type="number"
              step="any"
              placeholder="Από kWh"
              value={tier.min_kwh}
              onChange={e => updateTier(i, 'min_kwh', e.target.value)}
            />
            <input
              type="number"
              step="any"
              placeholder="Έως kWh"
              value={tier.max_kwh}
              onChange={e => updateTier(i, 'max_kwh', e.target.value)}
            />
            <input
              type="number"
              step="any"
              placeholder="€/kWh"
              value={tier.price_per_kwh}
              onChange={e => updateTier(i, 'price_per_kwh', e.target.value)}
            />
            <button type="button" className="btn-tier-remove" onClick={() => removeTier(i)}>×</button>
          </div>
        </div>
      ))}
      {tiers.length === 0 && (
        <p className="tier-empty">Χωρίς κλιμάκια — χρησιμοποιείται η ενιαία τιμή Price/kWh</p>
      )}
    </div>
  )
}

function formatTiers(tiers) {
  if (!tiers || tiers.length === 0) return '—'
  return tiers.map(t => {
    const max = t.max_kwh != null ? t.max_kwh : '∞'
    return `${t.min_kwh}–${max}: ${t.price_per_kwh}€`
  }).join(', ')
}

function parseTiers(tiers) {
  if (!tiers || !Array.isArray(tiers)) return []
  return tiers.map(t => ({
    min_kwh: t.min_kwh ?? '',
    max_kwh: t.max_kwh ?? '',
    price_per_kwh: t.price_per_kwh ?? ''
  }))
}

function serializeTiers(tiers) {
  return tiers
    .filter(t => t.price_per_kwh !== '')
    .map(t => ({
      min_kwh: t.min_kwh !== '' ? safeNumber(t.min_kwh, 0) : 0,
      max_kwh: t.max_kwh !== '' ? safeNumber(t.max_kwh, null) : null,
      price_per_kwh: t.price_per_kwh !== '' ? safeNumber(t.price_per_kwh, null) : null
    }))
}

function validateTiers(tiers) {
  const errors = []
  const filled = tiers.filter(t => t.price_per_kwh !== '')
  for (let i = 0; i < filled.length; i++) {
    const t = filled[i]
    const min = safeNumber(t.min_kwh, 0)
    const max = t.max_kwh !== '' ? safeNumber(t.max_kwh, null) : null
    const price = safeNumber(t.price_per_kwh, 0)
    if (price < 0) errors.push(`Κλιμάκιο ${i + 1}: η τιμή δεν μπορεί να είναι αρνητική`)
    if (min < 0) errors.push(`Κλιμάκιο ${i + 1}: το min kWh δεν μπορεί να είναι αρνητικό`)
    if (max != null && min >= max) errors.push(`Κλιμάκιο ${i + 1}: το min kWh πρέπει να είναι μικρότερο από το max kWh`)
  }
  const sorted = filled
    .map((t, i) => ({
      idx: i,
      min: safeNumber(t.min_kwh, 0),
      max: t.max_kwh !== '' ? safeNumber(t.max_kwh, null) : null
    }))
    .sort((a, b) => a.min - b.min)
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const curr = sorted[i]
    if (prev.max != null && curr.min < prev.max) {
      errors.push(`Τα κλιμάκια ${prev.idx + 1} και ${curr.idx + 1} αλληλεπικαλύπτονται`)
    }
  }
  return errors
}

function displayPrice(plan, variables) {
  if (plan.price_formula?.base_type === 'auto') {
    const computed = computeAutoPrice(plan, variables)
    return computed != null ? `${computed} (ΤΕΑ)` : '—'
  }
  return plan.price_per_kwh != null ? `${plan.price_per_kwh}` : '—'
}

function displayNightPrice(plan, variables) {
  if (plan.night_price_formula?.base_type === 'auto') {
    const computed = computeAutoPrice(plan, variables)
    return computed != null ? `${computed} (ΤΕΑ)` : '—'
  }
  return plan.night_price_per_kwh != null ? `${plan.night_price_per_kwh}` : '—'
}

const CATEGORY_CLASSES = {
  'Σταθερό Τιμολόγιο': 'cat-fixed',
  'Κυμαινόμενο Τιμολόγιο': 'cat-variable',
  'Ειδικό Τιμολόγιο': 'cat-special',
  'Δυναμικό Τιμολόγιο': 'cat-dynamic'
}

function CategoryTable({ title, plans, providers, variables, onStartEdit, onDelete, editingId, demoMode, demoSessionId }) {
  const [collapsed, setCollapsed] = useState(false)
  const catClass = CATEGORY_CLASSES[title] || ''
  const isVariable = title === 'Κυμαινόμενο Τιμολόγιο'
  const colCount = isVariable ? 14 : 9

  function getVarsForProvider(providerId) {
    const prov = providers.find(p => p.id === providerId)
    return {
      ...variables,
      ...(prov?.adjustment_factor != null ? { adjustment_factor: prov.adjustment_factor } : {})
    }
  }

  return (
    <div className="category-section">
      <button
        className={`category-header ${catClass}${collapsed ? ' collapsed' : ''}`}
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="category-title">
          <span className={`chevron${collapsed ? ' collapsed' : ''}`}>▾</span>
          {title}
        </span>
        <span className="category-count">{plans.length}</span>
      </button>
      {!collapsed && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Plan Name</th>
                <th>Price/kWh</th>
                <th>Night/kWh</th>
                {isVariable && <th>ΤΕΑ</th>}
                {isVariable && <th>Ll</th>}
                {isVariable && <th>Lu</th>}
                {isVariable && <th>Τβ</th>}
                {isVariable && <th>α</th>}
                <th>Κλιμάκια</th>
                <th>Monthly Fee</th>
                <th>Διάρκεια</th>
                <th>Social</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {plans.map(p => (
                <tr key={p.id} className={editingId === p.id ? 'row-editing' : ''}>
                  <TruncateCell>{p.providers?.name ?? '—'}</TruncateCell>
                  <td>{p.plan_name}</td>
                  <td>{displayPrice(p, getVarsForProvider(p.provider_id))}</td>
                  <td>{displayNightPrice(p, getVarsForProvider(p.provider_id))}</td>
                  {isVariable && <td>{p.tea != null ? p.tea : <span className="tea-default">{variables.TEA ?? variables.tea ?? '—'}</span>}</td>}
                  {isVariable && <td>{p.ll != null ? p.ll : '—'}</td>}
                  {isVariable && <td>{p.lu != null ? p.lu : '—'}</td>}
                  {isVariable && <td>{p.tv != null ? p.tv : '—'}</td>}
                  {isVariable && <td>{p.alpha != null ? p.alpha : '—'}</td>}
                  <td className="tiers-cell">{formatTiers(p.pricing_tiers)}</td>
                  <td>{p.monthly_fee_eur != null ? `${p.monthly_fee_eur}€` : '—'}</td>
                  <td>{p.duration || '—'}</td>
                  <td>{p.social_tariff ? 'Yes' : 'No'}</td>
                  <td className="actions">
                    <button
                      className="btn-edit"
                      onClick={() => onStartEdit(p)}
                      disabled={demoMode && !p.demo_session_id}
                      title={demoMode && !p.demo_session_id ? 'Read-only σε Demo Mode' : undefined}
                    >
                      Edit
                    </button>
                    <button
                      className="btn-delete"
                      onClick={() => onDelete(p.id)}
                      disabled={demoMode && !p.demo_session_id}
                      title={demoMode && !p.demo_session_id ? 'Read-only σε Demo Mode' : undefined}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {plans.length === 0 && (
                <tr><td colSpan={colCount} className="empty-row">Δεν υπάρχουν plans σε αυτή την κατηγορία</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function PlansByCategoryTab({ serviceType, refreshKey, demoMode = false, demoSessionId = null, demoExpiresAt = null }) {
  const [plans, setPlans] = useState(() => cacheGet(`${CACHE_KEY_PLANS}_${serviceType}`) ?? [])
  const [providers, setProviders] = useState(() => cacheGet(`${CACHE_KEY_PROVIDERS}_${serviceType}`) ?? [])
  const [variables, setVariables] = useState({})
  const [loading, setLoading] = useState(() => !cacheGet(`${CACHE_KEY_PLANS}_${serviceType}`))
  const [search, setSearch] = useState('')
  const [error, setError] = useState(null)
  const [editPlan, setEditPlan] = useState(null)
  const [editData, setEditData] = useState({})
  const [showInfo, setShowInfo] = useState(false)
  const [activeTab, setActiveTab] = useState('details')
  const [planHistory, setPlanHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)

  useEffect(() => {
    fetchPlans(refreshKey > 0)
    fetchProviders()
    fetchVariables()
  }, [serviceType, refreshKey])

  async function fetchVariables() {
    const { data } = await supabase.from('settings').select('key, value')
    if (data) {
      const vars = {}
      data.forEach(r => { vars[r.key] = r.value })
      setVariables(vars)
    }
  }

  async function fetchProviders() {
    const cacheKey = `${CACHE_KEY_PROVIDERS}_${serviceType}`
    const cached = cacheGet(cacheKey)
    if (cached) {
      setProviders(cached.map(p => ({ id: p.id, name: p.name, adjustment_factor: p.adjustment_factor })))
      return
    }
    const { data: planRows } = await supabase
      .from('plans')
      .select('provider_id')
      .eq('service_type', serviceType)
    const providerIds = [...new Set((planRows || []).map(r => r.provider_id))]
    if (providerIds.length === 0) { setProviders([]); return }
    const { data } = await supabase
      .from('providers')
      .select('id, name, adjustment_factor')
      .in('id', providerIds)
      .order('name')
    if (data) setProviders(data)
  }

  async function fetchPlans(skipCache = false) {
    setLoading(true)
    const cacheKey = `${CACHE_KEY_PLANS}_${serviceType}`
    if (!skipCache && !demoMode) {
      const cached = cacheGet(cacheKey)
      if (cached) { setPlans(cached); setLoading(false); return }
    }
    let query = supabase
      .from('plans')
      .select('*, providers(name)')
      .eq('service_type', serviceType)
      .order('created_at', { ascending: true })
    if (demoMode && demoSessionId) {
      query = query.or(`demo_session_id.is.null,demo_session_id.eq.${demoSessionId}`)
    } else {
      query = query.is('demo_session_id', null)
    }
    const { data, error } = await query
    if (error) setError('Προέκυψε σφάλμα. Δοκιμάστε ξανά.')
    else {
      setPlans(data)
      if (!demoMode) cacheSet(cacheKey, data)
    }
    setLoading(false)
  }

  async function fetchPlanHistory(planId) {
    setHistoryLoading(true)
    const { data: logs } = await supabase
      .from('audit_log')
      .select('*')
      .eq('entity', 'plan')
      .eq('entity_id', planId)
      .order('created_at', { ascending: false })
    if (logs?.length) {
      const userIds = [...new Set(logs.map(l => l.user_id).filter(Boolean))]
      const { data: staffData } = await supabase
        .from('staff')
        .select('user_id, display_name')
        .in('user_id', userIds)
      const nameMap = Object.fromEntries((staffData || []).map(s => [s.user_id, s.display_name]))
      setPlanHistory(logs.map(l => ({ ...l, author: nameMap[l.user_id] || l.user_email || '—' })))
    } else {
      setPlanHistory([])
    }
    setHistoryLoading(false)
  }

  function openEdit(plan) {
    const isVar = plan.tariff_type === 'Κυμαινόμενο Τιμολόγιο'
    setEditPlan(plan)
    setActiveTab('details')
    fetchPlanHistory(plan.id)
    setEditData({
      provider_id: plan.provider_id,
      price_per_kwh: plan.price_per_kwh ?? '',
      price_mode: isVar && plan.price_formula?.base_type === 'auto' ? 'auto' : 'static',
      night_price_per_kwh: plan.night_price_per_kwh ?? '',
      night_price_mode: isVar && plan.night_price_formula?.base_type === 'auto' ? 'auto' : 'static',
      tea: plan.tea ?? '',
      ll: plan.ll ?? '',
      lu: plan.lu ?? '',
      tv: plan.tv ?? '',
      alpha: plan.alpha ?? '',
      monthly_fee_eur: plan.monthly_fee_eur ?? '',
      duration: plan.duration ?? '',
      social_tariff: plan.social_tariff,
      pricing_tiers: parseTiers(plan.pricing_tiers),
      info_text: plan.info_text ?? ''
    })
    setError(null)
  }

  async function saveEdit() {
    setError(null)
    if (!editPlan) return
    if (demoMode && editPlan.demo_session_id !== demoSessionId) {
      setError('Δεν μπορείς να τροποποιήσεις real plans σε demo mode.')
      return
    }
    const teaActive = editData.price_mode === 'auto' || editData.night_price_mode === 'auto'
    if (teaActive) {
      const missing = []
      if (editData.ll === '') missing.push('Ll')
      if (editData.lu === '') missing.push('Lu')
      if (editData.tv === '') missing.push('Τβ')
      if (editData.alpha === '') missing.push('α')
      if (missing.length > 0) {
        setError(`Ο τύπος ΤΕΑ απαιτεί: ${missing.join(', ')}`)
        return
      }
    }
    const tierErrors = validateTiers(editData.pricing_tiers)
    if (tierErrors.length > 0) {
      setError(tierErrors.join('. '))
      return
    }
    const updateData = {
      tea: editData.tea !== '' ? safeNumber(editData.tea, null) : null,
      ll: editData.ll !== '' ? safeNumber(editData.ll, null) : null,
      lu: editData.lu !== '' ? safeNumber(editData.lu, null) : null,
      tv: editData.tv !== '' ? safeNumber(editData.tv, null) : null,
      alpha: editData.alpha !== '' ? safeNumber(editData.alpha, null) : null,
      price_per_kwh: editData.price_per_kwh !== '' ? safeNumber(editData.price_per_kwh, null) : null,
      price_formula: editData.price_mode === 'auto'
        ? { base_type: 'auto', base_value: '', steps: [] }
        : null,
      night_price_per_kwh: editData.night_price_per_kwh !== '' ? safeNumber(editData.night_price_per_kwh, null) : null,
      night_price_formula: editData.night_price_mode === 'auto'
        ? { base_type: 'auto', base_value: '', steps: [] }
        : null,
      monthly_fee_eur: editData.monthly_fee_eur !== '' ? safeNumber(editData.monthly_fee_eur, null) : null,
      duration: editData.duration || null,
      social_tariff: editData.social_tariff,
      pricing_tiers: serializeTiers(editData.pricing_tiers),
      info_text: editData.info_text || null
    }
    const { error } = await supabase.from('plans').update(updateData).eq('id', editPlan.id)
    if (error) { setError('Προέκυψε σφάλμα. Δοκιμάστε ξανά.'); return }
    const changes = computePricingDiff(editPlan, editData)
    if (Object.keys(changes).length > 0) {
      logAction('update_plan', { entity: 'plan', entityId: editPlan.id, details: { action: 'update', changes } })
    }
    setEditPlan(null)
    setActiveTab('details')
    cacheInvalidate(CACHE_KEY_PLANS)
    fetchPlans(true)
  }

  async function handleDelete(id) {
    const plan = plans.find(p => p.id === id)
    if (demoMode && plan?.demo_session_id !== demoSessionId) {
      setError('Δεν μπορείς να διαγράψεις real plans σε demo mode.')
      return
    }
    if (!confirm('Διαγραφή αυτού του plan;')) return
    setError(null)
    const { error } = await supabase.from('plans').delete().eq('id', id)
    if (error) { setError('Προέκυψε σφάλμα. Δοκιμάστε ξανά.'); return }
    cacheInvalidate(CACHE_KEY_PLANS)
    fetchPlans(true)
  }

  const filtered = plans.filter(p =>
    p.plan_name.toLowerCase().includes(search.toLowerCase()) ||
    (p.providers?.name ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const grouped = TARIFF_TYPES.reduce((acc, type) => {
    acc[type] = filtered.filter(p => p.tariff_type === type)
    return acc
  }, {})

  const isVariable = editPlan?.tariff_type === 'Κυμαινόμενο Τιμολόγιο'
  const teaActive = editData.price_mode === 'auto' || editData.night_price_mode === 'auto'
  const globalTea = variables.TEA ?? variables.tea ?? ''

  return (
    <div className="plans-by-category-tab">
      <div className="tab-toolbar">
        <h2>Plans ανά Κατηγορία</h2>
        <div className="toolbar-right">
          <input
            className="search-input"
            type="text"
            placeholder="Αναζήτηση plan ή provider..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {error && <div className="error-msg">{error}</div>}

      <div className="category-layout">
        <div className="category-main">
          {loading ? (
            <p className="loading-text">Φόρτωση...</p>
          ) : (
            <div className="category-list">
              {TARIFF_TYPES.map(type => (
                <CategoryTable
                  key={type}
                  title={type}
                  plans={grouped[type]}
                  providers={providers}
                  variables={variables}
                  onStartEdit={openEdit}
                  onDelete={handleDelete}
                  editingId={editPlan?.id}
                  demoMode={demoMode}
                  demoSessionId={demoSessionId}
                />
              ))}
            </div>
          )}
        </div>

        <button
          className={`info-toggle${showInfo ? ' active' : ''}`}
          onClick={() => setShowInfo(!showInfo)}
          title="Υπόμνημα"
        >
          ?
        </button>
        {showInfo && (
          <aside className="info-panel">
            <h3>Πληροφορίες</h3>

            <section className="info-section">
              <h4>Κυμαινόμενο — Στήλες</h4>
              <dl>
                <dt>Ll</dt><dd>Κάτω όριο ενεργοποίησης</dd>
                <dt>Lu</dt><dd>Άνω όριο ενεργοποίησης</dd>
                <dt>Τβ</dt><dd>Τιμή βάσης</dd>
                <dt>AF</dt><dd>Adjustment Factor</dd>
                <dt>γ</dt><dd>Συντελεστής γ</dd>
                <dt>α</dt><dd>Συντελεστής α</dd>
              </dl>
            </section>

            <section className="info-section">
              <h4>Τύπος ΤΕΑ</h4>
              <p className="formula-display">Τιμή = Τβ + μδ</p>
              <dl>
                <dt>μδ</dt>
                <dd>
                  α × (ΤΕΑ − Ll), αν ΤΕΑ &lt; Ll<br />
                  0, αν Ll ≤ ΤΕΑ ≤ Lu<br />
                  α × (ΤΕΑ − Lu), αν ΤΕΑ &gt; Lu
                </dd>
              </dl>
            </section>
          </aside>
        )}
      </div>

      {/* Edit Plan Panel */}
      <EditPanel
        isOpen={!!editPlan}
        onClose={() => { setEditPlan(null); setError(null); setActiveTab('details') }}
        title={editPlan ? `${editPlan.plan_name}` : ''}
        width="560px"
        footer={activeTab === 'details' ? (
          <>
            <button className="btn-cancel" onClick={() => { setEditPlan(null); setError(null); setActiveTab('details') }}>Ακύρωση</button>
            <button className="btn-primary" onClick={saveEdit}>Αποθήκευση</button>
          </>
        ) : null}
      >
        {editPlan && (
          <>
            <div className="ep-tabs">
              <button
                className={`ep-tab${activeTab === 'details' ? ' active' : ''}`}
                onClick={() => setActiveTab('details')}
              >
                Στοιχεία
              </button>
              <button
                className={`ep-tab${activeTab === 'history' ? ' active' : ''}`}
                onClick={() => setActiveTab('history')}
              >
                <i className="fa-solid fa-clock-rotate-left"></i> Ιστορικό
              </button>
            </div>

            {activeTab === 'history' && (
              <>
                {historyLoading ? (
                  <div className="ep-notes-empty">Φόρτωση...</div>
                ) : planHistory.length === 0 ? (
                  <div className="ep-notes-empty">
                    <i className="fa-solid fa-clock-rotate-left" style={{ fontSize: '1.5rem', marginBottom: '0.5rem', display: 'block' }}></i>
                    Δεν υπάρχει ιστορικό ακόμα
                  </div>
                ) : (
                  <div className="ep-history-timeline">
                    {planHistory.map(entry => (
                      <div key={entry.id} className="ep-history-entry">
                        <div className="ep-history-dot" />
                        <div className="ep-history-content">
                          <div className="ep-history-header">
                            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                              {entry.details?.action === 'create' ? 'Δημιουργήθηκε' : 'Επεξεργάστηκε'}
                            </span>
                            <span className="ep-history-date">{formatDate(entry.created_at)}</span>
                          </div>
                          <div className="ep-history-meta">
                            <i className="fa-solid fa-user" style={{ marginRight: '0.3rem' }}></i>
                            {entry.author}
                          </div>
                          {entry.details?.action === 'update' && entry.details.changes && (
                            <div style={{ marginTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              {Object.entries(entry.details.changes).map(([field, { old: o, new: n }]) => (
                                <div key={field} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                  <span style={{ color: 'var(--text-muted)' }}>{FIELD_LABELS[field] ?? field}:</span>{' '}
                                  <span style={{ color: '#fca5a5' }}>{String(o)}</span>
                                  <i className="fa-solid fa-arrow-right" style={{ margin: '0 0.3rem', fontSize: '0.65rem', color: 'var(--text-muted)' }}></i>
                                  <span style={{ color: 'var(--accent)' }}>{String(n)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {activeTab === 'details' && <>
            <div className="ep-section-title">{editPlan.providers?.name ?? ''} — {editPlan.tariff_type}</div>

            {/* Price / kWh */}
            <div className="ep-field">
              <label className="ep-label">Price / kWh</label>
              {isVariable && editData.price_mode === 'auto' ? (
                <span className="ep-fx-badge">ΤΕΑ (αυτόματο)</span>
              ) : (
                <input
                  className="ep-input"
                  type="number"
                  step="any"
                  value={editData.price_per_kwh}
                  onChange={e => setEditData({ ...editData, price_per_kwh: e.target.value })}
                />
              )}
              {isVariable && (
                <button
                  type="button"
                  className={`ep-mode-toggle${editData.price_mode === 'auto' ? ' active' : ''}`}
                  onClick={() => setEditData({
                    ...editData,
                    price_mode: editData.price_mode === 'auto' ? 'static' : 'auto'
                  })}
                >
                  {editData.price_mode === 'auto' ? '✓ Αυτόματο ΤΕΑ' : 'Χρήση ΤΕΑ'}
                </button>
              )}
            </div>

            {/* Night price / kWh */}
            <div className="ep-field">
              <label className="ep-label">Night Price / kWh</label>
              {isVariable && editData.night_price_mode === 'auto' ? (
                <span className="ep-fx-badge">ΤΕΑ (αυτόματο)</span>
              ) : (
                <input
                  className="ep-input"
                  type="number"
                  step="any"
                  value={editData.night_price_per_kwh}
                  onChange={e => setEditData({ ...editData, night_price_per_kwh: e.target.value })}
                />
              )}
              {isVariable && (
                <button
                  type="button"
                  className={`ep-mode-toggle${editData.night_price_mode === 'auto' ? ' active' : ''}`}
                  onClick={() => setEditData({
                    ...editData,
                    night_price_mode: editData.night_price_mode === 'auto' ? 'static' : 'auto'
                  })}
                >
                  {editData.night_price_mode === 'auto' ? '✓ Αυτόματο ΤΕΑ' : 'Χρήση ΤΕΑ'}
                </button>
              )}
            </div>

            {/* ΤΕΑ fields — only for variable plans */}
            {isVariable && (
              <>
                <div className="ep-divider" />
                <div className="ep-section-title">Μεταβλητές ΤΕΑ</div>

                <div className="ep-grid-2">
                  <div className="ep-field">
                    <label className="ep-label">ΤΕΑ</label>
                    <input
                      className="ep-input"
                      type="number"
                      step="any"
                      value={editData.tea}
                      placeholder={globalTea !== '' ? String(globalTea) : '—'}
                      onChange={e => setEditData({ ...editData, tea: e.target.value })}
                      title={globalTea !== '' ? `Default: ${globalTea}` : 'Ορίστε ΤΕΑ στα Settings'}
                    />
                  </div>
                  <div className="ep-field">
                    <label className="ep-label">Ll {teaActive && <span style={{ color: 'var(--accent)' }}>*</span>}</label>
                    <input
                      className="ep-input"
                      type="number"
                      step="any"
                      value={editData.ll}
                      onChange={e => setEditData({ ...editData, ll: e.target.value })}
                    />
                  </div>
                  <div className="ep-field">
                    <label className="ep-label">Lu {teaActive && <span style={{ color: 'var(--accent)' }}>*</span>}</label>
                    <input
                      className="ep-input"
                      type="number"
                      step="any"
                      value={editData.lu}
                      onChange={e => setEditData({ ...editData, lu: e.target.value })}
                    />
                  </div>
                  <div className="ep-field">
                    <label className="ep-label">Τβ {teaActive && <span style={{ color: 'var(--accent)' }}>*</span>}</label>
                    <input
                      className="ep-input"
                      type="number"
                      step="any"
                      value={editData.tv}
                      onChange={e => setEditData({ ...editData, tv: e.target.value })}
                    />
                  </div>
                  <div className="ep-field">
                    <label className="ep-label">α {teaActive && <span style={{ color: 'var(--accent)' }}>*</span>}</label>
                    <input
                      className="ep-input"
                      type="number"
                      step="any"
                      value={editData.alpha}
                      onChange={e => setEditData({ ...editData, alpha: e.target.value })}
                    />
                  </div>
                </div>
              </>
            )}

            <div className="ep-divider" />

            {/* Tier editor */}
            <TierEditor
              tiers={editData.pricing_tiers}
              onChange={tiers => setEditData({ ...editData, pricing_tiers: tiers })}
            />

            <div className="ep-divider" />

            {/* Other fields */}
            <div className="ep-grid-2">
              <div className="ep-field">
                <label className="ep-label">Monthly Fee (€)</label>
                <input
                  className="ep-input"
                  type="number"
                  step="any"
                  value={editData.monthly_fee_eur}
                  onChange={e => setEditData({ ...editData, monthly_fee_eur: e.target.value })}
                />
              </div>
              <div className="ep-field">
                <label className="ep-label">Διάρκεια (μήνες)</label>
                <input
                  className="ep-input"
                  type="number"
                  min="1"
                  value={editData.duration}
                  onChange={e => setEditData({ ...editData, duration: e.target.value })}
                  placeholder="π.χ. 12"
                />
              </div>
            </div>

            <div className="ep-field">
              <label className="ep-checkbox-row">
                <input
                  type="checkbox"
                  checked={!!editData.social_tariff}
                  onChange={e => setEditData({ ...editData, social_tariff: e.target.checked })}
                />
                Κοινωνικό τιμολόγιο
              </label>
            </div>

            <div className="ep-field">
              <label className="ep-label">Κείμενο Πακέτου</label>
              <textarea
                className="ep-input ep-textarea"
                value={editData.info_text}
                onChange={e => setEditData({ ...editData, info_text: e.target.value })}
                rows={3}
                placeholder="Κείμενο που εμφανίζεται στο frontend..."
              />
            </div>

            {error && <div className="error-msg">{error}</div>}
            </>}
          </>
        )}
      </EditPanel>
    </div>
  )
}
