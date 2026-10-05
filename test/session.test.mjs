// Exercises the Desktop session mirror: the two guest scripts that read and write
// the embedded page's storage, and the host-side snapshot they feed. The plugin is
// loaded through a stubbed application window, so no Electron or jsdom is needed.
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'

const SOURCE = new URL('../lib/client.js', import.meta.url)
const CHAT_ORIGIN = 'https://chat.deepseek.com'
const TOKEN = JSON.stringify({ value: 'tok-123', __version: '0' })

function storage(seed = {}) {
  const map = new Map(Object.entries(seed))
  return {
    get length() { return map.size },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(String(key), String(value)) },
    removeItem: (key) => { map.delete(key) },
    clear: () => { map.clear() },
  }
}

function cookieJar(initial = '') {
  const jar = new Map()
  for (const part of initial.split(';')) {
    const pair = part.trim()
    const at = pair.indexOf('=')
    if (at > 0) jar.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim())
  }
  return {
    get cookie() { return [...jar].map(([name, value]) => `${name}=${value}`).join('; ') },
    set cookie(value) {
      const pair = String(value).split(';')[0]
      const at = pair.indexOf('=')
      if (at > 0) jar.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim())
    },
  }
}

/** Run one guest script against a stubbed origin and return its completion value. */
function runGuest(script, localStorage, document) {
  const context = vm.createContext({ localStorage, document, JSON, Object, String, console })
  return vm.runInContext(script, context)
}

/** Load the plugin factory with a stubbed application window and expose its internals. */
function loadPlugin() {
  const source = readFileSync(SOURCE, 'utf8')
  const patched = source.replace(
    'return { apply };',
    'globalThis.__probe = { READ_STORAGE, writeStorageScript, readSession, writeSession, SESSION_KEY, SESSION_VERSION, CHAT_ORIGIN };\nreturn { apply };',
  )
  // Fail loudly if the factory's shape changes rather than passing on a stale probe.
  assert.notEqual(patched, source, 'could not expose the plugin internals for testing')

  const hostStorage = storage()
  const host = {
    window: {
      __ModuleLoader__: { load: (module) => { host.__factory = module.factory } },
      location: { protocol: 'dsh-app:' },
      setInterval: () => 0,
      clearInterval: () => {},
    },
    document: { documentElement: { dataset: {} } },
    localStorage: hostStorage,
    console,
    Date,
    JSON,
    Object,
    String,
  }
  vm.createContext(host)
  vm.runInContext(patched, host)
  assert.equal(typeof host.__factory, 'function', 'factory not captured')
  host.__factory()
  return { probe: host.__probe, hostStorage }
}

describe('guest storage snapshot', () => {
  it('keeps the sign-in entries and drops oversized caches', () => {
    const { probe } = loadPlugin()
    // The oversized cache comes first on purpose: it must not crowd out the small
    // entries that follow it.
    const guest = storage({
      __oversized_cache: 'x'.repeat(300000),
      userToken: TOKEN,
      __appKit_userInfo: '{"id":42}',
      theme: 'dark',
      __session_page_size__: '30',
    })
    const raw = runGuest(probe.READ_STORAGE, guest, cookieJar('readable=1'))
    assert.equal(typeof raw, 'string')
    const snapshot = JSON.parse(raw)
    assert.equal(snapshot.local.userToken, TOKEN)
    assert.equal(snapshot.local.__appKit_userInfo, '{"id":42}')
    assert.equal(snapshot.local.theme, 'dark')
    assert.equal(snapshot.local.__session_page_size__, '30')
    assert.equal(snapshot.cookies, 'readable=1')
    assert.ok(!('__oversized_cache' in snapshot.local), 'an oversized cache must not be carried')
    assert.ok(raw.length < 2000, `the snapshot must stay small, got ${raw.length}`)
  })

  it('reports unavailable storage instead of throwing', () => {
    const { probe } = loadPlugin()
    const guest = storage()
    Object.defineProperty(guest, 'length', { get() { throw new Error('denied') } })
    assert.equal(runGuest(probe.READ_STORAGE, guest, cookieJar()), '')
  })
})

describe('guest storage restore', () => {
  it('writes the snapshot back and reports the restored token', () => {
    const { probe } = loadPlugin()
    const fresh = storage()
    const document = cookieJar()
    const restored = runGuest(
      probe.writeStorageScript({ local: { userToken: TOKEN, theme: 'dark' }, cookies: 'readable=1' }),
      fresh,
      document,
    )
    assert.equal(restored, TOKEN)
    assert.equal(fresh.getItem('userToken'), TOKEN)
    assert.equal(fresh.getItem('theme'), 'dark')
    assert.equal(document.cookie, 'readable=1')
  })

  it('reports an empty token when the write is refused', () => {
    const { probe } = loadPlugin()
    const guest = storage()
    guest.setItem = () => { throw new Error('quota') }
    assert.equal(runGuest(probe.writeStorageScript({ local: { userToken: TOKEN }, cookies: '' }), guest, cookieJar()), '')
  })
})

describe('host-side snapshot', () => {
  it('round-trips a stored session', () => {
    const { probe } = loadPlugin()
    probe.writeSession({ version: probe.SESSION_VERSION, origin: CHAT_ORIGIN, savedAt: 1, local: { userToken: TOKEN }, cookies: 'readable=1' })
    const reloaded = probe.readSession()
    assert.ok(reloaded !== null)
    assert.equal(reloaded.local.userToken, TOKEN)
    assert.equal(reloaded.cookies, 'readable=1')
  })

  it('rejects a snapshot it cannot trust', () => {
    const { probe, hostStorage } = loadPlugin()
    const rejected = [
      { version: probe.SESSION_VERSION + 1, origin: CHAT_ORIGIN, local: {} },
      { version: probe.SESSION_VERSION, origin: 'https://example.com', local: {} },
      { version: probe.SESSION_VERSION, origin: CHAT_ORIGIN, local: null },
    ]
    for (const value of rejected) {
      hostStorage.setItem(probe.SESSION_KEY, JSON.stringify(value))
      assert.equal(probe.readSession(), null, `must reject ${JSON.stringify(value)}`)
    }
    hostStorage.setItem(probe.SESSION_KEY, 'not json')
    assert.equal(probe.readSession(), null, 'must reject corrupt storage')
    hostStorage.removeItem(probe.SESSION_KEY)
    assert.equal(probe.readSession(), null, 'must report a missing snapshot')
  })
})
