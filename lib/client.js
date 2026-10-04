window.__ModuleLoader__.load({
  id: "@guojing6/dsh-deepseek-chat",
  factory: () => {
const CHAT_URL = "https://chat.deepseek.com/";
const TRIGGER_ATTR = "data-dsh-product-trigger";
const CHAT_VIEW_ID = "dsh-chat-view";
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
// Consequences of that shell policy, by design: the guest runs in its own
// storage partition (a DeepSeek sign-in here is separate from the DSH session
// and does not survive an application restart), permissions are refused, and
// downloads are blocked.
const CHAT_WORKSPACE = "dsh-deepseek-chat";
function createChatView() {
  const host = document.createElement("div");
  host.id = CHAT_VIEW_ID;
  host.hidden = true;
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
  `;
  document.head.appendChild(style);
  // Web has no shell to host a guest, so it keeps the plain navigation.
  const chatView = IS_DESKTOP ? createChatView() : null;
  // The brand is the only switch, in both directions: with the sidebar on screen
  // it stays clickable while the guest is up, so the same logo that enters also
  // returns. No separate back control and no guest-side script are needed.
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
