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
    'globalThis.__probe = { READ_STORAGE, writeStorageScript, readSession, writeSession, isChatUrl, isGuestPage, SESSION_KEY, SESSION_VERSION, CHAT_ORIGIN };\nreturn { apply };',
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

describe('guest location', () => {
  it('separates the chat application from a page opened from a conversation', () => {
    const { probe } = loadPlugin()
    for (const url of [CHAT_ORIGIN + '/', CHAT_ORIGIN + '/a/chat/s/8f2', CHAT_ORIGIN + '/sign_in']) {
      assert.equal(probe.isChatUrl(url), true, `${url} is the application`)
      assert.equal(probe.isGuestPage(url), false, `${url} is the application, not another page`)
    }
    for (const url of ['https://example.com/article', 'https://chat.deepseek.com.evil.test/', 'http://chat.deepseek.com.other/']) {
      assert.equal(probe.isChatUrl(url), false, `${url} is not the application`)
      assert.equal(probe.isGuestPage(url), true, `${url} is a page the user opened from a conversation`)
    }
    for (const url of [CHAT_ORIGIN + '/robots.txt', 'about:blank#lease', 'dsh-app://app/', '', undefined]) {
      assert.equal(probe.isChatUrl(url), false, `${url} is not the chat interface`)
      assert.equal(probe.isGuestPage(url), false, `${url} is not a page the user opened either`)
    }
  })
})

/**
 * A DOM stand-in rich enough to activate the plugin. `brand` makes the sidebar title
 * findable, which is what turns the switcher on; `guestUrl` is what the stand-in guest
 * reports as its current page.
 */
function fakeDom(options = {}) {
  const make = (tag) => {
    const attributes = new Map()
    const listeners = []
    const node = {
      tagName: tag.toUpperCase(),
      id: '',
      type: '',
      title: '',
      hidden: false,
      style: {},
      children: [],
      parentElement: null,
      attributes,
      listeners,
      textContent: '',
      innerHTML: '',
      setAttribute(name, value) { attributes.set(name, String(value)) },
      removeAttribute(name) { attributes.delete(name) },
      getAttribute(name) { return attributes.has(name) ? attributes.get(name) : null },
      appendChild(child) { this.children.push(child); return child },
      removeChild(child) { this.children = this.children.filter((entry) => entry !== child) },
      remove() {},
      addEventListener(type, listener) { listeners.push([type, listener]) },
      removeEventListener() {},
      contains: () => false,
      closest: () => null,
    }
    if (tag === 'webview') {
      // Electron answers every one of these only after the guest is attached and has
      // emitted dom-ready; the stand-in keeps that rule, so a test fails loudly when the
      // plugin reads the guest too early. Calls the plugin makes are recorded on
      // `options`, which the caller keeps.
      const expectReady = () => {
        if (options.guestReady !== true) {
          throw new Error('The WebView must be attached to the DOM and the dom-ready event emitted before this method can be called.')
        }
      }
      node.getURL = () => { expectReady(); return options.guestUrl ?? '' }
      node.canGoBack = () => { expectReady(); return options.canGoBack === true }
      node.goBack = () => { expectReady(); options.goBacks = (options.goBacks ?? 0) + 1 }
      node.loadURL = (url) => { expectReady(); (options.loads ??= []).push(url); return Promise.resolve() }
      node.setUserAgent = () => { expectReady() }
      node.executeJavaScript = () => { expectReady(); return Promise.resolve('') }
    }
    return node
  }
  const brandIdentity = make('span')
  const brandButton = make('button')
  brandIdentity.closest = (selector) => (selector === 'button' ? brandButton : null)
  // The shell's frame publishes its column solve, so the view can read the insets.
  const frame = make('div')
  const root = make('div')
  root.id = 'root'
  frame.parentElement = root
  brandIdentity.parentElement = brandButton
  brandButton.parentElement = frame
  const documentElement = make('html')
  documentElement.dataset = {}
  const documentListeners = new Map()
  const document = {
    documentElement,
    head: make('head'),
    body: make('body'),
    createElement: make,
    querySelector: (selector) => (options.brand === true && selector.includes('brandIdentity') ? brandIdentity : null),
    addEventListener: (type, listener) => { documentListeners.set(type, listener) },
    removeEventListener: (type) => { documentListeners.delete(type) },
  }
  return { document, brandIdentity, brandButton, documentListeners }
}

/** Load the real source — no probe patch — against a DOM stand-in it can activate on. */
function loadForActivation(options = {}) {
  const source = readFileSync(SOURCE, 'utf8')
  const dom = fakeDom(options)
  const host = {
    window: {
      __ModuleLoader__: { load: (module) => { host.__factory = module.factory } },
      location: { protocol: 'dsh-app:' },
      setInterval: () => 1,
      clearInterval: () => {},
      open: () => {},
      dshDesktop: {
        browser: {
          acquire: () => Promise.resolve({ lease: 'lease-1', partition: 'partition-1' }),
          release: () => Promise.resolve(),
          onOpenRequested: () => () => {},
        },
      },
    },
    document: dom.document,
    localStorage: storage(),
    navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' },
    MutationObserver: class { observe() {} disconnect() {} },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    console,
    Date,
    JSON,
    Object,
    String,
  }
  vm.createContext(host)
  vm.runInContext(source, host)
  assert.equal(typeof host.__factory, 'function', 'factory not captured')
  return { module: host.__factory(), dom }
}

