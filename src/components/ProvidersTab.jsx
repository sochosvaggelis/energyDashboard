import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { cacheGet, cacheSet, cacheInvalidate } from '../lib/cache'
import EditPanel from './EditPanel'
import './ProvidersTab.css'

const CACHE_KEY = 'admin_providers'

const safeNumber = (val, def = 0) => { const n = Number(val); return isNaN(n) ? def : n }

function sanitizeSvg(svg) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svg, 'image/svg+xml')
  doc.querySelectorAll('script, foreignObject, use[href^="data:"], use[xlink\\:href^="data:"]').forEach(el => el.remove())
  doc.querySelectorAll('*').forEach(el => {
    for (const attr of [...el.attributes]) {
      if (attr.name.startsWith('on') || attr.name === 'href' && attr.value.startsWith('javascript:')) {
        el.removeAttribute(attr.name)
      }
    }
  })
  return new XMLSerializer().serializeToString(doc.documentElement)
}

function svgToDataUri(svg) {
  if (!svg || !svg.trim()) return null
  const trimmed = svg.trim()
  if (trimmed.startsWith('data:')) return trimmed
  const clean = sanitizeSvg(trimmed)
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(clean)))
}

function dataUriToSvg(dataUri) {
  if (!dataUri) return ''
  if (!dataUri.startsWith('data:image/svg+xml;base64,')) return dataUri
  try {
    return decodeURIComponent(escape(atob(dataUri.replace('data:image/svg+xml;base64,', ''))))
  } catch {
    return ''
  }
}

