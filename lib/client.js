window.__ModuleLoader__.load({
  id: "@guojing6/dsh-deepseek-chat",
  factory: () => {
const CHAT_ORIGIN = "https://chat.deepseek.com";
const CHAT_URL = CHAT_ORIGIN + "/";
// Every unknown path on this host answers with the application document itself, so
// the seed page has to be a path that really exists as a static file: this one is
// served as a 31-byte text/plain document that does not boot the application.
const CHAT_SEED_URL = CHAT_ORIGIN + "/robots.txt";
// Host-page storage key holding the last snapshot of the guest's storage.
const SESSION_KEY = "dsh-deepseek-chat:chat-session";
const SESSION_VERSION = 1;
const SNAPSHOT_INTERVAL_MS = 15000;
const SNAPSHOT_LIMIT = 200000;
// The entries the application needs to consider itself signed in. Everything else
// it keeps is a preference or a cache, so a large guest store may drop those but
// never these.
const SESSION_ESSENTIAL_KEYS = ["userToken", "__appKit_userInfo"];
const TRIGGER_ATTR = "data-dsh-product-trigger";
const CHAT_VIEW_ID = "dsh-chat-view";
const CHAT_VIEW_BACK_ID = "dsh-chat-view-back";
const CAPTURE_EVENTS = ["pointerdown", "mousedown", "touchstart"];
// The Desktop shell serves the application window from dsh-app://app/ and its
// preload marks <html> with data-platform (darwin or win32); the Web surface is
// http(s) and has neither. The protocol is checked first because the preload's
// mark is deferred to DOMContentLoaded when it runs before the document root.
const IS_DESKTOP = window.location.protocol === "dsh-app:"
  || document.documentElement.dataset.platform !== undefined;
// Match the host brand element.
// Its class name carries a build-time CSS-module hash that differs between the
// Web and Desktop builds (the packaged Desktop ships `_2H3hWW_brandIdentity`),
// so match the stable local name, not one hash.
// The brand is distinct from the New Session and sidebar collapse buttons.
const BRAND_IDENTITY_SELECTOR = 'span[class*="brandIdentity"]';
function findBrandButton() {
  const identity = document.querySelector(BRAND_IDENTITY_SELECTOR);
  if (!identity) return null;
  // Web and Windows/Linux Desktop wrap the brand in the New Session button;
  // macOS Desktop keeps it a plain span inside the window-drag logo row.
  return identity.closest("button") ?? identity.parentElement ?? null;
}

// The frame publishes its own insets as custom properties on the frame element
// (the caption height is the exception: the Windows preload sets that one on
// <html>), so read them where they live and mirror them onto the view. The guest
// then lands exactly on the content column, leaving the caption strip and the
// sidebar in place instead of covering them.
function readFrameInsets() {
  const identity = document.querySelector(BRAND_IDENTITY_SELECTOR);
  let frame = identity;
  while (frame !== null && frame.parentElement !== null && frame.parentElement.id !== "root") {
    frame = frame.parentElement;
  }
  const frameStyle = frame === null || frame.parentElement?.id !== "root" ? null : getComputedStyle(frame);
  const read = (style, name) => (style === null ? "" : style.getPropertyValue(name).trim());
  return {
    top: read(getComputedStyle(document.documentElement), "--dsh-windows-titlebar-height") || "0px",
    left: read(frameStyle, "--dsh-windows-sidebar-width") || "0px",
    radius: read(frameStyle, "--dsh-windows-content-radius") || "0px",
  };
}

// Rebuild the standard Chromium user agent from the host agent: keep its platform
// clause and Chromium version, drop the Electron and product tokens that mark an
// embedded view (DeepSeek Chat answers those with an environment warning).
function standardUserAgent() {
  const source = navigator.userAgent;
  const platform = /\(([^)]*)\)/.exec(source)?.[1] ?? "Windows NT 10.0; Win64; x64";
  const chromium = /Chrome\/([\d.]+)/.exec(source)?.[1] ?? "130.0.0.0";
  return "Mozilla/5.0 (" + platform + ") AppleWebKit/537.36 (KHTML, like Gecko) Chrome/" + chromium + " Safari/537.36";
}

// DeepSeek Chat keeps its sign-in in localStorage (a `userToken` handle plus
// `__appKit_userInfo`) and marks the cookies that matter HttpOnly. The shell hands
// every guest an in-memory partition named after a fresh UUID, so nothing inside
// the guest outlives the process and the page asks for a new sign-in on every
// restart. This mirrors the guest's storage into the application page's own
// localStorage — `dsh-app` is registered as a standard, secure scheme on the
// persistent default session, so that copy does survive — and writes it back into
// a same-origin seed document before the application document boots, because the
// page reads its token once, at startup.
//
// Reads the guest's storage as JSON, or the empty string when it is unavailable.
const READ_STORAGE = `(() => {
  const required = ${JSON.stringify(SESSION_ESSENTIAL_KEYS)};
  const local = {};
  let size = 0;
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key === null) continue;
      const value = localStorage.getItem(key);
      if (value === null) continue;
      // A single oversized cache must not crowd out the small entries after it, so
      // the cap only rejects the entry that would cross it.
      if (!required.includes(key) && size + key.length + value.length > ${SNAPSHOT_LIMIT}) continue;
      size += key.length + value.length;
      local[key] = value;
    }
  } catch (error) { return ""; }
  return JSON.stringify({ local, cookies: document.cookie || "" });
})()`;

// Writes a snapshot back into the guest's storage, returning the restored sign-in
// token so a failure to seed is visible rather than silent.
function writeStorageScript(snapshot) {
  return `(() => {
  const data = ${JSON.stringify(snapshot)};
  try {
    for (const key of Object.keys(data.local)) localStorage.setItem(key, data.local[key]);
  } catch (error) { return ""; }
  for (const pair of String(data.cookies || "").split(";")) {
    const entry = pair.trim();
    if (entry !== "") document.cookie = entry + "; path=/; max-age=31536000; SameSite=Lax; Secure";
  }
  return localStorage.getItem("userToken") || "";
})()`;
}

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    const usable = parsed !== null && typeof parsed === "object"
      && parsed.version === SESSION_VERSION && parsed.origin === CHAT_ORIGIN
      && parsed.local !== null && typeof parsed.local === "object";
    return usable ? parsed : null;
  } catch (error) { return null; }
}

