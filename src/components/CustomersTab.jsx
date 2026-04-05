import React, { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { cacheGet, cacheSet } from '../lib/cache'
import { logAction } from '../lib/audit'
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
      // Storage path — resolve to signed URL
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
  const [submissions, setSubmissions] = useState([])
  const [statusOptions, setStatusOptions] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [error, setError] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [serviceFilter, setServiceFilter] = useState('all')
  const [lightbox, setLightbox] = useState(null)
  const [notesId, setNotesId] = useState(null)
  const [noteText, setNoteText] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [statusChange, setStatusChange] = useState(null) // { id, oldStatus, newStatus }
  const [statusComment, setStatusComment] = useState('')
  const [statusSaving, setStatusSaving] = useState(false)
  const [historyId, setHistoryId] = useState(null)
  const notesEndRef = useRef(null)

  const ROWS_PER_PAGE = 25

  const notesSub = notesId ? submissions.find(s => s.id === notesId) : null
  const notes = notesSub?.notes || []

  // Reset to page 1 when search or filter changes
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
      .select('value')
      .eq('key', 'status_options')
      .single()
      .then(({ data }) => {
        if (data?.value) {
          try { setStatusOptions(JSON.parse(data.value)) } catch { setStatusOptions(DEFAULT_statusOptions) }
        } else {
          setStatusOptions(prev => prev ?? DEFAULT_statusOptions)
        }
      })
  }, [refreshKey])

  // Realtime: auto-update when submissions change
  useEffect(() => {
    const channel = supabase
      .channel('submissions-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'submissions' }, (payload) => {
        setSubmissions(prev => {
          if (payload.eventType === 'INSERT') {
            return [payload.new, ...prev]
          }
          if (payload.eventType === 'UPDATE') {
            return prev.map(s => s.id === payload.new.id ? payload.new : s)
          }
          if (payload.eventType === 'DELETE') {
            return prev.filter(s => s.id !== payload.old.id)
          }
          return prev
        })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

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

  function requestStatusChange(id, newStatus) {
    const sub = submissions.find(s => s.id === id)
    const oldStatus = sub?.status || 'Νέο'
    if (oldStatus === newStatus) return
    setStatusChange({ id, oldStatus, newStatus })
    setStatusComment('')
  }

  async function confirmStatusChange() {
    if (!statusChange) return
    setStatusSaving(true)
    setError(null)
    const { id, oldStatus, newStatus } = statusChange
    const sub = submissions.find(s => s.id === id)
    const history = sub?.status_history || []
    const author = user?.user_metadata?.display_name || user?.email || 'Άγνωστος'
    const entry = {
      from: oldStatus,
      to: newStatus,
      comment: statusComment.trim() || null,
      author,
      changed_at: new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('submissions')
      .update({ status: newStatus, status_history: [...history, entry] })
      .eq('id', id)
      .select()
    if (error) { setError('Προέκυψε σφάλμα. Δοκιμάστε ξανά.'); setStatusSaving(false); return }
    logAction('update_status', { entity: 'submission', entityId: id, details: { status: newStatus, comment: entry.comment } })
    const row = data?.[0]
    if (row) {
      const updated = submissions.map(s => s.id === id ? row : s)
      setSubmissions(updated)
      cacheSet(CACHE_KEY, updated)
    }
    setStatusChange(null)
    setStatusComment('')
    setStatusSaving(false)
  }

  async function addNote(id) {
    if (!noteText.trim()) return
    setNotesSaving(true)
    const sub = submissions.find(s => s.id === id)
    const currentNotes = sub?.notes || []
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
    }
    setNoteText('')
    setNotesSaving(false)
  }

  async function deleteNote(subId, noteIndex) {
    const sub = submissions.find(s => s.id === subId)
    const currentNotes = sub?.notes || []
    const updatedNotes = currentNotes.filter((_, i) => i !== noteIndex)

    const { data, error } = await supabase
      .from('submissions')
      .update({ notes: updatedNotes })
      .eq('id', subId)
      .select()
    if (error) { setError('Προέκυψε σφάλμα. Δοκιμάστε ξανά.'); return }

    const row = data?.[0]
    if (row) {
      const updated = submissions.map(s => s.id === subId ? row : s)
      setSubmissions(updated)
      cacheSet(CACHE_KEY, updated)
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

  function openNotes(e, id) {
    e.stopPropagation()
    setNotesId(id)
    setNoteText('')
  }


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
      {/* Header toolbar */}
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
                const elec = s.electricity_info || {}
                const plan = s.selected_plan || {}
                const detail = s.detail_form || {}
                const files = s.uploaded_files || {}
                const isExpanded = expandedId === s.id
                const status = s.status || 'Νέο'
                const hasFiles = Object.values(files).some(v => v && (Array.isArray(v) ? v.length > 0 : true))
                const noteCount = (s.notes || []).length

                return (
                  <React.Fragment key={s.id}>
                    <tr
                      className={`ct-row ${isExpanded ? 'ct-row-expanded' : ''}`}
                      onClick={() => setExpandedId(isExpanded ? null : s.id)}
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
                        <span className={`ct-status-badge ${getStatusClass(status)}`}>{status}</span>
                      </td>
                      <td className="td-date" title={formatDate(s.submitted_at)}>{timeAgo(s.submitted_at)}</td>
                      <td className="td-notes">
                        <button className="ct-notes-btn" onClick={e => openNotes(e, s.id)}>
                          <i className={`fa-${noteCount > 0 ? 'solid' : 'regular'} fa-comment`}></i>
                          {noteCount > 0 && <span className="ct-notes-count">{noteCount}</span>}
                        </button>
                      </td>
                      <td className="td-expand">
                        <i className={`fa-solid fa-chevron-${isExpanded ? 'up' : 'down'} ct-expand-icon`}></i>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="ct-expanded-row">
                        <td colSpan="11">
                          <div className="ct-card-body">
                            <div className="ct-detail-grid">
                              {/* Contact info */}
                              <div className="ct-section">
                                <h4><i className="fa-solid fa-user"></i> Στοιχεία Επικοινωνίας</h4>
                                <dl>
                                  <dt>Όνομα</dt><dd>{lead.name || '—'}</dd>
                                  <dt>Τηλέφωνο</dt><dd><a href={`tel:${lead.phone}`}>{lead.phone || '—'}</a></dd>
                                  <dt>Email</dt><dd>{lead.email || '—'}</dd>
                                  <dt>Περιοχή</dt><dd>{REGION_LABELS[lead.region] || lead.region || '—'}</dd>
                                  <dt>Ώρα επικοινωνίας</dt><dd>{CONTACT_TIME_LABELS[lead.contact_time] || lead.contact_time || '—'}</dd>
                                </dl>
                              </div>

                              {/* Electricity info */}
                              <div className="ct-section">
                                <h4><i className="fa-solid fa-bolt"></i> Πληροφορίες Ρεύματος</h4>
                                <dl>
                                  <dt>Τύπος πελάτη</dt><dd>{CUSTOMER_TYPE_LABELS[elec.customer_type] || elec.customer_type || '—'}</dd>
                                  <dt>Νυχτερινό</dt><dd>{elec.night_tariff === 'yes' ? 'Ναι' : elec.night_tariff === 'no' ? 'Όχι' : '—'}</dd>
                                  <dt>Κοινωνικό</dt><dd>{elec.social_tariff === 'yes' ? 'Ναι' : elec.social_tariff === 'no' ? 'Όχι' : '—'}</dd>
                                  <dt>Τωρινός πάροχος</dt><dd>{elec.current_provider || '—'}</dd>
                                  <dt>Κατανάλωση</dt><dd>{elec.kwh_consumption ? `${elec.kwh_consumption} kWh` : '—'}</dd>
                                  {elec.night_kwh_consumption > 0 && (
                                    <><dt>Νυχτερινή κατανάλωση</dt><dd>{elec.night_kwh_consumption} kWh</dd></>
                                  )}
                                </dl>
                              </div>

                              {/* Selected plan */}
                              {plan.provider && (
                                <div className="ct-section">
                                  <h4><i className="fa-solid fa-file-invoice"></i> Επιλεγμένο Πλάνο</h4>
                                  <dl>
                                    <dt>Πάροχος</dt><dd>{plan.provider}</dd>
                                    <dt>Πλάνο</dt><dd>{plan.plan}</dd>
                                    <dt>Τύπος τιμολογίου</dt><dd>{plan.tariff_type || '—'}</dd>
                                    <dt>Τιμή/kWh</dt><dd>{plan.price_per_kwh != null ? `${plan.price_per_kwh} €` : '—'}</dd>
                                    {plan.night_price_per_kwh != null && (
                                      <><dt>Νυχτ. τιμή/kWh</dt><dd>{plan.night_price_per_kwh} €</dd></>
                                    )}
                                    <dt>Πάγιο</dt><dd>{plan.monthly_fee_eur != null ? `${plan.monthly_fee_eur} €` : '—'}</dd>
                                  </dl>
                                </div>
                              )}

                              {/* Detail form */}
                              {(detail.afm || detail.doy) && (
                                <div className="ct-section">
                                  <h4><i className="fa-solid fa-id-card"></i> Λοιπά Στοιχεία</h4>
                                  <dl>
                                    <dt>ΑΦΜ</dt><dd>{detail.afm || '—'}</dd>
                                    <dt>ΔΟΥ</dt><dd>{detail.doy || '—'}</dd>
                                    <dt>Πάγια εντολή</dt><dd>{detail.pagia_entoli ? 'Ναι' : 'Όχι'}</dd>
                                    {detail.iban && <><dt>IBAN</dt><dd>{detail.iban}</dd></>}
                                    {detail.onoma_dikaiouhou && <><dt>Δικαιούχος</dt><dd>{detail.onoma_dikaiouhou}</dd></>}
                                    {detail.onoma_trapezas && <><dt>Τράπεζα</dt><dd>{detail.onoma_trapezas}</dd></>}
                                    <dt>Αλλαγή ονόματος</dt><dd>{detail.allagi_onomatos ? 'Ναι' : 'Όχι'}</dd>
                                    <dt>Ιδιοκτησία</dt><dd>{detail.idiotita || '—'}</dd>
                                  </dl>
                                </div>
                              )}
                            </div>

                            {/* Uploaded files */}
                            {hasFiles && (
                              <div className="ct-files-section">
                                <h4><i className="fa-solid fa-images"></i> Αρχεία / Φωτογραφίες</h4>
                                <div className="ct-files-grid">
                                  {Object.entries(FILE_LABELS).map(([key, label]) => {
                                    const urls = files[key]
                                    if (!urls || (Array.isArray(urls) && urls.length === 0)) return null
                                    const list = Array.isArray(urls) ? urls : [urls]
                                    return (
                                      <div key={key} className="ct-file-group">
                                        <span className="ct-file-label">{label}</span>
                                        <div className="ct-file-previews">
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

                            {/* Card actions */}
                            <div className="ct-card-actions">
                              <div className="ct-action-left">
                                <label className="ct-status-label">Status:</label>
                                <select
                                  className={`status-select ${getStatusClass(status)}`}
                                  value={status}
                                  onChange={e => { e.stopPropagation(); requestStatusChange(s.id, e.target.value) }}
                                >
                                  {(statusOptions || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                                {(s.status_history || []).length > 0 && (
                                  <button
                                    className="ct-history-btn"
                                    onClick={e => { e.stopPropagation(); setHistoryId(historyId === s.id ? null : s.id) }}
                                    title="Ιστορικό status"
                                  >
                                    <i className="fa-solid fa-clock-rotate-left"></i>
                                    <span>{(s.status_history || []).length}</span>
                                  </button>
                                )}
                              </div>
                              <div className="ct-action-right">
                                <span className="ct-submitted-date">
                                  <i className="fa-regular fa-clock"></i> {formatDate(s.submitted_at)}
                                </span>
                              </div>
                            </div>

                            {/* Status history timeline */}
                            {historyId === s.id && (s.status_history || []).length > 0 && (
                              <div className="ct-history-section">
                                <h4><i className="fa-solid fa-clock-rotate-left"></i> Ιστορικό Status</h4>
                                <div className="ct-history-timeline">
                                  {(s.status_history || []).map((h, i) => (
                                    <div key={i} className="ct-history-entry">
                                      <div className="ct-history-dot" />
                                      <div className="ct-history-content">
                                        <div className="ct-history-header">
                                          <span className={`ct-status-badge ${getStatusClass(h.from)}`}>{h.from}</span>
                                          <i className="fa-solid fa-arrow-right ct-history-arrow"></i>
                                          <span className={`ct-status-badge ${getStatusClass(h.to)}`}>{h.to}</span>
                                          <span className="ct-history-date">{formatDate(h.changed_at)}</span>
                                        </div>
                                        <div className="ct-history-meta">
                                          <span className="ct-history-author"><i className="fa-solid fa-user"></i> {h.author}</span>
                                        </div>
                                        {h.comment && <p className="ct-history-comment">{h.comment}</p>}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination controls */}
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

      {/* Status change modal */}
      {statusChange && (
        <>
          <div className="notes-overlay" onClick={() => setStatusChange(null)} />
          <div className="ct-status-modal">
            <div className="ct-status-modal-header">
              <h3>Αλλαγή Status</h3>
              <button className="notes-close" onClick={() => setStatusChange(null)}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="ct-status-modal-body">
              <div className="ct-status-modal-change">
                <span className={`ct-status-badge ${getStatusClass(statusChange.oldStatus)}`}>{statusChange.oldStatus}</span>
                <i className="fa-solid fa-arrow-right"></i>
                <span className={`ct-status-badge ${getStatusClass(statusChange.newStatus)}`}>{statusChange.newStatus}</span>
              </div>
              <textarea
                className="ct-status-comment"
                placeholder="Σχόλιο (προαιρετικό)..."
                value={statusComment}
                onChange={e => setStatusComment(e.target.value)}
                rows={3}
                autoFocus
              />
            </div>
            <div className="ct-status-modal-footer">
              <button className="btn-cancel" onClick={() => setStatusChange(null)}>Ακύρωση</button>
              <button className="btn-primary" onClick={confirmStatusChange} disabled={statusSaving}>
                {statusSaving ? <i className="fa-solid fa-spinner fa-spin"></i> : 'Αποθήκευση'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Notes sidebar */}
      {notesId && (
        <>
          <div className="notes-overlay" onClick={() => setNotesId(null)} />
          <aside className="notes-sidebar">
            <div className="notes-header">
              <h3>
                <i className="fa-solid fa-comment"></i>
                Σχόλια – {notesSub?.lead_info?.name || 'Πελάτης'}
              </h3>
              <button className="notes-close" onClick={() => setNotesId(null)}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="notes-list">
              {notes.length === 0 ? (
                <div className="notes-empty">
                  <i className="fa-regular fa-comment-dots"></i>
                  <p>Δεν υπάρχουν σχόλια ακόμα</p>
                </div>
              ) : (
                notes.map((n, i) => (
                  <div key={i} className="note-item">
                    <div className="note-meta">
                      <span className="note-author"><i className="fa-solid fa-user"></i> {n.author || 'Άγνωστος'}</span>
                      <span className="note-date">{formatDate(n.created_at)}</span>
                    </div>
                    <p className="note-text">{n.text}</p>
                    <div className="note-footer">
                      <button className="note-delete" onClick={() => deleteNote(notesId, i)}>
                        <i className="fa-solid fa-trash"></i>
                      </button>
                    </div>
                  </div>
                ))
              )}
              <div ref={notesEndRef} />
            </div>

            <div className="notes-input-wrap">
              <textarea
                className="notes-input"
                placeholder="Γράψε σχόλιο..."
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    addNote(notesId)
                  }
                }}
                rows={3}
              />
              <button
                className="notes-send"
                onClick={() => addNote(notesId)}
                disabled={!noteText.trim() || notesSaving}
              >
                {notesSaving
                  ? <i className="fa-solid fa-spinner fa-spin"></i>
                  : <i className="fa-solid fa-paper-plane"></i>
                }
              </button>
            </div>
          </aside>
        </>
      )}
    </div>
  )
}
