import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { cacheGet, cacheSet, cacheInvalidate } from '../lib/cache'
import EditPanel from './EditPanel'
import './PlansTab.css'

const CACHE_KEY_PLANS = 'admin_plans'
const CACHE_KEY_PROVIDERS = 'admin_providers'

const TARIFF_TYPES = [
  'Σταθερό Τιμολόγιο',
  'Κυμαινόμενο Τιμολόγιο',
  'Ειδικό Τιμολόγιο',
  'Δυναμικό Τιμολόγιο'
]

const emptyForm = {
  provider_id: '',
  plan_name: '',
  tariff_type: TARIFF_TYPES[0],
  duration: '',
  info_text: ''
}

export default function PlansTab({ serviceType, refreshKey }) {
  const plansCacheKey = `${CACHE_KEY_PLANS}_${serviceType}`
  const providersCacheKey = `${CACHE_KEY_PROVIDERS}_${serviceType}`

  const [plans, setPlans] = useState(() => cacheGet(plansCacheKey) ?? [])
  const [providers, setProviders] = useState([])
  const [loading, setLoading] = useState(() => !cacheGet(plansCacheKey))
  const [showModal, setShowModal] = useState(false)
  const [editPlan, setEditPlan] = useState(null)
  const [editData, setEditData] = useState({})
  const [form, setForm] = useState(emptyForm)
  const [search, setSearch] = useState('')
  const [error, setError] = useState(null)

  const filtered = plans.filter(p =>
    p.plan_name.toLowerCase().includes(search.toLowerCase()) ||
    (p.providers?.name ?? '').toLowerCase().includes(search.toLowerCase())
  )

  useEffect(() => {
    const skip = refreshKey > 0
    fetchPlans(skip)
    fetchProviders(skip)
  }, [serviceType, refreshKey])

  async function fetchProviders(skipCache = false) {
    if (!skipCache) {
      const cached = cacheGet(providersCacheKey)
      if (cached) {
        setProviders(cached.map(p => ({ id: p.id, name: p.name })))
        return
      }
    }
    const { data: planRows } = await supabase
      .from('plans')
      .select('provider_id')
      .eq('service_type', serviceType)
    const providerIds = [...new Set((planRows || []).map(r => r.provider_id))]
    if (providerIds.length === 0) { setProviders([]); return }
    const { data } = await supabase
      .from('providers')
      .select('id, name')
      .in('id', providerIds)
      .order('name')
    if (data) setProviders(data)
  }

  async function fetchPlans(skipCache = false) {
    setLoading(true)
    if (!skipCache) {
      const cached = cacheGet(plansCacheKey)
      if (cached) { setPlans(cached); setLoading(false); return }
    }
    const { data, error } = await supabase
      .from('plans')
      .select('*, providers(name)')
      .eq('service_type', serviceType)
      .order('created_at', { ascending: true })
    if (error) setError('Προέκυψε σφάλμα. Δοκιμάστε ξανά.')
    else { setPlans(data); cacheSet(plansCacheKey, data) }
    setLoading(false)
  }

  async function handleAdd(e) {
    e.preventDefault()
    setError(null)
    const duplicate = plans.find(
      p => p.plan_name.toLowerCase() === form.plan_name.trim().toLowerCase() &&
           p.provider_id === form.provider_id
    )
    if (duplicate) {
      setError('Υπάρχει ήδη πλάνο με αυτό το όνομα για τον ίδιο πάροχο')
      return
    }
    const insertData = {
      provider_id: form.provider_id,
      plan_name: form.plan_name,
      tariff_type: form.tariff_type,
      service_type: serviceType,
      duration: form.duration || null,
      info_text: form.info_text || null
    }
    const { error } = await supabase.from('plans').insert(insertData)
    if (error) { setError('Προέκυψε σφάλμα. Δοκιμάστε ξανά.'); return }
    setForm(emptyForm)
    setShowModal(false)
    cacheInvalidate(plansCacheKey)
    fetchPlans(true)
  }

  function openEdit(plan) {
    setEditPlan(plan)
    setEditData({
      provider_id: plan.provider_id,
      plan_name: plan.plan_name,
      tariff_type: plan.tariff_type,
      duration: plan.duration ?? '',
      info_text: plan.info_text ?? ''
    })
    setError(null)
  }

  async function saveEdit() {
    setError(null)
    if (!editPlan) return
    const duplicate = plans.find(
      p => p.id !== editPlan.id &&
           p.plan_name.toLowerCase() === editData.plan_name.trim().toLowerCase() &&
           p.provider_id === editData.provider_id
    )
    if (duplicate) {
      setError('Υπάρχει ήδη πλάνο με αυτό το όνομα για τον ίδιο πάροχο')
      return
    }
    const { error } = await supabase
      .from('plans')
      .update({
        provider_id: editData.provider_id,
        plan_name: editData.plan_name,
        tariff_type: editData.tariff_type,
        duration: editData.duration || null,
        info_text: editData.info_text || null
      })
      .eq('id', editPlan.id)
    if (error) { setError('Προέκυψε σφάλμα. Δοκιμάστε ξανά.'); return }
    setEditPlan(null)
    cacheInvalidate(plansCacheKey)
    fetchPlans(true)
  }

  async function handleDelete(id) {
    if (!confirm('Διαγραφή αυτού του plan;')) return
    setError(null)
    const { error } = await supabase.from('plans').delete().eq('id', id)
    if (error) { setError('Προέκυψε σφάλμα. Δοκιμάστε ξανά.'); return }
    cacheInvalidate(plansCacheKey)
    fetchPlans(true)
  }

  const serviceLabel = serviceType === 'electricity' ? 'Ρεύματος' : 'Αερίου'

  return (
    <div className="plans-tab">
      <div className="tab-toolbar">
        <h2>Πακέτα {serviceLabel}</h2>
        <div className="toolbar-right">
          <input
            className="search-input"
            type="text"
            placeholder="Αναζήτηση plan ή provider..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button className="btn-primary" onClick={() => setShowModal(true)}>+ Νέο Πακέτο</button>
        </div>
      </div>

      {error && <div className="error-msg">{error}</div>}

      {loading ? (
        <p className="loading-text">Φόρτωση...</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Plan Name</th>
                <th>Tariff Type</th>
                <th>Διάρκεια</th>
                <th>Κείμενο</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className={editPlan?.id === p.id ? 'row-editing' : ''}>
                  <td>{p.providers?.name ?? '—'}</td>
                  <td>{p.plan_name}</td>
                  <td><span className="tariff-badge">{p.tariff_type}</span></td>
                  <td>{p.duration || '—'}</td>
                  <td className="info-text-cell">{p.info_text || '—'}</td>
                  <td className="actions">
                    <button className="btn-edit" onClick={() => openEdit(p)}>Edit</button>
                    <button className="btn-delete" onClick={() => handleDelete(p.id)}>Delete</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan="6" className="empty-row">{search ? 'Κανένα αποτέλεσμα' : 'Δεν υπάρχουν plans'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Plan Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Νέο Πακέτο ({serviceType === 'electricity' ? 'Ρεύμα' : 'Αέριο'})</h3>
            <form onSubmit={handleAdd}>
              <label>
                Provider
                <select
                  required
                  value={form.provider_id}
                  onChange={e => setForm({ ...form, provider_id: e.target.value })}
                >
                  <option value="">-- Επιλογή --</option>
                  {providers.map(prov => (
                    <option key={prov.id} value={prov.id}>{prov.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Plan Name
                <input
                  required
                  value={form.plan_name}
                  onChange={e => setForm({ ...form, plan_name: e.target.value })}
                />
              </label>
              <label>
                Tariff Type
                <select
                  value={form.tariff_type}
                  onChange={e => setForm({ ...form, tariff_type: e.target.value })}
                >
                  {TARIFF_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label>
                Διάρκεια (μήνες)
                <input
                  type="number"
                  min="1"
                  value={form.duration}
                  onChange={e => setForm({ ...form, duration: e.target.value })}
                  placeholder="π.χ. 12"
                />
              </label>
              <label>
                Κείμενο Πακέτου
                <textarea
                  value={form.info_text}
                  onChange={e => setForm({ ...form, info_text: e.target.value })}
                  placeholder="Κείμενο που εμφανίζεται στο frontend..."
                  rows={3}
                />
              </label>
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Plan Panel */}
      <EditPanel
        isOpen={!!editPlan}
        onClose={() => { setEditPlan(null); setError(null) }}
        title={`Επεξεργασία: ${editPlan?.plan_name || ''}`}
        footer={
          <>
            <button className="btn-cancel" onClick={() => { setEditPlan(null); setError(null) }}>Ακύρωση</button>
            <button className="btn-primary" onClick={saveEdit}>Αποθήκευση</button>
          </>
        }
      >
        {editPlan && (
          <>
            <div className="ep-field">
              <label className="ep-label">Provider</label>
              <select
                className="ep-input ep-select"
                value={editData.provider_id}
                onChange={e => setEditData({ ...editData, provider_id: e.target.value })}
              >
                {providers.map(prov => (
                  <option key={prov.id} value={prov.id}>{prov.name}</option>
                ))}
              </select>
            </div>

            <div className="ep-field">
              <label className="ep-label">Plan Name</label>
              <input
                className="ep-input"
                value={editData.plan_name}
                onChange={e => setEditData({ ...editData, plan_name: e.target.value })}
              />
            </div>

            <div className="ep-field">
              <label className="ep-label">Tariff Type</label>
              <select
                className="ep-input ep-select"
                value={editData.tariff_type}
                onChange={e => setEditData({ ...editData, tariff_type: e.target.value })}
              >
                {TARIFF_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
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
          </>
        )}
      </EditPanel>
    </div>
  )
}
