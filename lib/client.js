window.__ModuleLoader__.load({
  id: "@guojing6/dsh-deepseek-chat",
  factory: () => {
const CHAT_URL = "https://chat.deepseek.com/";
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

// Desktop-only in-application DeepSeek Chat view: the product switch stays
// inside the window the way the Codex desktop client switches between its
// products, instead of handing the URL to the system browser.
//
// The shell admits a <webview> only when it carries a lease its main process
// issued, so this acquires one through the same bridge the built-in sidebar
// browser uses. The guest is kept alive while hidden, so switching back and
// forth is instant; it is released only on dispose.
//
// Nothing is injected into the guest: the page runs exactly as it would in a
// browser, and the only way back is this plugin's own floating control (plus the
// sidebar brand, which stays on screen).
//
// Consequences of that shell policy, by design: the guest runs in its own
// storage partition (a DeepSeek sign-in here is separate from the DSH session
// and does not survive an application restart), permissions are refused, and
// downloads are blocked.
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
  const bridge = () => window.dshDesktop?.browser;
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
    view.addEventListener("dom-ready", () => {
      // The guest inherits the application user agent, whose Electron and product
      // tokens make the page treat this as an unofficial client and show its
      // environment warning. setUserAgent changes the guest webContents directly,
      // so it survives the shell clearing webPreferences in will-attach-webview,
      // and the bootstrap document is still loaded, so this precedes the real page.
      view.setUserAgent(standardUserAgent());
      void view.loadURL(CHAT_URL).catch((error) => {
        console.error("dsh-deepseek-chat: failed to open DeepSeek Chat", error);
      });
    }, { once: true });
    // A link that asks for a new window opens in this same view.
    unsubscribeOpen = api.onOpenRequested(reservation.lease, (url) => {
      void view.loadURL(url).catch((error) => {
        console.error("dsh-deepseek-chat: failed to follow a link", error);
      });
    });
    host.appendChild(view);
    element = view;
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
  const hide = () => { host.hidden = true; };
  const isVisible = () => !host.hidden;
  const toggle = async () => { if (isVisible()) hide(); else await show(); };
  const dispose = () => {
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
    [${TRIGGER_ATTR}] { gap:6px; border-radius:8px; }
    [${TRIGGER_ATTR}]:hover { background:#f0f0f0; }
    [${TRIGGER_ATTR}]:focus-visible { outline:2px solid #4d6bfe; outline-offset:2px; }
    /* The view lands on the frame's content column: the insets are read from the
       frame at show time (readFrameInsets), so the caption strip and the sidebar
       stay in place. overflow:hidden lets the top-left radius clip the guest. */
    #${CHAT_VIEW_ID} { position:fixed; inset:0; z-index:9998; background:#fff; overflow:hidden; }
    #${CHAT_VIEW_ID}[hidden] { display:none; }
    #${CHAT_VIEW_ID} webview { width:100%; height:100%; border:0; }
    /* Floating control in the lower-right, lifted clear of the guest's composer
       so it never covers the send button: a 42px circular hit area whose visible
       shape is the icon's own disc, so the button itself stays transparent and
       only the glyph colour is themed. */
    #${CHAT_VIEW_BACK_ID} { position:absolute; right:24px; bottom:150px; z-index:10; display:inline-flex; align-items:center; justify-content:center; width:42px; height:42px; padding:0; border:0; border-radius:50%; background:transparent; color:var(--dsw-alias-label-secondary, #8a8f98); cursor:pointer; filter:drop-shadow(0 1px 5px #0000001f); transition:color 120ms ease; }
    #${CHAT_VIEW_BACK_ID}:hover { color:var(--dsw-alias-label-primary, #171717); }
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
