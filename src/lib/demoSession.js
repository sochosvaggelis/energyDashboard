import { supabase } from './supabase'

const SESSION_KEY = 'demo_session_id'
const EXPIRES_KEY = 'demo_expires_at'

function isExpired() {
  const exp = localStorage.getItem(EXPIRES_KEY)
  return !exp || new Date(exp) < new Date()
}

function clearStored() {
  localStorage.removeItem(SESSION_KEY)
  localStorage.removeItem(EXPIRES_KEY)
}

export async function initDemoSession() {
  if (isExpired()) clearStored()

  const id = localStorage.getItem(SESSION_KEY)
  if (id) return { id, expires_at: localStorage.getItem(EXPIRES_KEY) }

  const { data, error } = await supabase
    .from('demo_sessions')
    .insert({})
    .select('id, expires_at')
    .single()

  if (error || !data) return null

  localStorage.setItem(SESSION_KEY, data.id)
  localStorage.setItem(EXPIRES_KEY, data.expires_at)
  return data
}
