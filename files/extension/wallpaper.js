(() => {
  'use strict';

  const STORAGE_KEY = 'waCustomWallpapers';
  const BTN_WRAP_ID = 'wa-cw-header-wrap';
  const FIT_MODES = {
    cover: { label: 'Fill', size: 'cover', repeat: 'no-repeat' },
    contain: { label: 'Fit', size: 'contain', repeat: 'no-repeat' },
    stretch: { label: 'Stretch', size: '100% 100%', repeat: 'no-repeat' },
    tile: { label: 'Tile', size: 'auto', repeat: 'repeat' }
  };

  let fileConfig = { default: null, contacts: {} };
  let storedConfig = { default: undefined, contacts: {}, fitMode: 'cover' };
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

  function syncDoodleLayerVisibility(main, hide) {
    if (!hide) {
      main.querySelectorAll('[data-wa-cw-hidden-bg="1"]').forEach((el) => {
        el.removeAttribute('data-wa-cw-hidden-bg');
      });
      return;
    }

    const candidates = main.querySelectorAll('div');
    for (const el of candidates) {
      if (el.closest('header, footer, [data-testid="msg-container"], [role="row"]')) continue;
      if (el.hasAttribute('data-asset-chat-background-light') || el.hasAttribute('data-asset-chat-background-dark')) {
        el.setAttribute('data-wa-cw-hidden-bg', '1');
        continue;
      }
      const bgImg = el.style.backgroundImage || window.getComputedStyle(el).backgroundImage;
      if (bgImg && bgImg !== 'none' && bgImg.includes('url(') && el.children.length === 0) {
        el.setAttribute('data-wa-cw-hidden-bg', '1');
      }
    }
  }

  function applyWallpaper() {
    const main = document.querySelector('#main');
    if (!main) return;

    const chatName = getActiveChatName();
    const url = resolveWallpaperUrl(chatName);

    if (url) {
      const fit = FIT_MODES[storedConfig.fitMode] || FIT_MODES.cover;
      main.setAttribute('data-wa-custom-wallpaper', 'active');
      main.style.setProperty('background-image', `url("${url}")`, 'important');
      main.style.setProperty('background-size', fit.size, 'important');
      main.style.setProperty('background-repeat', fit.repeat, 'important');
      main.style.setProperty('background-position', 'center', 'important');
      syncDoodleLayerVisibility(main, true);
    } else {
      main.removeAttribute('data-wa-custom-wallpaper');
      main.style.removeProperty('background-image');
      main.style.removeProperty('background-size');
      main.style.removeProperty('background-repeat');
      main.style.removeProperty('background-position');
      syncDoodleLayerVisibility(main, false);
    }
  }

  function saveStoredConfig() {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: storedConfig }, () => {
        if (chrome.runtime.lastError) {
          console.error('[WhatsApp Custom Wallpaper] Failed to save:', chrome.runtime.lastError.message);
          alert('Could not save wallpaper: ' + chrome.runtime.lastError.message);
          resolve(false);
          return;
        }
        resolve(true);
      });
    });
  }

  function optimizeDataUrlIfNeeded(dataUrl) {
    // Keep smaller images untouched; downscale very large images so storage/CSS never fail
    if (dataUrl.length <= 1800000) return Promise.resolve(dataUrl);

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 2560;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
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
        reader.onload = async () => {
          if (typeof reader.result !== 'string') {
            resolve(null);
            return;
          }
          resolve(await optimizeDataUrlIfNeeded(reader.result));
        };
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

    const fitSection = document.createElement('div');
    fitSection.className = 'wa-cw-fit-section';

    const fitLabel = document.createElement('div');
    fitLabel.className = 'wa-cw-fit-label';
    fitLabel.textContent = 'Wallpaper fit';
    fitSection.appendChild(fitLabel);

    const fitRow = document.createElement('div');
    fitRow.className = 'wa-cw-fit-row';
    const currentFit = FIT_MODES[storedConfig.fitMode] ? storedConfig.fitMode : 'cover';

    for (const [modeKey, modeInfo] of Object.entries(FIT_MODES)) {
      const fitBtn = document.createElement('button');
      fitBtn.type = 'button';
      fitBtn.className = 'wa-cw-fit-opt' + (modeKey === currentFit ? ' wa-cw-active' : '');
      fitBtn.textContent = modeInfo.label;
      fitBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        storedConfig.fitMode = modeKey;
        await saveStoredConfig();
        applyWallpaper();
        closeMenu();
      });
      fitRow.appendChild(fitBtn);
    }

    fitSection.appendChild(fitRow);
    menu.appendChild(fitSection);

    const rect = wrap.getBoundingClientRect();
    menu.style.top = `${Math.round(rect.bottom + 6)}px`;
    menu.style.right = `${Math.max(8, Math.round(window.innerWidth - rect.right))}px`;

    document.body.appendChild(menu);
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

  function findHeaderActionRow(header) {
    const buttons = header.querySelectorAll('button, [role="button"]');
    const lastBtn = buttons[buttons.length - 1];
    if (lastBtn) {
      let node = lastBtn;
      while (node && node.parentElement && node.parentElement !== header) {
        const parent = node.parentElement;
        const style = window.getComputedStyle(parent);
        if (
          style.display.includes('flex') &&
          style.flexDirection !== 'column' &&
          parent.querySelectorAll('button, [role="button"]').length >= 2
        ) {
          return { container: parent, before: parent.firstElementChild };
        }
        node = parent;
      }
    }
    const actionArea = header.lastElementChild;
    if (actionArea && actionArea !== header.firstElementChild) {
      return { container: actionArea, before: actionArea.firstElementChild };
    }
    return { container: header, before: null };
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

    const target = findHeaderActionRow(header);
    target.container.insertBefore(wrap, target.before);
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
            contacts: saved.contacts && typeof saved.contacts === 'object' ? saved.contacts : {},
            fitMode: FIT_MODES[saved.fitMode] ? saved.fitMode : 'cover'
          };
        }
        resolve();
      });
    });
  }

  async function init() {
    await loadConfigs();

    document.addEventListener('click', (e) => {
      if (!activeMenu) return;
      const wrap = document.getElementById(BTN_WRAP_ID);
      if (!activeMenu.contains(e.target) && !wrap?.contains(e.target)) {
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
