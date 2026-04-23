import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import './SettingsTab.css'

export default function SettingsTab({ refreshKey, demoMode = false }) {
  const [variables, setVariables] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')

  useEffect(() => { fetchVariables() }, [refreshKey])

  async function fetchVariables() {
    setLoading(true)
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .order('key')
    if (error) setError('Προέκυψε σφάλμα. Δοκιμάστε ξανά.')
    else setVariables(data || [])
    setLoading(false)
  }

  async function handleSave(key, value) {
    setError(null)
    setSaved(null)
    const { error } = await supabase
      .from('settings')
      .upsert({
        key,
        value,
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' })
    if (error) { setError('Προέκυψε σφάλμα. Δοκιμάστε ξανά.'); return }
    setSaved(key)
    setTimeout(() => setSaved(null), 2000)
  }

  async function handleAdd(e) {
    e.preventDefault()
    setError(null)
    const trimmedKey = newKey.trim().replace(/\s+/g, '_').toLowerCase()
    if (!trimmedKey) return
    const { error } = await supabase
      .from('settings')
      .insert({ key: trimmedKey, value: newValue })
    if (error) { setError('Προέκυψε σφάλμα. Δοκιμάστε ξανά.'); return }
    setNewKey('')
    setNewValue('')
    setShowAdd(false)
    fetchVariables()
  }

  async function handleDelete(key) {
    if (!confirm(`Διαγραφή μεταβλητής "${key}";`)) return
    setError(null)
    const { error } = await supabase.from('settings').delete().eq('key', key)
    if (error) { setError('Προέκυψε σφάλμα. Δοκιμάστε ξανά.'); return }
    fetchVariables()
  }

  function updateLocal(key, value) {
    setVariables(prev => prev.map(v => v.key === key ? { ...v, value } : v))
  }

  if (loading) return <p className="loading-text">Φόρτωση...</p>

  return (
    <div className="settings-tab">
      {demoMode && (
        <div className="demo-readonly-notice">
          <i className="fa-solid fa-flask-vial"></i>
          Demo Mode — οι αλλαγές εδώ επηρεάζουν την δημόσια σελίδα και δεν επιτρέπονται
        </div>
      )}
      <div className="settings-header">
        <h2>Global Variables</h2>
        {!demoMode && <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Add Global Variable</button>}
      </div>
      <p className="settings-subtitle">
        Μεταβλητές διαθέσιμες στους τύπους υπολογισμού τιμών (formula builder).
      </p>

      {error && <div className="error-msg">{error}</div>}

      <div className="var-list">
        {variables.map(v => (
          <div className="var-card" key={v.key}>
            <div className="var-card-header">
              <span className="var-name">{v.key}</span>
              {!demoMode && <button className="btn-var-delete" onClick={() => handleDelete(v.key)}>Διαγραφή</button>}
            </div>
            <div className="var-card-body">
              <input
                type="number"
                step="any"
                value={v.value}
                onChange={e => updateLocal(v.key, e.target.value)}
              />
              {!demoMode && (
                <button className="btn-save-sm" onClick={() => handleSave(v.key, v.value)}>
                  {saved === v.key ? '✓' : 'Αποθήκευση'}
                </button>
              )}
            </div>
          </div>
        ))}
        {variables.length === 0 && (
          <p className="var-empty">Δεν υπάρχουν μεταβλητές</p>
        )}
      </div>

      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Add Global Variable</h3>
            <form onSubmit={handleAdd}>
              <label>
                Όνομα μεταβλητής
                <input
                  required
                  placeholder="π.χ. wholesale_price"
                  value={newKey}
                  onChange={e => setNewKey(e.target.value)}
                />
              </label>
              <label>
                Τιμή
                <input
                  required
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={newValue}
                  onChange={e => setNewValue(e.target.value)}
                />
              </label>
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowAdd(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
