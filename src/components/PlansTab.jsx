import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { cacheGet, cacheSet, cacheInvalidate } from '../lib/cache'
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
  tariff_type: TARIFF_TYPES[0]
}

export default function PlansTab({ serviceType }) {
  const [plans, setPlans] = useState([])
  const [providers, setProviders] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editData, setEditData] = useState({})
  const [form, setForm] = useState(emptyForm)
  const [search, setSearch] = useState('')
  const [error, setError] = useState(null)

  const plansCacheKey = `${CACHE_KEY_PLANS}_${serviceType}`
  const providersCacheKey = `${CACHE_KEY_PROVIDERS}_${serviceType}`

  const filtered = plans.filter(p =>
    p.plan_name.toLowerCase().includes(search.toLowerCase()) ||
    (p.providers?.name ?? '').toLowerCase().includes(search.toLowerCase())
  )

  useEffect(() => {
    fetchPlans()
    fetchProviders()
  }, [serviceType])

  async function fetchProviders(skipCache = false) {
    if (!skipCache) {
      const cached = cacheGet(providersCacheKey)
      if (cached) {
        setProviders(cached.map(p => ({ id: p.id, name: p.name })))
        return
      }
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
    // Duplicate check: same name + same provider
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
      service_type: serviceType
    }
    const { error } = await supabase.from('plans').insert(insertData)
    if (error) { setError('Προέκυψε σφάλμα. Δοκιμάστε ξανά.'); return }
    setForm(emptyForm)
    setShowModal(false)
    cacheInvalidate(plansCacheKey)
    fetchPlans(true)
  }

  function startEdit(plan) {
    setEditingId(plan.id)
    setEditData({
      provider_id: plan.provider_id,
      plan_name: plan.plan_name,
      tariff_type: plan.tariff_type
    })
  }

  async function saveEdit(id) {
    setError(null)
    // Duplicate check: same name + same provider (excluding the plan being edited)
    const duplicate = plans.find(
      p => p.id !== id &&
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
        tariff_type: editData.tariff_type
      })
      .eq('id', id)
    if (error) { setError('Προέκυψε σφάλμα. Δοκιμάστε ξανά.'); return }
    setEditingId(null)
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
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id}>
                  <td>
                    {editingId === p.id ? (
                      <select
                        className="inline-input"
                        value={editData.provider_id}
                        onChange={e => setEditData({ ...editData, provider_id: e.target.value })}
                      >
                        {providers.map(prov => (
                          <option key={prov.id} value={prov.id}>{prov.name}</option>
                        ))}
                      </select>
                    ) : (
                      p.providers?.name ?? '—'
                    )}
                  </td>
                  <td>
                    {editingId === p.id ? (
                      <input
                        className="inline-input"
                        value={editData.plan_name}
                        onChange={e => setEditData({ ...editData, plan_name: e.target.value })}
                      />
                    ) : (
                      p.plan_name
                    )}
                  </td>
                  <td>
                    {editingId === p.id ? (
                      <select
                        className="inline-input"
                        value={editData.tariff_type}
                        onChange={e => setEditData({ ...editData, tariff_type: e.target.value })}
                      >
                        {TARIFF_TYPES.map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="tariff-badge">{p.tariff_type}</span>
                    )}
                  </td>
                  <td className="actions">
                    {editingId === p.id ? (
                      <>
                        <button className="btn-save" onClick={() => saveEdit(p.id)}>Save</button>
                        <button className="btn-cancel" onClick={() => setEditingId(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button className="btn-edit" onClick={() => startEdit(p)}>Edit</button>
                        <button className="btn-delete" onClick={() => handleDelete(p.id)}>Delete</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan="4" className="empty-row">{search ? 'Κανένα αποτέλεσμα' : 'Δεν υπάρχουν plans'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

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
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
