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
    const match = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return null;
    const data = {};
    match[1].split(/\r?\n/).forEach(line => {
      const index = line.indexOf(':');
      if (index === -1) return;
      let value = line.slice(index + 1).trim();
      // Support simple quoted strings commonly written by the CMS.
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1,-1);
      }
      data[line.slice(0,index).trim()] = value;
    });
    return data;
  }
  async function fetchText(url) {
    const res = await fetch(url, {cache:'no-store'});
    if (!res.ok) throw new Error('Content HTTP ' + res.status);
    return res.text();
  }
  async function document(folder, slug) {
    if (!/^[a-z0-9_-]+$/i.test(slug) || !/^(products|services)$/.test(folder)) return null;
    const path = 'content/' + folder + '/' + slug + '.md';
    let markdown;
    try {
      markdown = await fetchText(base + path + '?v=' + Date.now());
    } catch (err) {
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
  window.WWCatalog = {list, document, parse, image};
})();