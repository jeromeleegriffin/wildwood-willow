(() => {
  const keys = new Set(['disclaimer','contact','shipping','about','social']);
  const labels = document.querySelectorAll('[data-menu-label]');
  const page = document.querySelector('[data-menu-page]');
  const requested = page?.dataset.menuPage === 'selected' ? new URLSearchParams(location.search).get('page') : page?.dataset.menuPage;
  const key = keys.has(requested) ? requested : null;
  const body = document.getElementById('menu-page-body');
  if (requested === 'contact' || requested === 'shipping') document.getElementById('contact-shortcut').hidden = false;
  if (!labels.length && !key) {
    if (body) body.textContent = 'Choose a page from the homepage menu.';
    return;
  }
  const local = '/content/settings/menu-pages.json';
  const source = 'https://raw.githubusercontent.com/jeromeleegriffin/wildwood-willow/main' + local;
  async function read(url) {
    const result = await fetch(url + '?v=' + Date.now(), {cache:'no-store',signal:AbortSignal.timeout(4500)});
    if (!result.ok) throw Error('Menu settings unavailable');
    const data = await result.json();
    if (!data || ![...keys].every(id => typeof data[id]?.title === 'string' && typeof data[id]?.body === 'string')) throw Error('Invalid menu settings');
    return data;
  }
  const clean = value => typeof value === 'string' ? value.trim() : '';
  read(source).catch(() => read(local)).then(data => {
    for (const link of labels) {
      const title = clean(data[link.dataset.menuLabel]?.title);
      if (title) link.textContent = title;
    }
    if (!key) return;
    if (key === 'social') {
      const link = document.getElementById('facebook-link');
      try {
        const url = new URL(data.social.facebook_url);
        if (url.protocol === 'https:' && !url.username && !url.password &&
            ['facebook.com','www.facebook.com','m.facebook.com'].includes(url.hostname)) {
          link.href = url.href;
          link.parentElement.hidden = false;
        }
      } catch {}
    }
    const title = clean(data[key]?.title);
    const copy = clean(data[key]?.body);
    if (!title || !copy) throw Error('Page content unavailable');
    document.getElementById('menu-page-title').textContent = title;
    document.title = title + ' · Wildwood & Willow Botanicals';
    body.replaceChildren(...copy.split(/\n[ \t]*\n/).map((paragraph,index) => {
      const p = document.createElement('p');
      p.style.whiteSpace = 'pre-line';
      if (key === 'disclaimer' && index === 0) {
        const strong = document.createElement('strong');
        strong.textContent = paragraph;
        p.append(strong);
      } else p.textContent = paragraph;
      return p;
    }));
  }).catch(() => {
    if (key && key !== 'disclaimer') body.textContent = 'Store information is temporarily unavailable.';
  });
})();
