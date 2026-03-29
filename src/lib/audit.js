import { supabase } from './supabase'

/**
 * Log an admin action to the audit_log table.
 * Fire-and-forget — does not throw on failure.
 */
export async function logAction(action, { entity, entityId, details } = {}) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('audit_log').insert({
      user_id: user?.id || null,
      user_email: user?.email || null,
      action,
      entity: entity || null,
      entity_id: entityId || null,
      details: details || null,
    })
  } catch (err) {
    // Audit should never block the main operation, but log in dev for debugging
    if (import.meta.env.DEV) console.warn('Audit log failed:', action, err)
  }
}
