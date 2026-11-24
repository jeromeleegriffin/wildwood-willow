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
    if (state.mode === 'temporarily_closed') showClosed();
    else if (state.mode === 'pause_orders') pauseOrdering();
    document.dispatchEvent(new CustomEvent('ww:store-status', {detail:{mode:state.mode}}));
  }

  async function loadStatus() {
    if (promise) return promise;
    promise = (async () => {
      try {
        const response = await fetch(settingsUrl + '?t=' + Date.now(), {cache:'no-store'});
        if (response.ok) {
          const body = await response.json();
          if (body && ['open','pause_orders','temporarily_closed'].includes(body.mode))
            state = {...defaults, ...body};
        }
      } catch (error) {
        console.warn('Store availability settings could not be loaded', error);
      }
      ready = true;
      applyState();
      return state;
    })();
    return promise;
  }

  // Block direct Add to Cart calls and checkout clicks in pause mode, too.
  document.addEventListener('click', event => {
    if (state.mode !== 'pause_orders' && state.mode !== 'temporarily_closed') return;
    if (event.target.closest('.add-btn, .checkout-btn')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  window.WWStoreAvailability = {
    load: loadStatus,
    isOrderingAllowed: () => ready && state.mode === 'open',
    mode: () => state.mode
  };

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', loadStatus, {once:true});
  else loadStatus();
})();