export default function ProvidersTab({ serviceType, refreshKey }) {
  const cacheKey = `${CACHE_KEY}_${serviceType}`

  const [providers, setProviders] = useState(() => cacheGet(cacheKey) ?? [])
  const [loading, setLoading] = useState(() => !cacheGet(cacheKey))
  const [showModal, setShowModal] = useState(false)
  const [editProvider, setEditProvider] = useState(null)
  const [editData, setEditData] = useState({})
  const [form, setForm] = useState({ name: '', adjustment_factor: '', logo_svg: '', has_gas: false })
  const [search, setSearch] = useState('')
  const [error, setError] = useState(null)

  const filtered = providers.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  useEffect(() => {
    fetchProviders(refreshKey > 0)
  }, [serviceType, refreshKey])

  async function fetchProviders(skipCache = false) {
    setLoading(true)
    if (!skipCache) {
      const cached = cacheGet(cacheKey)
      if (cached) { setProviders(cached); setLoading(false); return }
    }

    const { data, error } = await supabase
      .from('providers')
      .select('*')
      .order('created_at', { ascending: true })
    if (error) setError('Προέκυψε σφάλμα. Δοκιμάστε ξανά.')
    else { setProviders(data); cacheSet(cacheKey, data) }
    setLoading(false)
  }

  async function handleAdd(e) {
    e.preventDefault()
    setError(null)
    const { error } = await supabase.from('providers').insert({
      name: form.name,
      adjustment_factor: form.adjustment_factor ? safeNumber(form.adjustment_factor, null) : null,
      logo_url: svgToDataUri(form.logo_svg),
      has_gas: form.has_gas || false,
    })
    if (error) { setError('Προέκυψε σφάλμα. Δοκιμάστε ξανά.'); return }
    setForm({ name: '', adjustment_factor: '', logo_svg: '', has_gas: false })
    setShowModal(false)
    cacheInvalidate(cacheKey, 'admin_plans', `${CACHE_KEY}_gas`, `${CACHE_KEY}_electricity`)
    fetchProviders(true)
  }

  async function toggleGas(provider) {
    setError(null)
    const newVal = !provider.has_gas
    const { error } = await supabase.from('providers').update({ has_gas: newVal }).eq('id', provider.id)
    if (error) { setError('Προέκυψε σφάλμα. Δοκιμάστε ξανά.'); return }
    cacheInvalidate(cacheKey, 'admin_plans', `${CACHE_KEY}_gas`, `${CACHE_KEY}_electricity`)
    fetchProviders(true)
  }

  function openEdit(provider) {
    setEditProvider(provider)
    setEditData({
      name: provider.name,
      adjustment_factor: provider.adjustment_factor ?? '',
      has_gas: provider.has_gas ?? false,
      logo_svg: dataUriToSvg(provider.logo_url),
    })
    setError(null)
  }

  async function saveEdit() {
    setError(null)
    if (!editProvider) return
    const { error } = await supabase.from('providers').update({
      name: editData.name,
      adjustment_factor: editData.adjustment_factor !== '' ? safeNumber(editData.adjustment_factor, null) : null,
      has_gas: editData.has_gas,
      logo_url: svgToDataUri(editData.logo_svg),
    }).eq('id', editProvider.id)
    if (error) { setError('Προέκυψε σφάλμα. Δοκιμάστε ξανά.'); return }
    setEditProvider(null)
    cacheInvalidate(cacheKey, 'admin_plans', `${CACHE_KEY}_gas`, `${CACHE_KEY}_electricity`)
    fetchProviders(true)
  }

  async function handleDelete(id) {
    if (!confirm('Διαγραφή αυτού του provider;')) return
    setError(null)
    const { error } = await supabase.from('providers').delete().eq('id', id)
    if (error) { setError('Προέκυψε σφάλμα. Δοκιμάστε ξανά.'); return }
    cacheInvalidate(cacheKey, 'admin_plans')
    fetchProviders(true)
  }

  return (
    <div className="providers-tab">
      <div className="tab-toolbar">
        <h2>Πάροχοι</h2>
        <div className="toolbar-right">
          <input
            className="search-input"
            type="text"
            placeholder="Αναζήτηση provider..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button className="btn-primary" onClick={() => setShowModal(true)}>+ Νέος Πάροχος</button>
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
                <th>Logo</th>
                <th>Όνομα</th>
                <th>Adjustment Factor</th>

                <th>Αέριο</th>
                <th>Ημ/νία</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className={editProvider?.id === p.id ? 'row-editing' : ''}>
                  <td>
                    {p.logo_url
                      ? <img src={p.logo_url} alt={p.name} className="provider-logo-preview" />
                      : <span className="no-logo">—</span>
                    }
                  </td>
                  <td>{p.name}</td>
                  <td>{p.adjustment_factor ?? '—'}</td>

                  <td className="center-cell">
                    <input type="checkbox" checked={!!p.has_gas} onChange={() => toggleGas(p)} />
                  </td>
                  <td>{new Date(p.created_at).toLocaleDateString('el-GR')}</td>
                  <td className="actions">
                    <button className="btn-edit" onClick={() => openEdit(p)}>Edit</button>
                    <button className="btn-delete" onClick={() => handleDelete(p.id)}>Delete</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan="6" className="empty-row">{search ? 'Κανένα αποτέλεσμα' : 'Δεν υπάρχουν providers'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Provider Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
            <h3>Νέος Πάροχος</h3>
            <form onSubmit={handleAdd}>
              <label>
                Όνομα
                <input
                  required
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label>
                SVG Logo
                <textarea
                  className="svg-textarea"
                  placeholder="Κάντε paste τον SVG κώδικα εδώ (<svg>...</svg>)"
                  value={form.logo_svg}
                  onChange={e => setForm({ ...form, logo_svg: e.target.value })}
                  rows={5}
                />
              </label>
              {form.logo_svg && (
                <div className="logo-preview-box">
                  <span>Preview:</span>
                  <img src={svgToDataUri(form.logo_svg)} alt="preview" className="logo-preview-large" />
                </div>
              )}
              <label>
                Adjustment Factor
                <input
                  type="number"
                  step="any"
                  value={form.adjustment_factor}
                  onChange={e => setForm({ ...form, adjustment_factor: e.target.value })}
                />
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={form.has_gas}
                  onChange={e => setForm({ ...form, has_gas: e.target.checked })}
                />
                Και για Αέριο
              </label>
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Provider Panel */}
      <EditPanel
        isOpen={!!editProvider}
        onClose={() => { setEditProvider(null); setError(null) }}
        title={`Επεξεργασία: ${editProvider?.name || ''}`}
        footer={
          <>
            <button className="btn-cancel" onClick={() => { setEditProvider(null); setError(null) }}>Ακύρωση</button>
            <button className="btn-primary" onClick={saveEdit}>Αποθήκευση</button>
          </>
        }
      >
        {editProvider && (
          <>
            <div className="ep-field">
              <label className="ep-label">Όνομα</label>
              <input
                className="ep-input"
                value={editData.name}
                onChange={e => setEditData({ ...editData, name: e.target.value })}
              />
            </div>

            <div className="ep-field">
              <label className="ep-label">Adjustment Factor</label>
              <input
                className="ep-input"
                type="number"
                step="any"
                value={editData.adjustment_factor}
                onChange={e => setEditData({ ...editData, adjustment_factor: e.target.value })}
              />
            </div>

            <div className="ep-field">
              <label className="ep-checkbox-row">
                <input
                  type="checkbox"
                  checked={editData.has_gas}
                  onChange={e => setEditData({ ...editData, has_gas: e.target.checked })}
                />
                Και για Αέριο
              </label>
            </div>

            <div className="ep-divider" />

            <div className="ep-field">
              <label className="ep-label">SVG Logo</label>
              <textarea
                className="ep-input ep-textarea svg-textarea"
                placeholder="Κάντε paste τον SVG κώδικα (<svg>...</svg>)"
                value={editData.logo_svg}
                onChange={e => setEditData({ ...editData, logo_svg: e.target.value })}
                rows={6}
              />
              {editData.logo_svg && (
                <div className="ep-logo-preview-wrap">
                  <span className="ep-logo-preview-label">Preview:</span>
                  <img src={svgToDataUri(editData.logo_svg)} alt="preview" className="ep-logo-preview" />
                </div>
              )}
            </div>

            {error && <div className="error-msg">{error}</div>}
          </>
        )}
      </EditPanel>
    </div>
  )
}
