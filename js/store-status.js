/* Wildwood & Willow reversible availability controls.
   Admin edits /content/settings/store-status.json; never removes content. */
(() => {
  'use strict';
  const settingsUrl = '/content/settings/store-status.json';
  const defaults = {
    mode: 'open',
    closed_title: "We'll Be Back Soon",
    closed_message: 'Wildwood & Willow Botanicals is temporarily unavailable. Please check back soon.',
    orders_message: 'Online ordering is temporarily paused. You can still browse products and services.'
  };
  let state = {...defaults};
  let ready = false;
  let promise = null;

  const addStyles = () => {
    if (document.getElementById('ww-store-availability-css')) return;
    const style = document.createElement('style');
    style.id = 'ww-store-availability-css';
    style.textContent = `
      #ww-closed-overlay {
        position: fixed !important; inset: 0 !important;
        z-index: 2147483647 !important;
        background: #f5f0e8 !important; color: #3e4f32 !important;
        display: flex !important; align-items: center !important;
        justify-content: center !important; padding: 20px !important;
        overflow: auto !important; text-align: center !important;
        font-family: Georgia, serif !important;
      }
      #ww-closed-overlay .ww-closed-card {
        background: #fffdf8; border: 1px solid #e1d7ca; border-radius: 16px;
        padding: 28px 22px; max-width: 380px; width: 100%;
        box-shadow: 0 10px 30px rgba(62,79,50,.12);
      }
      #ww-closed-overlay h1 {
        font-family: Georgia, serif; font-size: 1.55rem;
        line-height: 1.2; color: #3e4f32; margin: 16px 0 12px;
      }
      #ww-closed-overlay p {
        font-size: 1rem; line-height: 1.55; color: #444; white-space: pre-line;
      }
      .ww-orders-notice {
        background: #fff4e9; color: #4c3b29; border: 1px solid #dfb78f;
        border-radius: 9px; padding: 10px 12px; font-size: .86rem;
        line-height: 1.35; margin: 10px auto; max-width: 380px;
        width: calc(100% - 16px); box-sizing: border-box;
        font-family: Georgia, serif; text-align: center;
      }
      button.ww-order-disabled { opacity: .55; cursor: not-allowed !important; }
    `;
    document.head.appendChild(style);
  };

  function showClosed() {
    addStyles();
    if (document.getElementById('ww-closed-overlay')) return;
    const layer = document.createElement('div');
    layer.id = 'ww-closed-overlay';
    layer.setAttribute('role','main');
    const card = document.createElement('div');
    card.className = 'ww-closed-card';
    const eyebrow = document.createElement('div');
    eyebrow.textContent = 'WILDWOOD & WILLOW BOTANICALS';
    eyebrow.style.cssText = 'font-size:.8rem;letter-spacing:2px;font-weight:bold;';
    const heading = document.createElement('h1');
    heading.textContent = state.closed_title || defaults.closed_title;
    const message = document.createElement('p');
    message.textContent = state.closed_message || defaults.closed_message;
    const phone = document.createElement('a');
    phone.href = 'tel:5074301250';
    phone.textContent = 'Call 507-430-1250';
    phone.style.cssText = 'display:inline-block;margin-top:12px;color:#3e4f32;font-weight:bold;';
    card.append(eyebrow,heading,message,phone);
    layer.append(card);
    document.body.append(layer);
  }

  function pauseOrdering() {
    addStyles();
    const existing = document.getElementById('ww-order-notice');
    if (existing) existing.textContent = state.orders_message || defaults.orders_message;
    if (!existing) {
      const notice = document.createElement('div');
      notice.id = 'ww-order-notice';
      notice.className = 'ww-orders-notice';
      notice.setAttribute('role','status');
      notice.textContent = state.orders_message || defaults.orders_message;
      const target = document.querySelector('.product-page, .cart-page, .main-content, main, .shop-wrap');
      if (target) target.prepend(notice);
      else document.body.prepend(notice);
    }
    document.querySelectorAll('.add-btn, .checkout-btn').forEach(button => {
      button.disabled = true;
      button.classList.add('ww-order-disabled');
      button.setAttribute('aria-disabled','true');
      button.title = 'Ordering temporarily paused';
    });
  }

  function applyState() {
    if (!document.body) return;
    const layer = document.getElementById('ww-closed-overlay');
    const notice = document.getElementById('ww-order-notice');
    if (state.mode === 'temporarily_closed') {
      if (notice) notice.remove();
      showClosed();
    } else if (state.mode === 'pause_orders') {
      if (layer) layer.remove();
      pauseOrdering();
    } else {
      if (layer) layer.remove();
      if (notice) notice.remove();
      document.querySelectorAll('.add-btn, .checkout-btn').forEach(button => {
        button.disabled = false;
        button.classList.remove('ww-order-disabled');
        button.removeAttribute('aria-disabled');
        button.removeAttribute('title');
      });
    }
    document.dispatchEvent(new CustomEvent('ww:store-status', {detail:{mode:state.mode}}));
  }

  // During migration this storefront is served by Cloudflare but edited in GitHub.
  // Read GitHub's current public file first so admin changes do not wait for a site redeploy.
  // A hosted static copy is a fallback only, not the primary source of truth.
  async function readGitHubStatus() {
    const api = 'https://api.github.com/repos/jeromeleegriffin/wildwood-willow/contents/content/settings/store-status.json?ref=main&fresh=' + Date.now();
    const response = await fetch(api, {
      cache: 'no-store',
      headers: { 'Accept': 'application/vnd.github+json' }
    });
    if (!response.ok) throw new Error('GitHub status HTTP ' + response.status);
    const data = await response.json();
    if (!data.content || data.encoding !== 'base64') throw new Error('Unexpected GitHub status format');
    const raw = atob(data.content);
    const bytes = Uint8Array.from(raw, char => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  async function readHostedStatus() {
    const response = await fetch(settingsUrl + '?fresh=' + Date.now(), { cache: 'no-store' });
    if (!response.ok) throw new Error('Hosted status HTTP ' + response.status);
    return response.json();
  }

  async function loadStatus(force = false) {
    if (promise) return promise;
    promise = (async () => {
      let data = null;
      try {
        // After ownership transfer the new Pages site can read its own static JSON.
        data = location.hostname.endsWith('github.io') ?
          await readHostedStatus() : await readGitHubStatus();
      } catch (githubError) {
        console.warn('Primary store-status lookup failed:', githubError);
        try { data = await readHostedStatus(); }
        catch (hostedError) { console.warn('Fallback store-status lookup failed:', hostedError); }
      }
      if (data && ['open', 'pause_orders', 'temporarily_closed'].includes(data.mode)) {
        state = { ...defaults, ...data };
      } else {
        // Fail closed: no current availability data must never enable ordering.
        state = { ...defaults, mode: 'pause_orders',
          orders_message: 'Online ordering is temporarily unavailable. Please try again later.' };
      }
      ready = true;
      applyState();
      return state;
    })();
    try { return await promise; }
    finally { promise = null; }
  }

  // Block direct Add to Cart calls and checkout clicks in pause mode, too.
  document.addEventListener('click', event => {
    if ((!ready || state.mode !== 'open') && event.target.closest('.add-btn, .checkout-btn')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  window.WWStoreAvailability = {
    load: loadStatus,
    isOrderingAllowed: () => ready && state.mode === 'open',
    mode: () => state.mode
  };

  window.addEventListener('pageshow', event => { if (event.persisted) loadStatus(true); });
  window.addEventListener('focus', () => { if (ready) loadStatus(true); });

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', loadStatus, {once:true});
  else loadStatus();
})();