function writeSession(snapshot) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(snapshot));
  } catch (error) {
    // The host origin's quota is its own; a failed mirror only costs the next sign-in.
    console.error("dsh-deepseek-chat: could not store the DeepSeek session", error);
  }
}

// Desktop-only in-application DeepSeek Chat view: the product switch stays
// inside the window the way the Codex desktop client switches between its
// products, instead of handing the URL to the system browser.
//
// The shell admits a <webview> only when it carries a lease its main process
// issued, so this acquires one through the same bridge the built-in sidebar
// browser uses. The guest is kept alive while hidden, so switching back and
// forth is instant; it is released only on dispose.
//
// The page itself is never rewritten: the only guest script this plugin runs reads
// and writes the guest's own storage, and the only way back is this plugin's own
// floating control (plus the sidebar brand, which stays on screen).
//
// The rest of the shell's policy still applies as designed: permissions are
// refused and downloads are blocked.
const CHAT_WORKSPACE = "dsh-deepseek-chat";
function createChatView() {
  const host = document.createElement("div");
  host.id = CHAT_VIEW_ID;
  host.hidden = true;
  const back = document.createElement("button");
  back.type = "button";
  back.id = CHAT_VIEW_BACK_ID;
  // Filled disc with the arrow knocked out, from the icon supplied for this
  // control. The disc *is* the button shape, so the CSS around it stays
  // transparent and only the colour is themed.
  back.innerHTML = '<svg viewBox="0 0 1025 1024" aria-hidden="true" focusable="false"><path fill="currentColor" d="M513 0C230.2 0 1 229.2 1 512s229.2 512 512 512 512-229.2 512-512S795.8 0 513 0z m335.7 766.4s-26.4-42.6-37.1-57.5C801 694 755.9 638.4 686 606.1c-69.9-32.2-186.8-26.5-186.8-26.5v134.2L177.1 485.7l322.1-228.2V393s77.4 5.8 117.8 14.2c68.1 14.1 105.5 47.7 105.5 47.7 39.9 23.8 88.8 87.9 109.2 165.2 20.4 77.2 17 146.3 17 146.3z"/></svg>';
  back.setAttribute("aria-label", "返回 DeepSeek Harness");
  back.title = "返回 DeepSeek Harness";
  host.appendChild(back);
  document.body.appendChild(host);
  let element = null;
  let lease = null;
  let unsubscribeOpen = null;
  let opening = null;
  let snapshotTimer = null;
  const bridge = () => window.dshDesktop?.browser;
  // Only a sign-in the page still holds is worth keeping. Writing a signed-out
  // snapshot back would resurrect nothing, while overwriting one the page is still
  // validating would cost the session for a single bad load.
  const remember = async () => {
    const view = element;
    if (view === null) return;
    const url = view.getURL();
    if (typeof url !== "string" || !url.startsWith(CHAT_ORIGIN + "/") || url === CHAT_SEED_URL) return;
    let raw;
    try { raw = await view.executeJavaScript(READ_STORAGE); } catch (error) { return; }
    if (typeof raw !== "string" || raw === "") return;
    let parsed;
    try { parsed = JSON.parse(raw); } catch (error) { return; }
    const local = parsed === null || typeof parsed !== "object" ? {} : parsed.local ?? {};
    if (typeof local.userToken !== "string" || local.userToken === "") return;
    writeSession({
      version: SESSION_VERSION,
      origin: CHAT_ORIGIN,
      savedAt: Date.now(),
      local,
      cookies: typeof parsed.cookies === "string" ? parsed.cookies : "",
    });
  };
  const build = async () => {
    const api = bridge();
    if (!api) throw new Error("desktop browser bridge is unavailable");
    const reservation = await api.acquire(CHAT_WORKSPACE);
    lease = reservation.lease;
    const view = document.createElement("webview");
    // The bootstrap document carries the lease; the shell rejects a guest whose
    // src or partition does not match the reservation it issued.
    view.setAttribute("name", reservation.lease);
    view.setAttribute("partition", reservation.partition);
    view.setAttribute("allowpopups", "");
    view.setAttribute("src", "about:blank#" + reservation.lease);
    element = view;
    // The guest walks bootstrap (about:blank) → seed (a same-origin static document
    // that does not boot the application) → the application document. Seeding before
    // the application document starts is what makes a restored sign-in take effect:
    // the page reads its token once, at startup, and never looks again.
    let stage = "bootstrap";
    const snapshot = readSession();
    const open = (url, onFailure) => {
      view.loadURL(url).catch((error) => {
        console.error("dsh-deepseek-chat: failed to open " + url, error);
        if (onFailure !== undefined) onFailure();
      });
    };
    const enter = () => { stage = "app"; open(CHAT_URL); };
    view.addEventListener("dom-ready", () => {
      if (stage === "bootstrap") {
        // The guest inherits the application user agent, whose Electron and product
        // tokens make the page treat this as an unofficial client and show its
        // environment warning. setUserAgent changes the guest webContents directly,
        // so it survives the shell clearing webPreferences in will-attach-webview,
        // and the bootstrap document is still loaded, so this precedes the real page.
        view.setUserAgent(standardUserAgent());
        // Without a snapshot there is nothing to seed, so go straight in.
        if (snapshot === null) { enter(); return; }
        stage = "seed";
        open(CHAT_SEED_URL, enter);
        return;
      }
      if (stage === "seed") {
        stage = "app";
        view.executeJavaScript(writeStorageScript(snapshot))
          .catch((error) => {
            console.error("dsh-deepseek-chat: could not restore the DeepSeek sign-in", error);
          })
          .then(() => { open(CHAT_URL); });
        return;
      }
      void remember();
    });
    // A link that asks for a new window opens in this same view.
    unsubscribeOpen = api.onOpenRequested(reservation.lease, (url) => {
      void view.loadURL(url).catch((error) => {
        console.error("dsh-deepseek-chat: failed to follow a link", error);
      });
    });
    host.appendChild(view);
    // A sign-in is written to storage without navigating, so poll while the guest
    // lives and leave a restart something to restore.
    snapshotTimer = window.setInterval(() => { void remember(); }, SNAPSHOT_INTERVAL_MS);
  };
  const show = async () => {
    // Re-read on every switch: the sidebar width and the radius follow the
    // frame's current layout (drag, collapse) rather than a value captured once.
    const insets = readFrameInsets();
    host.style.top = insets.top;
    host.style.left = insets.left;
    host.style.borderTopLeftRadius = insets.radius;
    host.hidden = false;
    if (element === null) {
      opening ??= build().finally(() => { opening = null; });
      await opening;
    }
  };
  const hide = () => { host.hidden = true; void remember(); };
  const isVisible = () => !host.hidden;
  const toggle = async () => { if (isVisible()) hide(); else await show(); };
  const dispose = () => {
    if (snapshotTimer !== null) { window.clearInterval(snapshotTimer); snapshotTimer = null; }
    unsubscribeOpen?.();
    unsubscribeOpen = null;
    const api = bridge();
    if (lease !== null && api) void api.release(lease).catch(() => {});
    lease = null;
    element?.remove();
    element = null;
    host.remove();
  };
  back.addEventListener("click", hide);
  return { show, hide, toggle, isVisible, dispose };
}

