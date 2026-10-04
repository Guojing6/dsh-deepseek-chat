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
// The injected guest script reports the logo click through a same-origin hash
// change: the shell's navigation policy admits only http(s), so a custom scheme
// could not carry the signal, and a hash change needs no reload.
const CHAT_RETURN_HASH = "dsh-return";
const LOGO_RETURN_SCRIPT = `(() => {
  if (window.__dshDeepseekChatReturn) return;
  window.__dshDeepseekChatReturn = true;
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const hit = target.closest('a, button, [role="button"], img, svg') || target;
    const rect = hit.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    // The mark sits in the page's top-left corner and stays small; anything
    // larger or further in is ordinary page content.
    if (rect.left > 200 || rect.top > 100 || rect.width > 80 || rect.height > 80) return;
    if (!(hit.matches("img, svg") || hit.querySelector("img, svg") !== null)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    location.hash = "${CHAT_RETURN_HASH}";
  }, true);
})();`;
function createChatView() {
  const host = document.createElement("div");
  host.id = CHAT_VIEW_ID;
  host.hidden = true;
  const back = document.createElement("button");
  back.type = "button";
  back.id = CHAT_VIEW_BACK_ID;
  // Short label: the control sits over the guest's own top edge, so it stays
  // narrow; the full meaning lives in the accessible name and tooltip.
  back.textContent = "← 返回";
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
    // DeepSeek Chat's own logo becomes the way back: the injected script takes
    // over a click on the top-left mark and reports it through a same-origin hash
    // change, which the shell's navigation policy admits. Installed on every
    // completed load, so it survives reloads and in-page navigation.
    view.addEventListener("did-finish-load", () => {
      void view.executeJavaScript(LOGO_RETURN_SCRIPT).catch((error) => {
        console.error("dsh-deepseek-chat: failed to install the logo return handler", error);
      });
    });
    view.addEventListener("did-navigate-in-page", () => {
      if (!view.getURL().includes("#" + CHAT_RETURN_HASH)) return;
      // Drop the marker from the address and from the history entry.
      void view.executeJavaScript('history.replaceState(null, "", location.pathname + location.search)').catch(() => {});
      hide();
    });
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
    /* Windows reserves a caption strip above every column: the desktop menubar
       (z-index 1100) and the window controls live there. Start the view below it
       so the strip stays visible and clickable, exactly as AppFrame does with its
       own top padding. */
    #${CHAT_VIEW_ID} { position:fixed; inset:0; z-index:9998; background:#fff; }
    html[data-windows-titlebar] #${CHAT_VIEW_ID} { top:var(--dsh-windows-titlebar-height, 40px); }
    #${CHAT_VIEW_ID}[hidden] { display:none; }
    #${CHAT_VIEW_ID} webview { width:100%; height:100%; border:0; }
    /* The page's own logo is the primary way back, so the fallback control keeps
       clear of both top corners: Windows draws its caption buttons in the
       top-right, macOS its traffic lights in the top-left, and DeepSeek Chat's
       logo sits in the page's top-left on both. */
    #${CHAT_VIEW_BACK_ID} { position:absolute; top:8px; left:50%; transform:translateX(-50%); z-index:10; display:inline-flex; align-items:center; height:26px; padding:0 10px; border:1px solid #e5e5e5; border-radius:7px; background:#ffffffd9; color:#171717; font:inherit; font-size:12px; line-height:1; cursor:pointer; box-shadow:0 1px 6px #0000001f; }
    #${CHAT_VIEW_BACK_ID}:hover { background:#fff; }
    #${CHAT_VIEW_BACK_ID}:focus-visible { outline:2px solid #4d6bfe; outline-offset:2px; }
  `;
  document.head.appendChild(style);
  // Web has no shell to host a guest, so it keeps the plain navigation.
  const chatView = IS_DESKTOP ? createChatView() : null;
  // One click on the brand switches products, matching the guest's own logo,
  // which switches back: the two directions read the same way.
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
