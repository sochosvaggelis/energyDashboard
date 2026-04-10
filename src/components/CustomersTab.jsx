import React, { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { cacheGet, cacheSet } from '../lib/cache'
import { logAction } from '../lib/audit'
import EditPanel from './EditPanel'
import './CustomersTab.css'

const CACHE_KEY = 'admin_customers'

const DEFAULT_statusOptions = ['Νέο', 'Σε επεξεργασία', 'Ολοκληρωμένο', 'Ακυρωμένο']

const REGION_LABELS = {
  attiki: 'Αττική',
  thessaloniki: 'Θεσσαλονίκη',
  patra: 'Πάτρα',
  larisa: 'Λάρισα',
  other: 'Άλλη',
}

const CONTACT_TIME_LABELS = {
  anytime: 'Οποτεδήποτε',
  morning: 'Πρωί (9-12)',
  noon: 'Μεσημέρι (12-15)',
  afternoon: 'Απόγευμα (15-18)',
  evening: 'Βράδυ (18-21)',
}

const CUSTOMER_TYPE_LABELS = {
  residential: 'Οικιακός',
  professional: 'Επαγγελματίας',
}

const SERVICE_TYPE_LABELS = {
  electricity: 'Ρεύμα',
  gas: 'Αέριο',
  both: 'Ρεύμα & Αέριο',
}

const SERVICE_TYPE_ICONS = {
  electricity: 'fa-bolt',
  gas: 'fa-fire',
  both: 'fa-bolt',
}

const FILE_LABELS = {
  tautotita: 'Ταυτότητα',
  logariasmos: 'Λογαριασμός',
  metritis: 'Μετρητής Ρεύματος',
  metritis_aeriou: 'Μετρητής Αερίου',
  diakanonismos: 'Διακανονισμός',
  pliromi_teleftaias_dosis: 'Πληρωμή Τελευταίας Δόσης',
  symvasi_deddie: 'Σύμβαση ΔΕΔΔΗΕ',
  ypeuthini_dilosi_iban: 'Υπεύθυνη Δήλωση IBAN',
  e9: 'Ε9',
  ypeuthini_dilosi_paraxorisis: 'Υπεύθυνη Δήλωση Παραχώρησης',
  enarxi_drastiriotitas: 'Έναρξη Δραστηριότητας',
  katastatiko: 'Καταστατικό',
  tautotita_nomimou_ekprosopou: 'Ταυτότητα Νόμιμου Εκπροσώπου',
}

function FileThumb({ pathOrUrl, label, index, onLightbox, resolveFileUrl }) {
  const [url, setUrl] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!pathOrUrl) return
    if (!pathOrUrl.startsWith('http')) {
      let cancelled = false
      setFailed(false)
      resolveFileUrl(pathOrUrl).then(resolved => {
        if (cancelled) return
        if (resolved) setUrl(resolved)
        else setFailed(true)
      })
      return () => { cancelled = true }
    } else {
      setUrl(pathOrUrl)
    }
  }, [pathOrUrl, resolveFileUrl])

  if (failed) return <span className="ct-file-loading" title="Δεν φόρτωσε">⚠</span>
  if (!url) return <span className="ct-file-loading">...</span>

  const isImage = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(pathOrUrl)
  return isImage ? (
    <img
      src={url}
      alt={`${label} ${index + 1}`}
      className="ct-file-thumb"
      onClick={() => onLightbox(url)}
    />
  ) : (
    <a href={url} target="_blank" rel="noopener noreferrer" className="ct-file-pdf">
      <i className="fa-solid fa-file-pdf"></i>
      <span>PDF {index > 0 ? index + 1 : ''}</span>
    </a>
  )
}

