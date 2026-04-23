import { useState } from 'react'
import { supabase } from '../lib/supabase'
import './LoginPage.css'

export default function LoginPage({ onCancel }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('Λάθος email ή κωδικός.')
    setLoading(false)
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleLogin}>
        <div className="login-logo">
          <i className="fa-solid fa-bolt"></i>
        </div>
        <h1>Admin Dashboard</h1>
        <p className="login-subtitle">EnergyCompare</p>

        {error && <div className="login-error">{error}</div>}

        <label className="login-label">
          Email
          <input
            type="email"
            className="login-input"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="email@example.com"
            required
            autoFocus
          />
        </label>

        <label className="login-label">
          Κωδικός
          <input
            type="password"
            className="login-input"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </label>

        <button className="login-btn" type="submit" disabled={loading}>
          {loading ? <i className="fa-solid fa-spinner fa-spin"></i> : 'Σύνδεση'}
        </button>
        {onCancel && (
          <button type="button" className="login-back-btn" onClick={onCancel}>
            ← Πίσω στο Demo
          </button>
        )}
      </form>
    </div>
  )
}
