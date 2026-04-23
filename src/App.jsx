import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { initDemoSession } from './lib/demoSession'
import LoginPage from './components/LoginPage'
import Tabs from './components/Tabs'
import ProvidersTab from './components/ProvidersTab'
import PlansTab from './components/PlansTab'
import PlansByCategoryTab from './components/PlansByCategoryTab'
import CustomersTab from './components/CustomersTab'
import SettingsTab from './components/SettingsTab'
import AppSettingsTab from './components/AppSettingsTab'
import StatusSettingsTab from './components/StatusSettingsTab'
import { cacheClearAll } from './lib/cache'
import './App.css'

const ALL_TABS = ['Providers', 'Plans', 'Ανά Κατηγορία', 'Πελάτες', 'Settings', 'Status Settings', 'App Settings']

export default function App() {
  const [session, setSession] = useState(undefined)
  const [staffInfo, setStaffInfo] = useState(null)
  const [staffLoading, setStaffLoading] = useState(true)
  const [activeTab, setActiveTab] = useState(null)
  const [activeCategory, setActiveCategory] = useState('electricity')
  const [refreshKey, setRefreshKey] = useState(0)
  const [demoSessionId, setDemoSessionId] = useState(null)
  const [demoExpiresAt, setDemoExpiresAt] = useState(null)
  const [countdown, setCountdown] = useState('')
  const [showLogin, setShowLogin] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!newSession) {
        setSession(null)
        setStaffInfo(null)
        setStaffLoading(true)
        setDemoSessionId(null)
        setDemoExpiresAt(null)
        setShowLogin(false)
        return
      }
      setSession(prev => prev?.user?.id === newSession.user?.id ? prev : newSession)
    })

    const refreshInterval = setInterval(() => {
      supabase.auth.refreshSession()
    }, 60 * 60 * 1000)

    return () => {
      subscription.unsubscribe()
      clearInterval(refreshInterval)
    }
  }, [])

  useEffect(() => {
    if (session === undefined) return

    if (session === null) {
      initDemoSession().then(s => {
        if (s) {
          setDemoSessionId(s.id)
          setDemoExpiresAt(s.expires_at)
        }
        setStaffInfo({ role: 'admin', allowed_tabs: ALL_TABS, display_name: 'Demo' })
        setStaffLoading(false)
      })
      return
    }

    // Temp staff: έλεγχος για demo metadata
    const meta = session.user?.user_metadata
    if (meta?.demo_session_id) {
      if (meta.demo_expires_at && new Date(meta.demo_expires_at) < new Date()) {
        supabase.auth.signOut()
        return
      }
      setDemoSessionId(meta.demo_session_id)
      setDemoExpiresAt(meta.demo_expires_at ?? null)
    }

    fetchStaffInfo(session.user.id)
  }, [session])

  // Countdown timer για το demo badge
  useEffect(() => {
    if (!demoExpiresAt) { setCountdown(''); return }
    const calc = () => {
      const diff = new Date(demoExpiresAt) - new Date()
      if (diff <= 0) { setCountdown('Έληξε'); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      setCountdown(h > 0 ? `${h}ω ${m}λ` : `${m} λεπτά`)
    }
    calc()
    const t = setInterval(calc, 60000)
    return () => clearInterval(t)
  }, [demoExpiresAt])

  async function fetchStaffInfo(userId) {
    setStaffLoading(true)
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error || !data) {
      setStaffInfo({ role: 'none', allowed_tabs: [], display_name: '' })
    } else {
      setStaffInfo(data)
    }
    setStaffLoading(false)
  }

  if (session === undefined) return null
  if (staffLoading) return null
  if (showLogin) return <LoginPage onCancel={() => setShowLogin(false)} />

  const isDemoMode = !!demoSessionId
  const user = session?.user ?? null
  const isAdmin = staffInfo?.role === 'admin'
  const allAllowed = isAdmin ? ALL_TABS : (staffInfo?.allowed_tabs || [])
  const allowedTabs = allAllowed.filter(t => t !== 'Πελάτες')
  const canSeeCustomers = allAllowed.includes('Πελάτες')
  const displayName = (isDemoMode && !session)
    ? 'Demo User'
    : (staffInfo?.display_name || user?.user_metadata?.display_name || user?.email)

  if (allowedTabs.length === 0 && !canSeeCustomers) {
    return (
      <div className="admin-app">
        <div className="no-access">
          <i className="fa-solid fa-lock"></i>
          <h2>Δεν έχεις πρόσβαση</h2>
          <p>Ο λογαριασμός σου δεν έχει ρυθμιστεί ακόμα. Επικοινώνησε με τον διαχειριστή.</p>
          <button className="admin-logout" onClick={() => { cacheClearAll(); supabase.auth.signOut() }}>
            <i className="fa-solid fa-right-from-bracket"></i> Αποσύνδεση
          </button>
        </div>
      </div>
    )
  }

  const currentTab = activeTab && allowedTabs.includes(activeTab) ? activeTab : allowedTabs[0]
  const demoProps = { demoMode: isDemoMode, demoSessionId, demoExpiresAt }

  return (
    <div className="admin-app">
      <aside className="admin-sidebar">
        <div className="sidebar-brand">
          <h1>Admin</h1>
          <span className="admin-subtitle">EnergyCompare</span>
        </div>

        {isDemoMode && (
          <div className="demo-badge">
            <i className="fa-solid fa-flask-vial"></i>
            <div className="demo-badge-text">
              <span className="demo-badge-title">Demo Mode</span>
              <span className="demo-badge-sub">Λήγει σε {countdown}</span>
            </div>
          </div>
        )}

        <nav className="sidebar-nav">
          <button
            className={`sidebar-btn ${activeCategory === 'electricity' ? 'active' : ''}`}
            onClick={() => setActiveCategory('electricity')}
          >
            <i className="fa-solid fa-bolt"></i>
            Ρεύμα
          </button>
          <button
            className={`sidebar-btn ${activeCategory === 'gas' ? 'active' : ''}`}
            onClick={() => setActiveCategory('gas')}
          >
            <i className="fa-solid fa-fire"></i>
            Αέριο
          </button>
          {canSeeCustomers && (
            <>
              <div className="sidebar-divider" />
              <button
                className={`sidebar-btn ${activeCategory === 'customers' ? 'active' : ''}`}
                onClick={() => setActiveCategory('customers')}
              >
                <i className="fa-solid fa-users"></i>
                Πελάτες
              </button>
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <span className="admin-user">
            <i className="fa-solid fa-user-circle"></i> {displayName}
            {isAdmin && !isDemoMode && <span className="admin-role-badge">Admin</span>}
            {isDemoMode && <span className="admin-role-badge demo-role-badge">Demo</span>}
          </span>
          {session ? (
            <button className="admin-logout" onClick={() => { cacheClearAll(); supabase.auth.signOut() }}>
              <i className="fa-solid fa-right-from-bracket"></i> Αποσύνδεση
            </button>
          ) : (
            <button className="admin-logout" onClick={() => setShowLogin(true)}>
              <i className="fa-solid fa-right-to-bracket"></i> Σύνδεση Staff
            </button>
          )}
        </div>
      </aside>

      <div className="admin-body">
        {activeCategory === 'customers' ? (
          <main className="admin-main">
            <CustomersTab user={user} refreshKey={refreshKey} demoMode={isDemoMode} />
          </main>
        ) : (
          <>
            <Tabs tabs={allowedTabs} active={currentTab} onChange={setActiveTab} />
            <main className="admin-main">
              {currentTab === 'Providers' && (
                <ProvidersTab serviceType={activeCategory} refreshKey={refreshKey} {...demoProps} />
              )}
              {currentTab === 'Plans' && (
                <PlansTab serviceType={activeCategory} refreshKey={refreshKey} {...demoProps} />
              )}
              {currentTab === 'Ανά Κατηγορία' && (
                <PlansByCategoryTab serviceType={activeCategory} refreshKey={refreshKey} {...demoProps} />
              )}
              {currentTab === 'Settings' && (
                <SettingsTab refreshKey={refreshKey} demoMode={isDemoMode} />
              )}
              {currentTab === 'Status Settings' && (
                <StatusSettingsTab refreshKey={refreshKey} demoMode={isDemoMode} />
              )}
              {currentTab === 'App Settings' && (
                <AppSettingsTab user={user} staffInfo={staffInfo} refreshKey={refreshKey} {...demoProps} />
              )}
            </main>
          </>
        )}
      </div>
    </div>
  )
}
