/* Generate stable inventory IDs on save; never rename IDs already in use. */
(() => {
  'use strict';
  const validId = /^[a-z0-9][a-z0-9-]{0,23}$/;
  function assignSizeIds(rows) {
    const used = new Set();
    const labels = new Set();
    for (const row of rows) {
      const size = String(row.size ?? '').trim();
      if (!size || size.length > 80) throw new Error('Enter a size of up to 80 characters.');
      const label = size.normalize('NFKC').toLowerCase().replace(/\s+/g,'');
      if (labels.has(label)) throw new Error('Each size must have a different name.');
      labels.add(label);
      if (row.id) {
        if (!validId.test(row.id) || used.has(row.id)) throw new Error('A saved size has an invalid or duplicate inventory ID.');
        used.add(row.id);
      }
    }
    return rows.map(row => {
      if (row.id) return {...row};
      const base = String(row.size).normalize('NFKD').toLowerCase()
        .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-')
        .replace(/^-+|-+$/g,'').slice(0,24).replace(/-+$/,'') || 'size';
      let id=base;
      for(let n=2;used.has(id);n++){
        const suffix='-'+n;
        id=base.slice(0,24-suffix.length).replace(/-+$/,'')+suffix;
      }
      used.add(id);
      return {...row,id};
    });
  }
  CMS.registerEventListener({
    name:'preSave',
    handler:({entry})=>{
      if(entry.get('collection')!=='products') return;
      const data=entry.get('data');
      const rows=data.get('variants');
      if(!rows || !rows.size) return;
      const assigned=assignSizeIds(rows.toJS());
      return data.set('variants',rows.map((row,index)=>row.set('id',assigned[index].id)));
    }
  });
})();