function createSwitcher() {
  const style = document.createElement("style");
  style.textContent = `
    /* The host's brand is a full-row control: .brand is flex:1 and spans the whole
       logo row, so chrome painted on the trigger itself draws a long empty band
       beside the wordmark. Paint the wordmark instead, which is what the pointer
       actually aims at. The negative margin cancels the padding so the mark does
       not move, and 4px matches the brand's own left inset, keeping the chip inside
       the row's overflow clip. */
    [${TRIGGER_ATTR}] > ${BRAND_IDENTITY_SELECTOR} { padding:2px 4px; margin:-2px -4px; border-radius:6px; }
    [${TRIGGER_ATTR}]:hover > ${BRAND_IDENTITY_SELECTOR} { background:#f0f0f0; }
    [${TRIGGER_ATTR}]:focus-visible { outline:none; }
    [${TRIGGER_ATTR}]:focus-visible > ${BRAND_IDENTITY_SELECTOR} { outline:2px solid #4d6bfe; outline-offset:-2px; }
    /* The view lands on the frame's content column: the insets are read from the
       frame at show time (readFrameInsets), so the caption strip and the sidebar
       stay in place. overflow:hidden lets the top-left radius clip the guest. */
    #${CHAT_VIEW_ID} { position:fixed; inset:0; z-index:9998; background:#fff; overflow:hidden; }
    #${CHAT_VIEW_ID}[hidden] { display:none; }
    #${CHAT_VIEW_ID} webview { width:100%; height:100%; border:0; }
    /* Floating control in the lower-right, lifted clear of the guest's composer
       so it never covers the send button: a 42px circular hit area whose visible
       shape is the icon's own disc. The disc uses a deliberately light grey — the
       theme's secondary label colour reads as a dark blob against a white page. */
    #${CHAT_VIEW_BACK_ID} { position:absolute; right:24px; bottom:150px; z-index:10; display:inline-flex; align-items:center; justify-content:center; width:42px; height:42px; padding:0; border:0; border-radius:50%; background:transparent; color:#b0b5bd; cursor:pointer; filter:drop-shadow(0 1px 5px #0000001f); transition:color 120ms ease; }
    #${CHAT_VIEW_BACK_ID}:hover { color:#8b9199; }
    #${CHAT_VIEW_BACK_ID}:focus-visible { outline:2px solid var(--dsw-alias-state-business-primary, #4d6bfe); outline-offset:2px; }
    #${CHAT_VIEW_BACK_ID} svg { display:block; width:100%; height:100%; }
  `;
  document.head.appendChild(style);
  // Web has no shell to host a guest, so it keeps the plain navigation.
  const chatView = IS_DESKTOP ? createChatView() : null;
  // The sidebar brand switches both ways: it stays clickable while the guest is
  // up, so the same logo that enters also returns.
  const toggleChat = () => {
    if (chatView === null) { window.location.assign(CHAT_URL); return; }
    void chatView.toggle().catch((error) => {
      chatView.hide();
      console.error("dsh-deepseek-chat: in-app view unavailable, opening the browser instead", error);
      window.open(CHAT_URL, "_blank");
    });
  };
  let trigger = null;
  let original = null;
  const attributes = [TRIGGER_ATTR, "aria-label", "title", "role", "tabindex"];
  const swallowHostAction = (event) => {
    event.preventDefault();
    // Capture on the brand prevents the host React handlers from creating a session.
    event.stopImmediatePropagation();
  };
  const activate = (event) => {
    swallowHostAction(event);
    toggleChat();
  };
  const activateFromKeyboard = (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    activate(event);
  };
  const detach = () => {
    if (!trigger) return;
    for (const name of CAPTURE_EVENTS) trigger.removeEventListener(name, swallowHostAction, true);
    trigger.removeEventListener("click", activate, true);
    trigger.removeEventListener("keydown", activateFromKeyboard, true);
    for (const [name, value] of original) {
      if (value === null) trigger.removeAttribute(name); else trigger.setAttribute(name, value);
    }
    trigger = null;
  };
  const bind = () => {
    trigger = findBrandButton();
    if (!trigger) return;
    observer.disconnect();
    original = attributes.map((name) => [name, trigger.getAttribute(name)]);
    trigger.setAttribute(TRIGGER_ATTR, "");
    trigger.setAttribute("aria-label", "切换 DeepSeek Chat");
    trigger.setAttribute("title", "切换 DeepSeek Chat");
    if (trigger.tagName !== "BUTTON") {
      // macOS Desktop: the brand is a window-drag span, not a button. A button
      // role and a tab stop opt it out of the shell's drag rule and keep it
      // keyboard reachable.
      trigger.setAttribute("role", "button");
      trigger.setAttribute("tabindex", "0");
    }
    for (const name of CAPTURE_EVENTS) trigger.addEventListener(name, swallowHostAction, true);
    trigger.addEventListener("click", activate, true);
    trigger.addEventListener("keydown", activateFromKeyboard, true);
  };
  // Wait for the first title only; do not rebind after sidebar reconstruction.
  const observer = new MutationObserver(bind);
  observer.observe(document.body, { childList: true, subtree: true });
  bind();
  return () => {
    observer.disconnect();
    detach();
    chatView?.dispose();
    style.remove();
  };
}
function apply(ctx) {
  ctx.effect(createSwitcher);
}
return { apply };
  }
});
