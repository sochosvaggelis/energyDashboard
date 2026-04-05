import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { logAction } from '../lib/audit'
import './AppSettingsTab.css'

const ALL_TABS = ['Providers', 'Plans', 'Ανά Κατηγορία', 'Πελάτες', 'Settings', 'App Settings']
const ROLE_OPTIONS = ['admin', 'employee']

export default function AppSettingsTab({ user, staffInfo, refreshKey }) {
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  // New user form
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState('employee')
  const [newTabs, setNewTabs] = useState(['Πελάτες'])
  const [creating, setCreating] = useState(false)

  useEffect(() => { fetchStaff() }, [refreshKey])

  async function fetchStaff() {
    setLoading(true)
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .order('created_at', { ascending: true })
    if (error) setError('Αποτυχία φόρτωσης χρηστών.')
    else setStaff(data)
    setLoading(false)
  }

  async function updateStaffField(userId, field, value) {
    setError(null)
    if (staffInfo?.role !== 'admin') {
      setError('Μόνο οι διαχειριστές μπορούν να τροποποιήσουν χρήστες')
      return
    }
    const update = { [field]: value }
    // If role becomes admin, give all tabs
    if (field === 'role' && value === 'admin') {
      update.allowed_tabs = ALL_TABS
    }
    const { error } = await supabase
      .from('staff')
      .update(update)
      .eq('user_id', userId)
    if (error) { setError('Αποτυχία ενημέρωσης. Δοκιμάστε ξανά.'); return }
    logAction('update_staff', { entity: 'staff', entityId: userId, details: update })
    setStaff(prev => prev.map(s =>
      s.user_id === userId ? { ...s, ...update } : s
    ))
  }

  function toggleTab(userId, tab) {
    const member = staff.find(s => s.user_id === userId)
    if (!member || member.role === 'admin') return
    const current = member.allowed_tabs || []
    const updated = current.includes(tab)
      ? current.filter(t => t !== tab)
      : [...current, tab]
    updateStaffField(userId, 'allowed_tabs', updated)
  }

  async function createUser() {
    if (!newEmail || !newPassword || !newName) return
    if (staffInfo?.role !== 'admin') {
      setError('Μόνο οι διαχειριστές μπορούν να δημιουργήσουν χρήστες')
      return
    }
    if (newPassword.length < 8) {
      setError('Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες')
      return
    }
    setCreating(true)
    setError(null)
    setSuccess(null)

    // NOTE: Ideally use Supabase Admin API via Edge Function with service_role key.
    // Ensure "Allow new users to sign up" is DISABLED in Supabase Auth settings
    // so that only this admin flow can create accounts.
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: newEmail,
      password: newPassword,
      options: {
        data: { display_name: newName }
      }
    })

    if (authError) {
      setError('Αποτυχία δημιουργίας χρήστη. Δοκιμάστε ξανά.')
      setCreating(false)
      return
    }

    const userId = authData.user?.id
    if (!userId) {
      setError('Δεν δημιουργήθηκε ο χρήστης')
      setCreating(false)
      return
    }

    // Add staff record
    const tabs = newRole === 'admin' ? ALL_TABS : newTabs
    const { error: staffError } = await supabase
      .from('staff')
      .insert({
        user_id: userId,
        display_name: newName,
        role: newRole,
        allowed_tabs: tabs
      })

    if (staffError) {
      setError('Αποτυχία δημιουργίας εγγραφής staff. Δοκιμάστε ξανά.')
      setCreating(false)
      return
    }

    logAction('create_staff', { entity: 'staff', entityId: userId, details: { name: newName, role: newRole } })
    setSuccess(`Ο χρήστης "${newName}" δημιουργήθηκε`)
    setNewEmail('')
    setNewPassword('')
    setNewName('')
    setNewRole('employee')
    setNewTabs(['Πελάτες'])
    setCreating(false)
    fetchStaff()
  }

  async function removeUser(userId, name) {
    if (staffInfo?.role !== 'admin') {
      setError('Μόνο οι διαχειριστές μπορούν να αφαιρέσουν χρήστες')
      return
    }
    if (user && userId === user.id) {
      setError('Δεν μπορείτε να διαγράψετε τον δικό σας λογαριασμό')
      return
    }
    if (!confirm(`Αφαίρεση χρήστη "${name}" από το staff;`)) return
    setError(null)
    const { error } = await supabase
      .from('staff')
      .delete()
      .eq('user_id', userId)
    if (error) { setError('Αποτυχία διαγραφής. Δοκιμάστε ξανά.'); return }
    logAction('remove_staff', { entity: 'staff', entityId: userId, details: { name } })
    setStaff(prev => prev.filter(s => s.user_id !== userId))
  }

  return (
    <div className="app-settings-tab">
      <h2>App Settings</h2>
      <p className="as-subtitle">Διαχείριση χρηστών και δικαιωμάτων πρόσβασης</p>

      {error && <div className="error-msg">{error}</div>}
      {success && <div className="success-msg">{success}</div>}

      {/* Add new user */}
      <div className="as-card">
        <h3><i className="fa-solid fa-user-plus"></i> Προσθήκη χρήστη</h3>
        <div className="as-form">
          <div className="as-form-row">
            <label className="as-field">
              <span>Όνομα</span>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="π.χ. Γιάννης"
              />
            </label>
            <label className="as-field">
              <span>Email</span>
              <input
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="email@example.com"
              />
            </label>
            <label className="as-field">
              <span>Κωδικός</span>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Τουλάχιστον 8 χαρακτήρες"
                autoComplete="new-password"
              />
            </label>
            <label className="as-field">
              <span>Ρόλος</span>
              <select value={newRole} onChange={e => setNewRole(e.target.value)}>
                {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
          </div>

          {newRole !== 'admin' && (
            <div className="as-tabs-select">
              <span className="as-tabs-label">Tabs πρόσβασης:</span>
              <div className="as-tabs-checks">
                {ALL_TABS.filter(t => t !== 'App Settings').map(tab => (
                  <label key={tab} className="as-check">
                    <input
                      type="checkbox"
                      checked={newTabs.includes(tab)}
                      onChange={() => {
                        setNewTabs(prev =>
                          prev.includes(tab) ? prev.filter(t => t !== tab) : [...prev, tab]
                        )
                      }}
                    />
                    <span>{tab}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <button className="btn-primary" onClick={createUser} disabled={creating || !newEmail || !newPassword || !newName}>
            {creating ? <i className="fa-solid fa-spinner fa-spin"></i> : <><i className="fa-solid fa-plus"></i> Δημιουργία</>}
          </button>
        </div>
      </div>

      {/* Staff list */}
      <div className="as-card">
        <div className="as-card-header">
          <h3><i className="fa-solid fa-users"></i> Χρήστες ({staff.length})</h3>
          <button className="btn-sm" onClick={fetchStaff}>
            <i className="fa-solid fa-rotate-right"></i>
          </button>
        </div>

        {loading ? (
          <p className="loading-text">Φόρτωση...</p>
        ) : staff.length === 0 ? (
          <p className="as-empty">Δεν υπάρχουν χρήστες</p>
        ) : (
          <div className="as-staff-list">
            {staff.map(s => (
              <div key={s.user_id} className="as-staff-item">
                <div className="as-staff-top">
                  <div className="as-staff-info">
                    <span className="as-staff-name">{s.display_name}</span>
                    <select
                      className={`as-role-select ${s.role === 'admin' ? 'role-admin' : 'role-employee'}`}
                      value={s.role}
                      onChange={e => updateStaffField(s.user_id, 'role', e.target.value)}
                    >
                      {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <button
                    className="as-remove-btn"
                    onClick={() => removeUser(s.user_id, s.display_name)}
                    disabled={user && s.user_id === user.id}
                    title={user && s.user_id === user.id ? 'Δεν μπορείτε να διαγράψετε τον εαυτό σας' : 'Αφαίρεση χρήστη'}
                  >
                    <i className="fa-solid fa-trash"></i>
                  </button>
                </div>

                {s.role !== 'admin' && (
                  <div className="as-staff-tabs">
                    {ALL_TABS.filter(t => t !== 'App Settings').map(tab => (
                      <label key={tab} className="as-check as-check-sm">
                        <input
                          type="checkbox"
                          checked={(s.allowed_tabs || []).includes(tab)}
                          onChange={() => toggleTab(s.user_id, tab)}
                        />
                        <span>{tab}</span>
                      </label>
                    ))}
                  </div>
                )}
                {s.role === 'admin' && (
                  <span className="as-all-access">Πρόσβαση σε όλα τα tabs</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
