import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import './StatusSettingsTab.css'

const DEFAULT_STATUSES = ['Νέο', 'Σε επεξεργασία', 'Ολοκληρωμένο', 'Ακυρωμένο']
const SETTINGS_KEY = 'status_options'
const LOCKED_STATUSES_KEY = 'locked_statuses'

export default function StatusSettingsTab({ refreshKey }) {
  const [statuses, setStatuses] = useState([])
  const [lockedStatuses, setLockedStatuses] = useState([]) // status names that trigger lock
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const [newStatus, setNewStatus] = useState('')
  const [editingIdx, setEditingIdx] = useState(null)
  const [editValue, setEditValue] = useState('')

  useEffect(() => { fetchStatuses() }, [refreshKey])

  async function fetchStatuses() {
    setLoading(true)
    const { data } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', [SETTINGS_KEY, LOCKED_STATUSES_KEY])

    const statusRow = data?.find(r => r.key === SETTINGS_KEY)
    const lockedRow = data?.find(r => r.key === LOCKED_STATUSES_KEY)

    if (!statusRow) {
      setStatuses(DEFAULT_STATUSES)
      await saveStatusesToDb(DEFAULT_STATUSES)
    } else {
      try { setStatuses(JSON.parse(statusRow.value)) } catch { setStatuses(DEFAULT_STATUSES) }
    }

    try { setLockedStatuses(lockedRow ? JSON.parse(lockedRow.value) : []) } catch { setLockedStatuses([]) }

    setLoading(false)
  }

  async function saveStatusesToDb(list) {
    setError(null)
    const { error } = await supabase
      .from('settings')
      .upsert({ key: SETTINGS_KEY, value: JSON.stringify(list), updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) { setError('Προέκυψε σφάλμα. Δοκιμάστε ξανά.'); return false }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    return true
  }

  async function saveLockedToDb(list) {
    const { error } = await supabase
      .from('settings')
      .upsert({ key: LOCKED_STATUSES_KEY, value: JSON.stringify(list), updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) { setError('Προέκυψε σφάλμα. Δοκιμάστε ξανά.'); return false }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    return true
  }

  async function toggleLocked(statusName) {
    const isLocked = lockedStatuses.includes(statusName)
    const updated = isLocked
      ? lockedStatuses.filter(s => s !== statusName)
      : [...lockedStatuses, statusName]
    const ok = await saveLockedToDb(updated)
    if (ok) setLockedStatuses(updated)
  }

  // kept for internal use
  async function saveToDb(list) { return saveStatusesToDb(list) }

  async function handleAdd(e) {
    e.preventDefault()
    const trimmed = newStatus.trim()
    if (!trimmed) return
    if (statuses.includes(trimmed)) {
      setError('Αυτό το status υπάρχει ήδη')
      return
    }
    const updated = [...statuses, trimmed]
    const ok = await saveToDb(updated)
    if (ok) {
      setStatuses(updated)
      setNewStatus('')
    }
  }

  async function handleDelete(idx) {
    const name = statuses[idx]
    if (!confirm(`Διαγραφή status "${name}";`)) return
    const updated = statuses.filter((_, i) => i !== idx)
    const ok = await saveToDb(updated)
    if (ok) setStatuses(updated)
  }

  function startEdit(idx) {
    setEditingIdx(idx)
    setEditValue(statuses[idx])
  }

  async function handleEditSave() {
    const trimmed = editValue.trim()
    if (!trimmed) return
    if (statuses.some((s, i) => s === trimmed && i !== editingIdx)) {
      setError('Αυτό το status υπάρχει ήδη')
      return
    }
    const oldName = statuses[editingIdx]
    const updated = statuses.map((s, i) => i === editingIdx ? trimmed : s)
    const ok = await saveToDb(updated)
    if (ok) {
      setStatuses(updated)
      setEditingIdx(null)
      setEditValue('')
      // Rename in existing submissions
      if (oldName !== trimmed) {
        await supabase
          .from('submissions')
          .update({ status: trimmed })
          .eq('status', oldName)
      }
    }
  }

  async function handleMove(idx, dir) {
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= statuses.length) return
    const updated = [...statuses]
    ;[updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]]
    const ok = await saveToDb(updated)
    if (ok) setStatuses(updated)
  }

  if (loading) return <p className="loading-text">Φόρτωση...</p>

  return (
    <div className="sts-tab">
      <div className="sts-header">
        <div>
          <h2>Status Πελατών</h2>
          <p className="sts-subtitle">Διαχείριση των status που εμφανίζονται στο tab Πελάτες.</p>
        </div>
      </div>

      {error && <div className="error-msg">{error}</div>}
      {saved && <div className="sts-saved">Αποθηκεύτηκε</div>}

      <div className="sts-list">
        {statuses.map((s, idx) => {
          const isLocking = lockedStatuses.includes(s)
          return (
          <div className="sts-card" key={`${s}-${idx}`}>
            <div className="sts-card-left">
              <div className="sts-arrows">
                <button
                  className="sts-arrow-btn"
                  onClick={() => handleMove(idx, -1)}
                  disabled={idx === 0}
                  title="Μετακίνηση πάνω"
                >
                  <i className="fa-solid fa-chevron-up"></i>
                </button>
                <button
                  className="sts-arrow-btn"
                  onClick={() => handleMove(idx, 1)}
                  disabled={idx === statuses.length - 1}
                  title="Μετακίνηση κάτω"
                >
                  <i className="fa-solid fa-chevron-down"></i>
                </button>
              </div>
              <span className="sts-order">{idx + 1}.</span>
              {editingIdx === idx ? (
                <input
                  className="sts-edit-input"
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleEditSave()}
                  autoFocus
                />
              ) : (
                <span className="sts-name">{s}</span>
              )}
            </div>
            <div className="sts-card-actions">
              {editingIdx === idx ? (
                <>
                  <button className="btn-save-sm" onClick={handleEditSave}>Αποθήκευση</button>
                  <button className="sts-btn-cancel" onClick={() => setEditingIdx(null)}>Ακύρωση</button>
                </>
              ) : (
                <>
                  <button
                    className={`sts-btn-lock ${isLocking ? 'active' : ''}`}
                    onClick={() => toggleLocked(s)}
                    title={isLocking ? 'Κλειδώνει lead — κάνε κλικ για απενεργοποίηση' : 'Ενεργοποίηση κλειδώματος lead'}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      {isLocking
                        ? <><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>
                        : <><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></>
                      }
                    </svg>
                  </button>
                  <button className="sts-btn-edit" onClick={() => startEdit(idx)}>
                    <i className="fa-solid fa-pen"></i>
                  </button>
                  <button className="sts-btn-delete" onClick={() => handleDelete(idx)}>
                    <i className="fa-solid fa-trash"></i>
                  </button>
                </>
              )}
            </div>
          </div>
          )
        })}
      </div>

      <form className="sts-add-form" onSubmit={handleAdd}>
        <input
          className="sts-add-input"
          placeholder="Νέο status..."
          value={newStatus}
          onChange={e => setNewStatus(e.target.value)}
        />
        <button className="btn-primary" type="submit" disabled={!newStatus.trim()}>
          <i className="fa-solid fa-plus"></i> Προσθήκη
        </button>
      </form>
    </div>
  )
}
