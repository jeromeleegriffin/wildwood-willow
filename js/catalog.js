/* Catalog source shared by homepage and shopping pages.
   GitHub is the canonical source for Sveltia CMS edits; hosted files are fallback. */
(() => {
  'use strict';
  const owner = 'jeromeleegriffin';
  const repository = 'wildwood-willow';
  const base = 'https://raw.githubusercontent.com/' + owner + '/' + repository + '/main/';
  const api = 'https://api.github.com/repos/' + owner + '/' + repository + '/contents/content/';
  const known = {
    products: ['arnica-aloe-cream','mental-reset','nerve-pain-relaxant','appetite-suppressant'],
    services: ['reflexology','vibration-therapy','foot-detox','massage-chair']
  };

  function parse(source) {
    const match = source.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---(?:\s|$)/);
    if (!match) return null;
    const data = {};
    const lines = match[1].split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const field = /^([A-Za-z_][A-Za-z0-9_-]*):(?:[ \t]*(.*))?$/.exec(line);
      if (!field) continue;
      const key = field[1];
      let value = (field[2] || '').trim();
      if (/^[|>][-+]?$/.test(value)) {
        const folded = value.startsWith('>');
        const collected = [];
        while (i + 1 < lines.length) {
          const next = lines[i + 1];
          if (next.trim() && !/^[ \t]+/.test(next)) break;
          i++;
          collected.push(next);
        }
        const indent = Math.min(...collected.filter(x => x.trim()).map(x => (x.match(/^[ \t]*/) || [''])[0].length), Infinity);
        const text = collected.map(x => x.slice(Math.min(x.length, Number.isFinite(indent) ? indent : 0)));
        value = folded ? text.join(' ').replace(/[ \t]+/g, ' ').trim() : text.join('\n').trimEnd();
      } else if (value.startsWith('"') && value.endsWith('"')) {
        try { value = JSON.parse(value); }
        catch { value = value.slice(1, -1); }
      } else if (value.startsWith("'") && value.endsWith("'")) {
        value = value.slice(1, -1).replace(/''/g, "'");
      }
      data[key] = value;
    }
    return data;
  }
  async function fetchText(url) {
    const res = await fetch(url, {cache:'no-store'});
    if (!res.ok) throw new Error('Content HTTP ' + res.status);
    return res.text();
  }
  async function document(folder, slug, options = {}) {
    if (!/^[a-z0-9_-]+$/i.test(slug) || !/^(products|services)$/.test(folder)) return null;
    const path = 'content/' + folder + '/' + slug + '.md';
    let markdown;
    try {
      markdown = await fetchText(base + path + '?v=' + Date.now());
    } catch (err) {
      if (options.freshOnly) return null;
      try { markdown = await fetchText('/' + path + '?v=' + Date.now()); }
      catch (err2) { return null; }
    }
    const result = parse(markdown);
    if (!result) return null;
    result.slug = slug;
    result.folder = folder;
    return result;
  }
  async function slugs(folder) {
    if (!known[folder]) return [];
    try {
      const res = await fetch(api + folder + '?ref=main', {
        cache: 'no-store', headers:{Accept:'application/vnd.github+json'}
      });
      if (!res.ok) throw new Error('GitHub directory ' + res.status);
      const list = await res.json();
      if (!Array.isArray(list)) throw new Error('Invalid GitHub directory');
      const names = list.filter(f => f.type === 'file' && /^[a-z0-9_-]+\.md$/i.test(f.name))
        .map(f => f.name.slice(0,-3));
      // Preserve existing display order; CMS additions are included automatically.
      return [...new Set([...known[folder], ...names])];
    } catch (err) {
      return [...known[folder]];
    }
  }
  async function list(folder) {
    const names = await slugs(folder);
    const results = await Promise.all(names.map(name => document(folder, name)));
    return results.filter(Boolean);
  }
  function image(url) {
    const src = (url || '').trim();
    if (!src) return '';
    if (src.startsWith('/images/')) return base + src.slice(1);
    if (src.startsWith('images/')) return base + src;
    if (/^https:\/\//i.test(src)) return src;
    return '';
  }
  function stock(item) {
    const value = String(item?.quantity_available ?? '').trim();
    return /^\d{1,4}$/.test(value) ? Number(value) : null;
  }
  window.WWCatalog = {list, document, parse, image, stock};
})();
