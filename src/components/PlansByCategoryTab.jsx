import React, { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { cacheGet, cacheSet, cacheInvalidate } from '../lib/cache'
import { computeAutoPrice } from '../lib/formula'
import './PlansByCategoryTab.css'

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
    if (price < 0) {
      errors.push(`Κλιμάκιο ${i + 1}: η τιμή δεν μπορεί να είναι αρνητική`)
    }
    if (min < 0) {
      errors.push(`Κλιμάκιο ${i + 1}: το min kWh δεν μπορεί να είναι αρνητικό`)
    }
    if (max != null && min >= max) {
      errors.push(`Κλιμάκιο ${i + 1}: το min kWh πρέπει να είναι μικρότερο από το max kWh`)
    }
  }
  // Check for overlaps between tiers
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

function CategoryTable({ title, plans, providers, variables, editingId, editData, onStartEdit, onSetEditData, onSaveEdit, onCancelEdit, onDelete }) {
  const [collapsed, setCollapsed] = useState(false)
  const catClass = CATEGORY_CLASSES[title] || ''
  const isVariable = title === 'Κυμαινόμενο Τιμολόγιο'
  const colCount = isVariable ? 13 : 8

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
                <th>Social</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {plans.map(p => (
                <React.Fragment key={p.id}>
                  <tr>
                    {editingId === p.id ? (
                      <>
                        <TruncateCell>{p.providers?.name ?? '—'}</TruncateCell>
                        <td>{p.plan_name}</td>
                        <td>
                          <div className="price-edit-cell">
                            {isVariable ? (
                              <>
                                {editData.price_mode !== 'auto' && (
                                  <input
                                    className="inline-input"
                                    type="number"
                                    step="any"
                                    value={editData.price_per_kwh}
                                    onChange={e => onSetEditData({ ...editData, price_per_kwh: e.target.value })}
                                  />
                                )}
                                {editData.price_mode === 'auto' && (
                                  <span className="fx-badge">ΤΕΑ</span>
                                )}
                                <button
                                  type="button"
                                  className={`btn-mode-toggle${editData.price_mode === 'auto' ? ' active' : ''}`}
                                  onClick={() => onSetEditData({
                                    ...editData,
                                    price_mode: editData.price_mode === 'auto' ? 'static' : 'auto'
                                  })}
                                  title="Εναλλαγή σταθερή/αυτόματη ΤΕΑ"
                                >
                                  ΤΕΑ
                                </button>
                              </>
                            ) : (
                              <input
                                className="inline-input"
                                type="number"
                                step="any"
                                value={editData.price_per_kwh}
                                onChange={e => onSetEditData({ ...editData, price_per_kwh: e.target.value })}
                              />
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="price-edit-cell">
                            {isVariable ? (
                              <>
                                {editData.night_price_mode !== 'auto' && (
                                  <input
                                    className="inline-input"
                                    type="number"
                                    step="any"
                                    value={editData.night_price_per_kwh}
                                    onChange={e => onSetEditData({ ...editData, night_price_per_kwh: e.target.value })}
                                  />
                                )}
                                {editData.night_price_mode === 'auto' && (
                                  <span className="fx-badge">ΤΕΑ</span>
                                )}
                                <button
                                  type="button"
                                  className={`btn-mode-toggle${editData.night_price_mode === 'auto' ? ' active' : ''}`}
                                  onClick={() => onSetEditData({
                                    ...editData,
                                    night_price_mode: editData.night_price_mode === 'auto' ? 'static' : 'auto'
                                  })}
                                  title="Εναλλαγή σταθερή/αυτόματη ΤΕΑ"
                                >
                                  ΤΕΑ
                                </button>
                              </>
                            ) : (
                              <input
                                className="inline-input"
                                type="number"
                                step="any"
                                value={editData.night_price_per_kwh}
                                onChange={e => onSetEditData({ ...editData, night_price_per_kwh: e.target.value })}
                              />
                            )}
                          </div>
                        </td>
                        {isVariable && (() => {
                          const teaReq = editData.price_mode === 'auto' || editData.night_price_mode === 'auto'
                          const globalTea = variables.TEA ?? variables.tea ?? ''
                          return (<>
                            <td>
                              <input
                                className="inline-input"
                                type="number"
                                step="any"
                                value={editData.tea}
                                placeholder={globalTea !== '' ? globalTea : '—'}
                                onChange={e => onSetEditData({ ...editData, tea: e.target.value })}
                                title={globalTea !== '' ? `Default: ${globalTea}` : 'Ορίστε ΤΕΑ στα Settings'}
                              />
                            </td>
                            <td>
                              <input
                                className={`inline-input${teaReq ? ' tea-required' : ''}`}
                                type="number"
                                step="any"
                                value={editData.ll}
                                onChange={e => onSetEditData({ ...editData, ll: e.target.value })}
                                required={teaReq}
                              />
                            </td>
                            <td>
                              <input
                                className={`inline-input${teaReq ? ' tea-required' : ''}`}
                                type="number"
                                step="any"
                                value={editData.lu}
                                onChange={e => onSetEditData({ ...editData, lu: e.target.value })}
                                required={teaReq}
                              />
                            </td>
                            <td>
                              <input
                                className={`inline-input${teaReq ? ' tea-required' : ''}`}
                                type="number"
                                step="any"
                                value={editData.tv}
                                onChange={e => onSetEditData({ ...editData, tv: e.target.value })}
                                required={teaReq}
                              />
                            </td>
                            <td>
                              <input
                                className={`inline-input${teaReq ? ' tea-required' : ''}`}
                                type="number"
                                step="any"
                                value={editData.alpha}
                                onChange={e => onSetEditData({ ...editData, alpha: e.target.value })}
                                required={teaReq}
                              />
                            </td>
                          </>)
                        })()}
                        <td className="tiers-cell">{formatTiers(editData.pricing_tiers)}</td>
                        <td>
                          <input
                            className="inline-input"
                            type="number"
                            step="any"
                            value={editData.monthly_fee_eur}
                            onChange={e => onSetEditData({ ...editData, monthly_fee_eur: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            checked={editData.social_tariff}
                            onChange={e => onSetEditData({ ...editData, social_tariff: e.target.checked })}
                          />
                        </td>
                        <td className="actions">
                          <button className="btn-save" onClick={() => onSaveEdit(p.id)}>Save</button>
                          <button className="btn-cancel" onClick={onCancelEdit}>Cancel</button>
                        </td>
                      </>
                    ) : (
                      <>
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
                        <td>{p.social_tariff ? 'Yes' : 'No'}</td>
                        <td className="actions">
                          <button className="btn-edit" onClick={() => onStartEdit(p)}>Edit</button>
                          <button className="btn-delete" onClick={() => onDelete(p.id)}>Delete</button>
                        </td>
                      </>
                    )}
                  </tr>
                  {editingId === p.id && (
                    <tr className="tier-edit-row">
                      <td colSpan={colCount}>
                        <TierEditor
                          tiers={editData.pricing_tiers}
                          onChange={tiers => onSetEditData({ ...editData, pricing_tiers: tiers })}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
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

export default function PlansByCategoryTab({ serviceType, refreshKey }) {
  const [plans, setPlans] = useState([])
  const [providers, setProviders] = useState([])
  const [variables, setVariables] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [error, setError] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editData, setEditData] = useState({})
  const [showInfo, setShowInfo] = useState(false)

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
    // Get provider IDs that have at least one plan for this service type
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
    if (!skipCache) {
      const cached = cacheGet(cacheKey)
      if (cached) { setPlans(cached); setLoading(false); return }
    }
    const { data, error } = await supabase
      .from('plans')
      .select('*, providers(name)')
      .eq('service_type', serviceType)
      .order('created_at', { ascending: true })
    if (error) setError('Προέκυψε σφάλμα. Δοκιμάστε ξανά.')
    else { setPlans(data); cacheSet(cacheKey, data) }
    setLoading(false)
  }

  function startEdit(plan) {
    const isVar = plan.tariff_type === 'Κυμαινόμενο Τιμολόγιο'
    setEditingId(plan.id)
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
      social_tariff: plan.social_tariff,
      pricing_tiers: parseTiers(plan.pricing_tiers)
    })
  }

  async function saveEdit(id) {
    setError(null)
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
    // Tier validation
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
      social_tariff: editData.social_tariff,
      pricing_tiers: serializeTiers(editData.pricing_tiers)
    }
    const { error } = await supabase.from('plans').update(updateData).eq('id', id)
    if (error) { setError('Προέκυψε σφάλμα. Δοκιμάστε ξανά.'); return }
    setEditingId(null)
    cacheInvalidate(CACHE_KEY_PLANS)
    fetchPlans(true)
  }

  async function handleDelete(id) {
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
                  editingId={editingId}
                  editData={editData}
                  onStartEdit={startEdit}
                  onSetEditData={setEditData}
                  onSaveEdit={saveEdit}
                  onCancelEdit={() => { setEditingId(null); setError(null) }}
                  onDelete={handleDelete}
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
    </div>
  )
}
