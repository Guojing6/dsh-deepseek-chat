window.__ModuleLoader__.load({
  id: "@guojing6/dsh-deepseek-chat",
  factory: () => {
const CHAT_URL = "https://chat.deepseek.com/";
const MENU_ID = "dsh-product-menu";
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
  const back = document.createElement("button");
  back.type = "button";
  back.id = CHAT_VIEW_BACK_ID;
  back.textContent = "返回 DeepSeek Harness";
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
    host.hidden = false;
    if (element === null) {
      opening ??= build().finally(() => { opening = null; });
      await opening;
    }
  };
  const hide = () => { host.hidden = true; };
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
  return { show, hide, dispose };
}

function createSwitcher() {
  const style = document.createElement("style");
  style.textContent = `
    [${TRIGGER_ATTR}] { gap:6px; border-radius:8px; }
    [${TRIGGER_ATTR}]:hover { background:#f0f0f0; }
    [${TRIGGER_ATTR}]:focus-visible, #${MENU_ID} a:focus-visible { outline:2px solid #4d6bfe; outline-offset:2px; }
    [${TRIGGER_ATTR}]::after { content:""; width:6px; height:6px; flex:none; margin:0 5px 3px 2px; border-right:1.5px solid currentColor; border-bottom:1.5px solid currentColor; transform:rotate(45deg); transition:transform 120ms ease; }
    [${TRIGGER_ATTR}][aria-expanded="true"]::after { transform:translateY(3px) rotate(225deg); }
    #${MENU_ID} { position:fixed; z-index:10000; box-sizing:border-box; width:182px; max-width:calc(100vw - 16px); max-height:calc(100vh - 16px); overflow:auto; margin:0; padding:5px; border:1px solid #e5e5e5; border-radius:12px; background:#fff; color:#171717; box-shadow:0 6px 20px #0000001f, 0 1px 4px #0000000a; font-family:inherit; }
    #${MENU_ID}[hidden] { display:none; }
    #${MENU_ID} a { display:flex; align-items:center; gap:9px; padding:9px 8px; border-radius:8px; color:inherit; text-decoration:none; outline-offset:-2px; }
    #${MENU_ID} a:hover, #${MENU_ID} a:focus { background:#f3f3f3; }
    #${MENU_ID} .dsh-product-icon { flex:none; display:grid; place-items:center; width:28px; height:28px; border:1px solid #e5e5e5; border-radius:8px; }
    #${MENU_ID} .dsh-product-copy { flex:1; min-width:0; }
    #${MENU_ID} strong { display:block; font-size:13px; font-weight:600; line-height:18px; }
    #${MENU_ID} small { display:block; margin-top:1px; font-size:11px; line-height:15px; color:#737373; }
    #${MENU_ID} a + a { margin-top:1px; }
    #${CHAT_VIEW_ID} { position:fixed; inset:0; z-index:9998; background:#fff; }
    #${CHAT_VIEW_ID}[hidden] { display:none; }
    #${CHAT_VIEW_ID} webview { width:100%; height:100%; border:0; }
    #${CHAT_VIEW_BACK_ID} { position:absolute; top:12px; right:16px; z-index:1; padding:7px 12px; border:1px solid #e5e5e5; border-radius:8px; background:#fffffff2; color:#171717; font:inherit; font-size:12px; cursor:pointer; box-shadow:0 2px 8px #0000001a; }
    #${CHAT_VIEW_BACK_ID}:hover { background:#fff; }
    #${CHAT_VIEW_BACK_ID}:focus-visible { outline:2px solid #4d6bfe; outline-offset:2px; }
    @media (prefers-reduced-motion:reduce) { [${TRIGGER_ATTR}]::after { transition:none; } }
  `;
  document.head.appendChild(style);
  // Web has no shell to host a guest, so it keeps the plain navigation.
  const chatView = IS_DESKTOP ? createChatView() : null;
  const openChat = () => {
    if (chatView === null) { window.location.assign(CHAT_URL); return; }
    void chatView.show().catch((error) => {
      chatView.hide();
      console.error("dsh-deepseek-chat: in-app view unavailable, opening the browser instead", error);
      window.open(CHAT_URL, "_blank");
    });
  };
  const menu = document.createElement("div");
  menu.id = MENU_ID;
  menu.hidden = true;
  menu.setAttribute("aria-label", "切换应用");
  const makeItem = (name, description, href, icon, current) => {
    const item = document.createElement("a");
    item.href = href;
    if (current) item.setAttribute("aria-current", "page");
    const mark = document.createElement("span");
    mark.className = "dsh-product-icon";
    mark.setAttribute("aria-hidden", "true");
    mark.innerHTML = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + icon + '</svg>';
    const copy = document.createElement("span");
    copy.className = "dsh-product-copy";
    const title = document.createElement("strong");
    title.textContent = name;
    const detail = document.createElement("small");
    detail.textContent = description;
    copy.append(title, detail);
    item.append(mark, copy);
    menu.appendChild(item);
    return item;
  };
  const chat = makeItem("DeepSeek Chat", "创建、学习和探索", CHAT_URL,
    '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2 1.5-5A8.5 8.5 0 1 1 21 11.5Z"/><path d="M8 10h8M8 14h5"/>', false);
  const harness = makeItem("DeepSeek Harness", "构建、调试和发布", document.URL,
    '<path d="m9 6-6 6 6 6m6-12 6 6-6 6"/>', true);
  document.body.appendChild(menu);
  let trigger = null;
  let original = null;
  let hoverCloseTimer = 0;
  const attributes = [TRIGGER_ATTR, "aria-label", "aria-haspopup", "aria-expanded", "aria-controls", "title", "role", "tabindex"];
  const cancelHoverClose = () => {
    if (!hoverCloseTimer) return;
    window.clearTimeout(hoverCloseTimer);
    hoverCloseTimer = 0;
  };
  const close = (restoreFocus = false) => {
    cancelHoverClose();
    const wasOpen = !menu.hidden;
    menu.hidden = true;
    trigger?.setAttribute("aria-expanded", "false");
    if (wasOpen && restoreFocus && trigger?.isConnected) trigger.focus();
  };
  const position = () => {
    if (!trigger || menu.hidden) return;
    const rect = trigger.getBoundingClientRect();
    if (!rect.width || !rect.height) { close(); return; }
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8));
    const top = Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - menu.offsetHeight - 8));
    menu.style.left = left + "px";
    menu.style.top = top + "px";
  };
  const open = () => {
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    position();
  };
  const swallowHostAction = (event) => {
    event.preventDefault();
    // Capture on the brand prevents the host React handlers from creating a session.
    event.stopImmediatePropagation();
  };
  const activate = (event) => {
    swallowHostAction(event);
    if (menu.hidden) open(); else close(true);
  };
  const activateFromKeyboard = (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    activate(event);
  };
  const openOnHover = () => {
    cancelHoverClose();
    if (menu.hidden) open();
  };
  const closeAfterHover = () => {
    cancelHoverClose();
    hoverCloseTimer = window.setTimeout(() => close(), 160);
  };
  const closeOnOutsideClick = (event) => {
    if (menu.hidden) return;
    const target = event.target;
    if (menu.contains(target) || trigger?.contains(target)) return;
    close();
  };
  const resize = new ResizeObserver(position);
  const detach = () => {
    close();
    if (!trigger) return;
    resize.unobserve(trigger);
    for (const name of CAPTURE_EVENTS) trigger.removeEventListener(name, swallowHostAction, true);
    trigger.removeEventListener("click", activate, true);
    trigger.removeEventListener("keydown", activateFromKeyboard, true);
    trigger.removeEventListener("mouseenter", openOnHover);
    trigger.removeEventListener("mouseleave", closeAfterHover);
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
    trigger.setAttribute("aria-label", "DeepSeek Harness，切换应用");
    trigger.setAttribute("title", "切换应用");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", MENU_ID);
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
    trigger.addEventListener("mouseenter", openOnHover);
    trigger.addEventListener("mouseleave", closeAfterHover);
    resize.observe(trigger);
  };
  chat.addEventListener("click", (event) => {
    event.preventDefault();
    close();
    openChat();
  });
  // Harness is already the active app: keep the current conversation and draft.
  harness.addEventListener("click", (event) => {
    event.preventDefault();
    close(true);
  });
  menu.addEventListener("mouseenter", cancelHoverClose);
  menu.addEventListener("mouseleave", closeAfterHover);
  window.addEventListener("resize", position);
  window.addEventListener("scroll", position, true);
  document.addEventListener("click", closeOnOutsideClick, true);
  // Wait for the first title only; do not rebind after sidebar reconstruction.
  const observer = new MutationObserver(bind);
  observer.observe(document.body, { childList: true, subtree: true });
  bind();
  return () => {
    observer.disconnect();
    detach();
    resize.disconnect();
    window.removeEventListener("resize", position);
    window.removeEventListener("scroll", position, true);
    document.removeEventListener("click", closeOnOutsideClick, true);
    chatView?.dispose();
    menu.remove();
    style.remove();
  };
}
function apply(ctx) {
  ctx.effect(createSwitcher);
}
return { apply };
  }
});
