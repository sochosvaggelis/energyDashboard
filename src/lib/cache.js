const DEFAULT_TTL = 2 * 60 * 1000 // 2 λεπτά

export function cacheGet(key) {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const { data, expiry } = JSON.parse(raw)
    if (Date.now() > expiry) {
      sessionStorage.removeItem(key)
      return null
    }
    return data
  } catch {
    sessionStorage.removeItem(key)
    return null
  }
}

export function cacheSet(key, data, ttl = DEFAULT_TTL) {
  sessionStorage.setItem(key, JSON.stringify({ data, expiry: Date.now() + ttl }))
}

export function cacheInvalidate(...keys) {
  keys.forEach(k => sessionStorage.removeItem(k))
}

export function cacheClearAll() {
  const toRemove = []
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i)
    if (key && key.startsWith('admin_')) toRemove.push(key)
  }
  toRemove.forEach(k => sessionStorage.removeItem(k))
}
