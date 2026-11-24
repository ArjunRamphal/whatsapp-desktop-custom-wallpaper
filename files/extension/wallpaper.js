(() => {
  'use strict';

  const STORAGE_KEY = 'waCustomWallpapers';
  const BTN_WRAP_ID = 'wa-cw-header-wrap';

  let fileConfig = { default: null, contacts: {} };
  let storedConfig = { default: undefined, contacts: {} };
  let activeMenu = null;
  let rafPending = false;

  function normalizeName(name) {
    return (name || '').replace(/\s+/g, ' ').trim();
  }

  function getActiveChatName() {
    const header = document.querySelector('#main header');
    if (!header) return null;

    const selectors = [
      '[data-testid="conversation-info-header-chat-title"]',
      'span[title]',
      'span[dir="auto"]'
    ];

    for (const sel of selectors) {
      const el = header.querySelector(sel);
      if (!el) continue;
      const text = normalizeName(el.getAttribute('title') || el.textContent);
      if (text) return text;
    }
    return null;
  }

  function toExtensionUrl(relPath) {
    if (!relPath) return null;
    if (/^(data:|chrome-extension:|https?:)/i.test(relPath)) return relPath;
    return chrome.runtime.getURL(relPath);
  }

  function resolveWallpaperUrl(chatName) {
    const storedContacts = storedConfig.contacts || {};
    const fileContacts = fileConfig.contacts || {};

    if (chatName) {
      if (Object.prototype.hasOwnProperty.call(storedContacts, chatName)) {
        return storedContacts[chatName]; // string URL or null (explicitly cleared)
      }
      if (Object.prototype.hasOwnProperty.call(fileContacts, chatName)) {
        return toExtensionUrl(fileContacts[chatName]);
      }
    }

    if (storedConfig.default !== undefined) {
      return storedConfig.default; // string URL or null (explicitly cleared)
    }
    return toExtensionUrl(fileConfig.default);
  }

  function hasContactOverride(chatName) {
    if (!chatName) return false;
    const storedContacts = storedConfig.contacts || {};
    const fileContacts = fileConfig.contacts || {};
    if (Object.prototype.hasOwnProperty.call(storedContacts, chatName)) {
      return Boolean(storedContacts[chatName]);
    }
    return Boolean(fileContacts[chatName]);
  }

  function hasDefaultWallpaper() {
    if (storedConfig.default !== undefined) {
      return Boolean(storedConfig.default);
    }
    return Boolean(fileConfig.default);
  }

  function applyWallpaper() {
    const main = document.querySelector('#main');
    if (!main) return;

    const chatName = getActiveChatName();
    const url = resolveWallpaperUrl(chatName);

    if (url) {
      main.setAttribute('data-wa-custom-wallpaper', 'active');
      main.style.setProperty('--wa-custom-wallpaper', `url("${url}")`);
    } else {
      main.removeAttribute('data-wa-custom-wallpaper');
      main.style.removeProperty('--wa-custom-wallpaper');
    }
  }

  function saveStoredConfig() {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: storedConfig }, resolve);
    });
  }

  function pickImageAsDataUrl() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.style.display = 'none';

      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        input.remove();
        if (!file) {
          resolve(null);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      });

      document.body.appendChild(input);
      input.click();
    });
  }

  function closeMenu() {
    if (activeMenu) {
      activeMenu.remove();
      activeMenu = null;
    }
  }

  function addMenuButton(menu, label, onClick, isDanger = false) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    if (isDanger) btn.className = 'wa-cw-danger';
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      closeMenu();
      await onClick();
    });
    menu.appendChild(btn);
  }

  function openMenu(wrap) {
    if (activeMenu) {
      closeMenu();
      return;
    }

    const chatName = getActiveChatName();
    const menu = document.createElement('div');
    menu.className = 'wa-cw-menu';

    const title = document.createElement('div');
    title.className = 'wa-cw-menu-title';
    title.textContent = chatName ? `Chat: ${chatName}` : 'Wallpaper settings';
    menu.appendChild(title);

    if (chatName) {
      addMenuButton(menu, 'Set wallpaper for this chat', async () => {
        const dataUrl = await pickImageAsDataUrl();
        if (!dataUrl) return;
        storedConfig.contacts = storedConfig.contacts || {};
        storedConfig.contacts[chatName] = dataUrl;
        await saveStoredConfig();
        applyWallpaper();
      });

      if (hasContactOverride(chatName)) {
        addMenuButton(
          menu,
          'Remove wallpaper for this chat',
          async () => {
            storedConfig.contacts = storedConfig.contacts || {};
            if (fileConfig.contacts && Object.prototype.hasOwnProperty.call(fileConfig.contacts, chatName)) {
              storedConfig.contacts[chatName] = null;
            } else {
              delete storedConfig.contacts[chatName];
            }
            await saveStoredConfig();
            applyWallpaper();
          },
          true
        );
      }
    }

    addMenuButton(menu, 'Set default wallpaper (all chats)', async () => {
      const dataUrl = await pickImageAsDataUrl();
      if (!dataUrl) return;
      storedConfig.default = dataUrl;
      await saveStoredConfig();
      applyWallpaper();
    });

    if (hasDefaultWallpaper()) {
      addMenuButton(
        menu,
        'Remove default wallpaper',
        async () => {
          storedConfig.default = fileConfig.default ? null : undefined;
          await saveStoredConfig();
          applyWallpaper();
        },
        true
      );
    }

    wrap.appendChild(menu);
    activeMenu = menu;
  }

  function createWallpaperIcon() {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '20');
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('aria-hidden', 'true');

    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute(
      'd',
      'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-5.04-6.71l-2.75 3.54-1.96-2.36L6.5 17h11l-3.54-4.71z'
    );
    svg.appendChild(path);
    return svg;
  }

  function ensureHeaderButton() {
    const header = document.querySelector('#main header');
    if (!header || header.querySelector(`#${BTN_WRAP_ID}`)) return;

    const wrap = document.createElement('div');
    wrap.id = BTN_WRAP_ID;
    wrap.className = 'wa-cw-wrap';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wa-cw-btn';
    btn.title = 'Custom wallpaper';
    btn.setAttribute('aria-label', 'Custom wallpaper');
    btn.appendChild(createWallpaperIcon());
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openMenu(wrap);
    });

    wrap.appendChild(btn);

    // Place next to the right-side header action buttons when available
    const actionArea = header.lastElementChild;
    if (actionArea && actionArea !== header.firstElementChild) {
      actionArea.prepend(wrap);
    } else {
      header.appendChild(wrap);
    }
  }

  function scheduleSync() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      applyWallpaper();
      ensureHeaderButton();
    });
  }

  async function loadConfigs() {
    try {
      const resp = await fetch(chrome.runtime.getURL('config.json'));
      if (resp.ok) {
        const parsed = await resp.json();
        if (parsed && typeof parsed === 'object') {
          fileConfig = {
            default: parsed.default || null,
            contacts: parsed.contacts && typeof parsed.contacts === 'object' ? parsed.contacts : {}
          };
        }
      }
    } catch {
      // config.json is optional when using in-app storage only
    }

    await new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        const saved = result && result[STORAGE_KEY];
        if (saved && typeof saved === 'object') {
          storedConfig = {
            default: saved.default,
            contacts: saved.contacts && typeof saved.contacts === 'object' ? saved.contacts : {}
          };
        }
        resolve();
      });
    });
  }

  async function init() {
    await loadConfigs();

    document.addEventListener('click', (e) => {
      if (activeMenu && !activeMenu.parentElement?.contains(e.target)) {
        closeMenu();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenu();
    });

    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.body, { childList: true, subtree: true });
    scheduleSync();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
