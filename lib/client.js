window.__ModuleLoader__.load({
  id: "@guojing6/dsh-deepseek-chat",
  factory: () => {
const CHAT_URL = "https://chat.deepseek.com/";
const MENU_ID = "dsh-product-menu";
const TRIGGER_ATTR = "data-dsh-product-trigger";
// Match the host brand element.
// The brand is distinct from the New Session and sidebar collapse buttons.
function findBrandButton() {
  return document.querySelector("span.hHd-Xa_brandIdentity")?.closest("button") || null;
}

function createSwitcher() {
  const style = document.createElement("style");
  style.textContent = `
    [${TRIGGER_ATTR}] { gap:6px; border-radius:8px; }
    [${TRIGGER_ATTR}]:hover { background:#f0f0f0; }
    [${TRIGGER_ATTR}]:focus-visible, #${MENU_ID} a:focus-visible { outline:2px solid #4d6bfe; outline-offset:2px; }
    [${TRIGGER_ATTR}]::after { content:""; width:6px; height:6px; flex:none; margin:0 5px 3px 2px; border-right:1.5px solid currentColor; border-bottom:1.5px solid currentColor; transform:rotate(45deg); transition:transform 120ms ease; }
    [${TRIGGER_ATTR}][aria-expanded="true"]::after { transform:translateY(3px) rotate(225deg); }
    #${MENU_ID} { position:fixed; z-index:10000; box-sizing:border-box; width:300px; max-width:calc(100vw - 16px); max-height:calc(100vh - 16px); overflow:auto; margin:0; padding:6px; border:1px solid #e5e5e5; border-radius:16px; background:#fff; color:#171717; box-shadow:0 8px 32px #00000020, 0 2px 6px #00000008; font-family:inherit; }
    #${MENU_ID}[hidden] { display:none; }
    #${MENU_ID} a { display:flex; align-items:center; gap:12px; padding:12px 10px; border-radius:10px; color:inherit; text-decoration:none; outline-offset:-2px; }
    #${MENU_ID} a:hover, #${MENU_ID} a:focus { background:#f3f3f3; }
    #${MENU_ID} .dsh-product-icon { flex:none; display:grid; place-items:center; width:32px; height:32px; border:1px solid #e5e5e5; border-radius:9px; }
    #${MENU_ID} .dsh-product-copy { flex:1; min-width:0; }
    #${MENU_ID} strong { display:block; font-size:14px; font-weight:600; line-height:21px; }
    #${MENU_ID} small { display:block; margin-top:2px; font-size:12px; line-height:18px; color:#737373; }
    #${MENU_ID} .dsh-product-check { flex:none; width:16px; font-size:15px; }
    #${MENU_ID} a + a { margin-top:2px; }
    @media (prefers-reduced-motion:reduce) { [${TRIGGER_ATTR}]::after { transition:none; } }
  `;
  document.head.appendChild(style);
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
    mark.innerHTML = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + icon + '</svg>';
    const copy = document.createElement("span");
    copy.className = "dsh-product-copy";
    const title = document.createElement("strong");
    title.textContent = name;
    const detail = document.createElement("small");
    detail.textContent = description;
    copy.append(title, detail);
    const check = document.createElement("span");
    check.className = "dsh-product-check";
    check.setAttribute("aria-hidden", "true");
    check.textContent = current ? "✓" : "";
    item.append(mark, copy, check);
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
  const attributes = [TRIGGER_ATTR, "aria-label", "aria-haspopup", "aria-expanded", "aria-controls", "title"];
  const close = (restoreFocus = false) => {
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
  const activate = (event) => {
    event.preventDefault();
    // Capture on the brand prevents the host React click from creating a session.
    event.stopImmediatePropagation();
    if (menu.hidden) open(); else close(true);
  };
  const resize = new ResizeObserver(position);
  const detach = () => {
    close();
    if (!trigger) return;
    resize.unobserve(trigger);
    trigger.removeEventListener("click", activate, true);
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
    trigger.addEventListener("click", activate, true);
    resize.observe(trigger);
  };
  chat.addEventListener("click", (event) => {
    event.preventDefault();
    close();
    window.location.assign(CHAT_URL);
  });
  // Harness is already the active app: keep the current conversation and draft.
  harness.addEventListener("click", (event) => {
    event.preventDefault();
    close(true);
  });
  window.addEventListener("resize", position);
  window.addEventListener("scroll", position, true);
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