/** Run the plugin and open the view the way the sidebar title does. */
async function openView(options = {}) {
  // The stand-in guest records what the plugin does to it on this same object, so the
  // caller keeps the spies.
  options.brand = true
  const { module, dom } = loadForActivation(options)
  module.apply({ effect: (fn) => { fn(); return () => {} } })
  const click = dom.brandButton.listeners.find(([type]) => type === 'click')[1]
  click({ preventDefault() {}, stopImmediatePropagation() {} })
  // build() awaits the lease round trip before it reveals the view.
  await new Promise((resolve) => setImmediate(resolve))
  const host = dom.document.body.children.find((node) => node.id === 'dsh-chat-view')
  assert.ok(host, 'opening the view must attach its host')
  const back = host.children.find((node) => node.id === 'dsh-chat-view-back')
  assert.ok(back, 'the view must offer the round control')
  const guest = host.children.find((node) => node.tagName === 'WEBVIEW')
  assert.ok(guest, 'opening the view must attach its guest')
  const fire = (type) => {
    for (const [name, listener] of [...guest.listeners]) if (name === type) listener({})
  }
  return {
    dom,
    host,
    back,
    guest,
    options,
    clickControl: () => back.listeners.find(([type]) => type === 'click')[1]({}),
    // The guest attaches and boots, exactly as the real element reports it.
    ready: () => { options.guestReady = true; fire('dom-ready') },
    // The guest lands on another page, the way a link or a route change does.
    navigate: (url) => { options.guestUrl = url; fire('did-navigate') },
  }
}

// Nothing else in this file calls `apply`, and that gap is how a fatal ReferenceError
// inside the activation path once shipped: the module loaded, every helper tested clean,
// and the plugin was dead on Desktop. These cases run the real source end to end.
describe('activation', () => {
  it('activates on desktop and hands the context a teardown', () => {
    const { module } = loadForActivation()
    let dispose = null
    const ctx = { effect: (fn) => { dispose = fn(); return () => {} } }
    assert.doesNotThrow(() => { module.apply(ctx) })
    assert.equal(typeof dispose, 'function', 'apply must give ctx.effect the teardown')
    assert.doesNotThrow(() => { dispose() })
  })

  it('binds the sidebar title and puts the chrome back on teardown', () => {
    const { module, dom } = loadForActivation({ brand: true })
    let dispose = null
    module.apply({ effect: (fn) => { dispose = fn(); return () => {} } })
    assert.equal(dom.brandButton.getAttribute('data-dsh-product-trigger'), '')
    assert.equal(dom.brandButton.getAttribute('aria-label'), '切换 DeepSeek Chat')
    assert.ok(dom.brandButton.listeners.some(([type]) => type === 'click'), 'the brand must answer clicks')
    assert.ok(dom.documentListeners.has('click'), 'the host-click guard must be watching')
    dispose()
    assert.equal(dom.brandButton.getAttribute('data-dsh-product-trigger'), null, 'teardown must restore the title')
    assert.equal(dom.documentListeners.has('click'), false, 'teardown must drop the host-click guard')
  })

  it('reveals the view on the first click, before the guest is ready', async () => {
    // The regression this guards: reading the fresh element's address in the reveal path
    // threw Electron's "must be attached … dom-ready" error, so the first click after a
    // launch handed the URL to the system browser and only the second click showed the view.
    const { host, back, options, clickControl } = await openView({ guestUrl: 'https://example.com/article', canGoBack: true })
    assert.equal(host.hidden, false, 'the first click must open the view, not the system browser')
    assert.equal(back.getAttribute('aria-label'), '返回 DeepSeek Harness', 'without a page there is nothing to go back to inside the view')
    assert.equal(options.goBacks, undefined, 'a guest that is not ready must not be asked anything')
    clickControl()
    assert.equal(host.hidden, true, 'the control keeps its plain meaning until the guest is ready')
  })

  it('returns to the conversation a page was opened from', async () => {
    const { host, back, options, ready, navigate, clickControl } = await openView({ canGoBack: true })
    ready()
    navigate('https://example.com/article')
    assert.equal(back.getAttribute('aria-label'), '返回 DeepSeek Chat', 'the control must say where it goes')
    clickControl()
    assert.equal(options.goBacks, 1, 'the guest must step back to the conversation it came from')
    assert.equal(host.hidden, false, 'the view stays up while the guest is away from the chat interface')
  })

  it('returns to the harness from the chat interface', async () => {
    const { host, back, options, ready, clickControl } = await openView({ guestUrl: CHAT_ORIGIN + '/a/chat/s/8f2' })
    ready()
    assert.equal(back.getAttribute('aria-label'), '返回 DeepSeek Harness', 'the control must say where it goes')
    clickControl()
    assert.equal(host.hidden, true, 'the chat interface has nothing to go back to inside the view')
    assert.equal(options.goBacks, undefined, 'the guest must not be moved')
  })

  it('still leaves the view when the guest is not showing a page', async () => {
    const { host, options, ready, clickControl } = await openView({ guestUrl: 'dsh-app://app/', canGoBack: true })
    ready()
    clickControl()
    assert.equal(host.hidden, true, 'a guest that is not showing a page keeps the plain meaning')
    assert.equal(options.goBacks, undefined)
  })

  it('reopens the last chat interface when the guest cannot step back itself', async () => {
    const conversation = CHAT_ORIGIN + '/a/chat/s/8f2'
    const { options, ready, navigate, clickControl } = await openView({})
    ready()
    navigate(conversation)
    // The user follows a link out of the conversation, then asks the control for the chat
    // interface; the guest reports no usable history, so the recorded address is used.
    navigate('https://example.com/article')
    options.canGoBack = false
    clickControl()
    assert.equal(options.loads.at(-1), conversation, 'the conversation must be reloaded instead of lost')
  })
})
