import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
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
const PLAN_TABS = ['Providers', 'Plans', 'Ανά Κατηγορία', 'Settings', 'Status Settings', 'App Settings']

export default function App() {
  const [session, setSession] = useState(undefined)
  const [staffInfo, setStaffInfo] = useState(null)
  const [staffLoading, setStaffLoading] = useState(true)
  const [activeTab, setActiveTab] = useState(null)
  const [activeCategory, setActiveCategory] = useState('electricity')
  const [refreshKey, setRefreshKey] = useState(0)

  // Auto-refresh data every 10 minutes
  useEffect(() => {
    const id = setInterval(() => {
      cacheClearAll()
      setRefreshKey(k => k + 1)
    }, 10 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!newSession) {
        setSession(null)
        setStaffInfo(null)
        setStaffLoading(true)
        return
      }
      // Only update if user changed — token refreshes (tab re-focus) keep the same reference
      setSession(prev => prev?.user?.id === newSession.user?.id ? prev : newSession)
    })

    // Auto-refresh session every 1 hour
    const refreshInterval = setInterval(() => {
      supabase.auth.refreshSession()
    }, 60 * 60 * 1000)

    return () => {
      subscription.unsubscribe()
      clearInterval(refreshInterval)
    }
  }, [])

  useEffect(() => {
    if (!session) return
    fetchStaffInfo(session.user.id)
  }, [session])

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

  // Loading
  if (session === undefined) return null
  if (!session) return <LoginPage />
  if (staffLoading) return null

  const user = session.user
  const isAdmin = staffInfo?.role === 'admin'
  const allAllowed = isAdmin ? ALL_TABS : (staffInfo?.allowed_tabs || [])
  const allowedTabs = allAllowed.filter(t => t !== 'Πελάτες')
  const canSeeCustomers = allAllowed.includes('Πελάτες')
  const displayName = staffInfo?.display_name || user.user_metadata?.display_name || user.email

  // No access
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

  // Default to first allowed tab
  const currentTab = activeTab && allowedTabs.includes(activeTab) ? activeTab : allowedTabs[0]

  return (
    <div className="admin-app">
      <aside className="admin-sidebar">
        <div className="sidebar-brand">
          <h1>Admin</h1>
          <span className="admin-subtitle">EnergyCompare</span>
        </div>
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
            {isAdmin && <span className="admin-role-badge">Admin</span>}
          </span>
          <button className="admin-logout" onClick={() => { cacheClearAll(); supabase.auth.signOut() }}>
            <i className="fa-solid fa-right-from-bracket"></i> Αποσύνδεση
          </button>
        </div>
      </aside>
      <div className="admin-body">
        {activeCategory === 'customers' ? (
          <main className="admin-main">
            <CustomersTab user={user} refreshKey={refreshKey} />
          </main>
        ) : (
          <>
            <Tabs tabs={allowedTabs} active={currentTab} onChange={setActiveTab} />
            <main className="admin-main">
              {currentTab === 'Providers' && <ProvidersTab serviceType={activeCategory} refreshKey={refreshKey} />}
              {currentTab === 'Plans' && <PlansTab serviceType={activeCategory} refreshKey={refreshKey} />}
              {currentTab === 'Ανά Κατηγορία' && <PlansByCategoryTab serviceType={activeCategory} refreshKey={refreshKey} />}
              {currentTab === 'Settings' && <SettingsTab refreshKey={refreshKey} />}
              {currentTab === 'Status Settings' && <StatusSettingsTab refreshKey={refreshKey} />}
              {currentTab === 'App Settings' && <AppSettingsTab user={user} staffInfo={staffInfo} refreshKey={refreshKey} />}
            </main>
          </>
        )}
      </div>
    </div>
  )
}