export default function CustomersTab({ user, refreshKey }) {
  const [submissions, setSubmissions] = useState(() => cacheGet(CACHE_KEY) ?? [])
  const [statusOptions, setStatusOptions] = useState(null)
  const [lockedStatuses, setLockedStatuses] = useState([])
  const [loading, setLoading] = useState(() => !cacheGet(CACHE_KEY))
  const [search, setSearch] = useState('')
  const [error, setError] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [serviceFilter, setServiceFilter] = useState('all')
  const [lightbox, setLightbox] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)

  // Panel state
  const [editCustomer, setEditCustomer] = useState(null)
  const [activeTab, setActiveTab] = useState('details') // 'details' | 'history'
  const [pendingStatus, setPendingStatus] = useState(null)
  const [statusComment, setStatusComment] = useState('')
  const [statusSaving, setStatusSaving] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const notesEndRef = useRef(null)

  const ROWS_PER_PAGE = 25

  const notes = editCustomer?.notes || []

  useEffect(() => {
    setCurrentPage(1)
  }, [search, statusFilter, serviceFilter])

  const filtered = submissions.filter(s => {
    const lead = s.lead_info || {}
    const matchesSearch =
      (lead.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (lead.phone || '').includes(search) ||
      (lead.email || '').toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'all' || s.status === statusFilter
    const svcType = lead.service_type || s.selected_plan?.service_type || null
    const matchesService = serviceFilter === 'all' || svcType === serviceFilter
    return matchesSearch && matchesStatus && matchesService
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE))
  const paginatedFiltered = filtered.slice(
    (currentPage - 1) * ROWS_PER_PAGE,
    currentPage * ROWS_PER_PAGE
  )

  const statusCounts = submissions.reduce((acc, s) => {
    const st = s.status || 'Νέο'
    acc[st] = (acc[st] || 0) + 1
    return acc
  }, {})

  useEffect(() => {
    fetchSubmissions(refreshKey > 0)
    supabase
      .from('settings')
      .select('key, value')
      .in('key', ['status_options', 'locked_statuses'])
      .then(({ data }) => {
        const statusRow = data?.find(r => r.key === 'status_options')
        const lockedRow = data?.find(r => r.key === 'locked_statuses')
        if (statusRow?.value) {
          try { setStatusOptions(JSON.parse(statusRow.value)) } catch { setStatusOptions(DEFAULT_statusOptions) }
        } else {
          setStatusOptions(prev => prev ?? DEFAULT_statusOptions)
        }
        try { setLockedStatuses(lockedRow ? JSON.parse(lockedRow.value) : []) } catch { setLockedStatuses([]) }
      })
  }, [refreshKey])

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('submissions-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'submissions' }, (payload) => {
        setSubmissions(prev => {
          if (payload.eventType === 'INSERT') return [payload.new, ...prev]
          if (payload.eventType === 'UPDATE') return prev.map(s => s.id === payload.new.id ? payload.new : s)
          if (payload.eventType === 'DELETE') return prev.filter(s => s.id !== payload.old.id)
          return prev
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  // Sync editCustomer when submissions update (realtime)
  useEffect(() => {
    if (!editCustomer) return
    const updated = submissions.find(s => s.id === editCustomer.id)
    if (updated) setEditCustomer(updated)
  }, [submissions])

  useEffect(() => {
    if (notesEndRef.current) {
      notesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [notes.length])

  async function fetchSubmissions(skipCache = false) {
    setLoading(true)
    setError(null)
    if (!skipCache) {
      const cached = cacheGet(CACHE_KEY)
      if (cached) { setSubmissions(cached); setLoading(false); return }
    }
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .order('submitted_at', { ascending: false })
    if (error) setError('Προέκυψε σφάλμα. Δοκιμάστε ξανά.')
    else { setSubmissions(data); cacheSet(CACHE_KEY, data) }
    setLoading(false)
  }

  function openPanel(sub, tab = 'details') {
    setEditCustomer(sub)
    setActiveTab(tab)
    setPendingStatus(null)
    setStatusComment('')
    setNoteText('')
  }

  async function confirmStatusChange() {
    if (!editCustomer || !pendingStatus) return
    setStatusSaving(true)
    setError(null)
    const { id } = editCustomer
    const oldStatus = editCustomer.status || 'Νέο'
    const history = editCustomer.status_history || []
    const author = user?.user_metadata?.display_name || user?.email || 'Άγνωστος'
    const entry = {
      from: oldStatus,
      to: pendingStatus,
      comment: statusComment.trim() || null,
      author,
      changed_at: new Date().toISOString()
    }

    const isLocking = lockedStatuses.includes(pendingStatus)
    const { data, error } = await supabase
      .from('submissions')
      .update({ status: pendingStatus, status_history: [...history, entry], ...(isLocking ? { locked: true } : {}) })
      .eq('id', id)
      .select()
    if (error) { setError('Προέκυψε σφάλμα. Δοκιμάστε ξανά.'); setStatusSaving(false); return }
    logAction('update_status', { entity: 'submission', entityId: id, details: { status: pendingStatus, comment: entry.comment } })
    const row = data?.[0]
    if (row) {
      const updated = submissions.map(s => s.id === id ? row : s)
      setSubmissions(updated)
      cacheSet(CACHE_KEY, updated)
      setEditCustomer(row)
    }
    setPendingStatus(null)
    setStatusComment('')
    setStatusSaving(false)
  }

  async function addNote() {
    if (!noteText.trim() || !editCustomer) return
    setNotesSaving(true)
    const id = editCustomer.id
    const currentNotes = editCustomer.notes || []
    const author = user?.user_metadata?.display_name || user?.email || 'Άγνωστος'
    const newNote = { text: noteText.trim(), author, created_at: new Date().toISOString() }
    const updatedNotes = [...currentNotes, newNote]

    const { data, error } = await supabase
      .from('submissions')
      .update({ notes: updatedNotes })
      .eq('id', id)
      .select()
    if (error) { setError('Προέκυψε σφάλμα. Δοκιμάστε ξανά.'); setNotesSaving(false); return }

    const row = data?.[0]
    if (row) {
      const updated = submissions.map(s => s.id === id ? row : s)
      setSubmissions(updated)
      cacheSet(CACHE_KEY, updated)
      setEditCustomer(row)
    }
    setNoteText('')
    setNotesSaving(false)
  }

  async function deleteNote(noteIndex) {
    if (!editCustomer) return
    const id = editCustomer.id
    const updatedNotes = (editCustomer.notes || []).filter((_, i) => i !== noteIndex)

    const { data, error } = await supabase
      .from('submissions')
      .update({ notes: updatedNotes })
      .eq('id', id)
      .select()
    if (error) { setError('Προέκυψε σφάλμα. Δοκιμάστε ξανά.'); return }

    const row = data?.[0]
    if (row) {
      const updated = submissions.map(s => s.id === id ? row : s)
      setSubmissions(updated)
      cacheSet(CACHE_KEY, updated)
      setEditCustomer(row)
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleString('el-GR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }

  function timeAgo(dateStr) {
    if (!dateStr) return ''
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins} λεπτά πριν`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours} ώρ${hours === 1 ? 'α' : 'ες'} πριν`
    const days = Math.floor(hours / 24)
    return `${days} μέρ${days === 1 ? 'α' : 'ες'} πριν`
  }

  function getStatusClass(status) {
    switch (status) {
      case 'Ολοκληρωμένο': return 'status-done'
      case 'Σε επεξεργασία': return 'status-progress'
      case 'Ακυρωμένο': return 'status-cancelled'
      default: return 'status-new'
    }
  }

  const signedUrlCache = useRef({})

  const resolveFileUrl = useCallback(async (pathOrUrl) => {
    if (!pathOrUrl) return null
    if (pathOrUrl.startsWith('http')) return pathOrUrl
    if (signedUrlCache.current[pathOrUrl]) {
      const cached = signedUrlCache.current[pathOrUrl]
      if (cached.expiry > Date.now()) return cached.url
    }
    const { data, error } = await supabase.storage.from('uploads').createSignedUrl(pathOrUrl, 3600)
    if (error || !data?.signedUrl) return null
    signedUrlCache.current[pathOrUrl] = { url: data.signedUrl, expiry: Date.now() + 3500 * 1000 }
    return data.signedUrl
  }, [])

  // Panel tab content
  const panelLead = editCustomer?.lead_info || {}
  const panelElec = editCustomer?.electricity_info || {}
  const panelPlan = editCustomer?.selected_plan || {}
  const panelDetail = editCustomer?.detail_form || {}
  const panelFiles = editCustomer?.uploaded_files || {}
  const hasFiles = Object.values(panelFiles).some(v => v && (Array.isArray(v) ? v.length > 0 : true))
  const currentStatus = editCustomer?.status || 'Νέο'
  const statusHistory = editCustomer?.status_history || []

  return (
    <div className="customers-tab">
      <nav className="tabs">
        <button className={`tab-btn${serviceFilter === 'all' ? ' active' : ''}`} onClick={() => setServiceFilter('all')}>
          Όλοι
        </button>
        <button className={`tab-btn${serviceFilter === 'electricity' ? ' active' : ''}`} onClick={() => setServiceFilter('electricity')}>
          <i className="fa-solid fa-bolt"></i> Ρεύμα
        </button>
        <button className={`tab-btn${serviceFilter === 'gas' ? ' active' : ''}`} onClick={() => setServiceFilter('gas')}>
          <i className="fa-solid fa-fire"></i> Αέριο
        </button>
        <button className={`tab-btn${serviceFilter === 'both' ? ' active' : ''}`} onClick={() => setServiceFilter('both')}>
          Και τα 2
        </button>
      </nav>

      <div className="ct-toolbar">
        <div className="ct-toolbar-left">
          <h2>Πελάτες</h2>
          <span className="ct-count">{submissions.length} συνολικά</span>
        </div>
        <div className="ct-toolbar-right">
          <div className="ct-status-pills">
            <button
              className={`ct-pill ${statusFilter === 'all' ? 'active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              Όλα <span className="pill-count">{submissions.length}</span>
            </button>
            {(statusOptions || []).map(s => (
              <button
                key={s}
                className={`ct-pill ${getStatusClass(s)} ${statusFilter === s ? 'active' : ''}`}
                onClick={() => setStatusFilter(s)}
              >
                {s} <span className="pill-count">{statusCounts[s] || 0}</span>
              </button>
            ))}
          </div>
          <input
            className="ct-search"
            type="text"
            placeholder="Αναζήτηση ονόματος, τηλεφώνου, email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button className="btn-primary" onClick={() => fetchSubmissions(true)}>
            <i className="fa-solid fa-rotate-right"></i> Ανανέωση
          </button>
        </div>
      </div>

      {error && <div className="error-msg">{error}</div>}

      {loading ? (
        <p className="loading-text">Φόρτωση...</p>
      ) : filtered.length === 0 ? (
        <div className="ct-empty">
          <i className="fa-solid fa-inbox"></i>
          <p>{search || statusFilter !== 'all' ? 'Κανένα αποτέλεσμα' : 'Δεν υπάρχουν υποβολές ακόμα'}</p>
        </div>
      ) : (
        <div className="ct-table-wrap">
          <table className="ct-table">
            <thead>
              <tr>
                <th className="th-num">#</th>
                <th>Όνομα</th>
                <th>Υπηρεσία</th>
                <th>Τηλέφωνο</th>
                <th>Email</th>
                <th>Περιοχή</th>
                <th>Πλάνο</th>
                <th>Status</th>
                <th>Ημ/νία</th>
                <th className="th-icon"><i className="fa-regular fa-comment"></i></th>
                <th className="th-expand"></th>
              </tr>
            </thead>
            <tbody>
              {paginatedFiltered.map((s, idx) => {
                const lead = s.lead_info || {}
                const plan = s.selected_plan || {}
                const status = s.status || 'Νέο'
                const noteCount = (s.notes || []).length

                return (
                  <tr
                    key={s.id}
                    className={`ct-row${editCustomer?.id === s.id ? ' row-editing' : ''}`}
                    onClick={() => openPanel(s, 'details')}
                  >
                    <td className="td-num">{(currentPage - 1) * ROWS_PER_PAGE + idx + 1}</td>
                    <td className="td-name">{lead.name || 'Χωρίς όνομα'}</td>
                    <td>
                      {(() => {
                        const st = lead.service_type || plan.service_type
                        if (!st) return '—'
                        return (
                          <span className={`ct-service-badge ct-service-${st}`}>
                            <i className={`fa-solid ${SERVICE_TYPE_ICONS[st] || 'fa-bolt'}`}></i>
                            {SERVICE_TYPE_LABELS[st] || st}
                          </span>
                        )
                      })()}
                    </td>
                    <td>
                      {lead.phone ? (
                        <a href={`tel:${lead.phone}`} className="ct-phone" onClick={e => e.stopPropagation()}>
                          <i className="fa-solid fa-phone"></i> {lead.phone}
                        </a>
                      ) : '—'}
                    </td>
                    <td>
                      {lead.email ? (
                        <a href={`mailto:${lead.email}`} className="ct-email" onClick={e => e.stopPropagation()}>
                          {lead.email}
                        </a>
                      ) : '—'}
                    </td>
                    <td>{REGION_LABELS[lead.region] || lead.region || '—'}</td>
                    <td>
                      {plan.provider
                        ? <span className="ct-plan-badge">{plan.provider} – {plan.plan}</span>
                        : '—'}
                    </td>
                    <td>
                      <span className={`ct-status-badge ${getStatusClass(status)}`}>
                        {s.locked && (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px', verticalAlign: 'middle' }}>
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                        )}
                        {status}
                      </span>
                    </td>
                    <td className="td-date" title={formatDate(s.submitted_at)}>{timeAgo(s.submitted_at)}</td>
                    <td className="td-notes">
                      <button
                        className="ct-notes-btn"
                        onClick={e => { e.stopPropagation(); openPanel(s, 'details') }}
                      >
                        {/* <i className={`fa-${noteCount > 0 ? 'solid' : 'regular'} fa-comment`}></i> */}
                        {/* {noteCount > 0 && <span className="ct-notes-count">{noteCount}</span>} */}
                      </button>
                    </td>
                    <td className="td-expand">
                      <i className="fa-solid fa-arrow-right ct-expand-icon"></i>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!loading && filtered.length > ROWS_PER_PAGE && (
        <div className="ct-pagination">
          <button
            className="ct-page-btn"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage(p => p - 1)}
          >
            <i className="fa-solid fa-chevron-left"></i> Προηγούμενη
          </button>
          <span className="ct-page-info">
            Σελίδα {currentPage} από {totalPages}
          </span>
          <button
            className="ct-page-btn"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage(p => p + 1)}
          >
            Επόμενη <i className="fa-solid fa-chevron-right"></i>
          </button>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="ct-lightbox" onClick={() => setLightbox(null)}>
          <button className="ct-lightbox-close" onClick={() => setLightbox(null)}>
            <i className="fa-solid fa-xmark"></i>
          </button>
          <img src={lightbox} alt="Preview" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* Customer Detail Panel */}
      <EditPanel
        isOpen={!!editCustomer}
        onClose={() => { setEditCustomer(null); setPendingStatus(null) }}
        title={panelLead.name || 'Πελάτης'}
        width="620px"
      >
        {editCustomer && (
          <>
            {/* Tab nav */}
            <div className="ep-tabs">
              <button
                className={`ep-tab${activeTab === 'details' ? ' active' : ''}`}
                onClick={() => setActiveTab('details')}
              >
                <i className="fa-solid fa-user"></i> Στοιχεία
              </button>
              <button
                className={`ep-tab${activeTab === 'history' ? ' active' : ''}`}
                onClick={() => setActiveTab('history')}
              >
                <i className="fa-solid fa-clock-rotate-left"></i> Ιστορικό
                {/* {statusHistory.length > 0 && <span className="ct-notes-count" style={{ marginLeft: '4px' }}>{statusHistory.length}</span>} */}
              </button>
            </div>

            {/* ── Details tab ── */}
            {activeTab === 'details' && (
              <>
                <div className="ep-detail-section">
                  <h4><i className="fa-solid fa-user"></i> Στοιχεία Επικοινωνίας</h4>
                  <dl>
                    <dt>Όνομα</dt><dd>{panelLead.name || '—'}</dd>
                    <dt>Τηλέφωνο</dt><dd><a href={`tel:${panelLead.phone}`}>{panelLead.phone || '—'}</a></dd>
                    <dt>Email</dt><dd>{panelLead.email || '—'}</dd>
                    <dt>Περιοχή</dt><dd>{REGION_LABELS[panelLead.region] || panelLead.region || '—'}</dd>
                    <dt>Ώρα επικοινωνίας</dt><dd>{CONTACT_TIME_LABELS[panelLead.contact_time] || panelLead.contact_time || '—'}</dd>
                  </dl>
                </div>

                <div className="ep-detail-section">
                  <h4><i className="fa-solid fa-bolt"></i> Πληροφορίες Ρεύματος</h4>
                  <dl>
                    <dt>Τύπος πελάτη</dt><dd>{CUSTOMER_TYPE_LABELS[panelElec.customer_type] || panelElec.customer_type || '—'}</dd>
                    <dt>Νυχτερινό</dt><dd>{panelElec.night_tariff === 'yes' ? 'Ναι' : panelElec.night_tariff === 'no' ? 'Όχι' : '—'}</dd>
                    <dt>Κοινωνικό</dt><dd>{panelElec.social_tariff === 'yes' ? 'Ναι' : panelElec.social_tariff === 'no' ? 'Όχι' : '—'}</dd>
                    <dt>Τωρινός πάροχος</dt><dd>{panelElec.current_provider || '—'}</dd>
                    <dt>Κατανάλωση</dt><dd>{panelElec.kwh_consumption ? `${panelElec.kwh_consumption} kWh` : '—'}</dd>
                    {panelElec.night_kwh_consumption > 0 && (
                      <><dt>Νυχτερινή κατανάλωση</dt><dd>{panelElec.night_kwh_consumption} kWh</dd></>
                    )}
                  </dl>
                </div>

                {panelPlan.provider && (
                  <div className="ep-detail-section">
                    <h4><i className="fa-solid fa-file-invoice"></i> Επιλεγμένο Πλάνο</h4>
                    <dl>
                      <dt>Πάροχος</dt><dd>{panelPlan.provider}</dd>
                      <dt>Πλάνο</dt><dd>{panelPlan.plan}</dd>
                      <dt>Τύπος τιμολογίου</dt><dd>{panelPlan.tariff_type || '—'}</dd>
                      <dt>Τιμή/kWh</dt><dd>{panelPlan.price_per_kwh != null ? `${panelPlan.price_per_kwh} €` : '—'}</dd>
                      {panelPlan.night_price_per_kwh != null && (
                        <><dt>Νυχτ. τιμή/kWh</dt><dd>{panelPlan.night_price_per_kwh} €</dd></>
                      )}
                      <dt>Πάγιο</dt><dd>{panelPlan.monthly_fee_eur != null ? `${panelPlan.monthly_fee_eur} €` : '—'}</dd>
                    </dl>
                  </div>
                )}

                {(panelDetail.afm || panelDetail.doy) && (
                  <div className="ep-detail-section">
                    <h4><i className="fa-solid fa-id-card"></i> Λοιπά Στοιχεία</h4>
                    <dl>
                      <dt>ΑΦΜ</dt><dd>{panelDetail.afm || '—'}</dd>
                      <dt>ΔΟΥ</dt><dd>{panelDetail.doy || '—'}</dd>
                      <dt>Πάγια εντολή</dt><dd>{panelDetail.pagia_entoli ? 'Ναι' : 'Όχι'}</dd>
                      {panelDetail.iban && <><dt>IBAN</dt><dd>{panelDetail.iban}</dd></>}
                      {panelDetail.onoma_dikaiouhou && <><dt>Δικαιούχος</dt><dd>{panelDetail.onoma_dikaiouhou}</dd></>}
                      {panelDetail.onoma_trapezas && <><dt>Τράπεζα</dt><dd>{panelDetail.onoma_trapezas}</dd></>}
                      <dt>Αλλαγή ονόματος</dt><dd>{panelDetail.allagi_onomatos ? 'Ναι' : 'Όχι'}</dd>
                      <dt>Ιδιοκτησία</dt><dd>{panelDetail.idiotita || '—'}</dd>
                    </dl>
                  </div>
                )}

                {hasFiles && (
                  <div className="ep-detail-section">
                    <h4><i className="fa-solid fa-images"></i> Αρχεία / Φωτογραφίες</h4>
                    <div className="ep-files-grid">
                      {Object.entries(FILE_LABELS).map(([key, label]) => {
                        const urls = panelFiles[key]
                        if (!urls || (Array.isArray(urls) && urls.length === 0)) return null
                        const list = Array.isArray(urls) ? urls : [urls]
                        return (
                          <div key={key} className="ep-file-group">
                            <span className="ep-file-label">{label}</span>
                            <div className="ep-file-previews">
                              {list.map((item, i) => (
                                <FileThumb
                                  key={i}
                                  pathOrUrl={item}
                                  label={label}
                                  index={i}
                                  onLightbox={setLightbox}
                                  resolveFileUrl={resolveFileUrl}
                                />
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div className="ep-detail-section">
                  <h4><i className="fa-regular fa-clock"></i> Υποβλήθηκε</h4>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{formatDate(editCustomer.submitted_at)}</p>
                </div>

                {/* Status */}
                <div className="ep-divider" />
                <div className="ep-field">
                  <label className="ep-label">Status</label>
                  <select
                    className={`ep-input ep-select ${getStatusClass(pendingStatus || currentStatus)}`}
                    value={pendingStatus || currentStatus}
                    onChange={e => {
                      const val = e.target.value
                      setPendingStatus(val !== currentStatus ? val : null)
                      setStatusComment('')
                    }}
                  >
                    {(statusOptions || []).map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
                {pendingStatus && pendingStatus !== currentStatus && (
                  <>
                    <div className="ep-field">
                      <label className="ep-label">Σχόλιο (προαιρετικό)</label>
                      <textarea
                        className="ep-input ep-textarea"
                        placeholder="Σχόλιο..."
                        value={statusComment}
                        onChange={e => setStatusComment(e.target.value)}
                        rows={2}
                        autoFocus
                      />
                    </div>
                    <button
                      className="btn-primary"
                      onClick={confirmStatusChange}
                      disabled={statusSaving}
                      style={{ width: '100%', marginBottom: '1.25rem' }}
                    >
                      {statusSaving ? <i className="fa-solid fa-spinner fa-spin"></i> : 'Αποθήκευση Status'}
                    </button>
                  </>
                )}

                {/* Notes */}
                <div className="ep-divider" />
                <div className="ep-section-title">
                  <i className="fa-solid fa-comment" style={{ marginRight: '0.4rem' }}></i>
                  Σχόλια
                </div>
                {notes.length === 0 ? (
                  <div className="ep-notes-empty">Δεν υπάρχουν σχόλια ακόμα</div>
                ) : (
                  <div className="ep-notes-list">
                    {notes.map((n, i) => (
                      <div key={i} className="ep-note-item">
                        <div className="ep-note-meta">
                          <span className="ep-note-author">
                            <i className="fa-solid fa-user" style={{ marginRight: '0.3rem' }}></i>
                            {n.author || 'Άγνωστος'}
                          </span>
                          <span className="ep-note-date">{formatDate(n.created_at)}</span>
                        </div>
                        <p className="ep-note-text">{n.text}</p>
                        <div className="ep-note-footer">
                          <button className="ep-note-delete" onClick={() => deleteNote(i)}>
                            <i className="fa-solid fa-trash"></i>
                          </button>
                        </div>
                      </div>
                    ))}
                    <div ref={notesEndRef} />
                  </div>
                )}
                <div className="ep-notes-input-row" style={{ marginTop: '0.75rem' }}>
                  <textarea
                    className="ep-input ep-textarea"
                    placeholder="Γράψε σχόλιο..."
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        addNote()
                      }
                    }}
                    rows={3}
                  />
                  <button
                    className="ep-notes-send"
                    onClick={addNote}
                    disabled={!noteText.trim() || notesSaving}
                  >
                    {notesSaving
                      ? <i className="fa-solid fa-spinner fa-spin"></i>
                      : <i className="fa-solid fa-paper-plane"></i>
                    }
                  </button>
                </div>
              </>
            )}

            {/* ── History tab ── */}
            {activeTab === 'history' && (
              <>
                {statusHistory.length === 0 ? (
                  <div className="ep-notes-empty">
                    <i className="fa-solid fa-clock-rotate-left" style={{ fontSize: '1.5rem', marginBottom: '0.5rem', display: 'block' }}></i>
                    Δεν υπάρχει ιστορικό ακόμα
                  </div>
                ) : (
                  <div className="ep-history-timeline">
                    {statusHistory.map((h, i) => (
                      <div key={i} className="ep-history-entry">
                        <div className="ep-history-dot" />
                        <div className="ep-history-content">
                          <div className="ep-history-header">
                            <span className={`ct-status-badge ${getStatusClass(h.from)}`}>{h.from}</span>
                            <i className="fa-solid fa-arrow-right" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}></i>
                            <span className={`ct-status-badge ${getStatusClass(h.to)}`}>{h.to}</span>
                            <span className="ep-history-date">{formatDate(h.changed_at)}</span>
                          </div>
                          <div className="ep-history-meta">
                            <i className="fa-solid fa-user" style={{ marginRight: '0.3rem' }}></i>
                            {h.author}
                          </div>
                          {h.comment && <p className="ep-history-comment">{h.comment}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </EditPanel>
    </div>
  )
}
