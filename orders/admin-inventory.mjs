function parseVariants(front) {
  const lines=front.split(/\r?\n/);
  const start=lines.findIndex(l=>/^variants:\s*$/.test(l));
  if(lines.filter(l=>/^variants:/.test(l)).length>1)return null;
  if(start<0) {const line=lines.find(l=>/^variants:/.test(l));return !line||/^variants:[ \t]*\[\][ \t]*$/.test(line)?[]:null;}
  const rows=[]; let row;
  for(const line of lines.slice(start+1)){
    if(!line.trim()) continue;
    const item=/^\s*-\s+(id|size|price):\s*(.*?)\s*$/.exec(line);
    const field=/^\s+(id|size|price):\s*(.*?)\s*$/.exec(line);
    if(!item&&!field){if(/^\S/.test(line))break;return null;}
    if(item){row={};rows.push(row);}
    if(!row)return null;
    const [,key,raw]=item||field;
    if(Object.hasOwn(row,key))return null;
    let val=raw;
    if(raw.startsWith('"')){try{val=JSON.parse(raw)}catch{return null}}
    else if(raw.startsWith("'")&&raw.endsWith("'"))val=raw.slice(1,-1).replace(/''/g,"'");
    row[key]=val;
  }
  const ids=new Set();
  for(const r of rows){if(!/^[a-z0-9][a-z0-9-]{0,23}$/.test(r.id||'')||ids.has(r.id)||typeof r.size!=='string'||!r.size.trim()||r.size.length>80||!/^\d{1,6}(?:\.\d{1,2})?$/.test(r.price||''))return null;ids.add(r.id);}
  return rows;
}
function splitSku(sku){const parts=sku.split('__size__');return parts.length===1?{base:sku,id:null}:parts.length===2&&/^[a-z0-9][a-z0-9-]{0,23}$/.test(parts[1])?{base:parts[0],id:parts[1]}:null;}
const slugPattern = /^[a-z0-9_-]{1,100}$/;

export async function handleAdminInventory(request, db, respond, fetchCatalog = fetch) {
  if (request.method === 'GET') {
    const rows = await db.prepare(`
      SELECT product_slug, on_hand, reserved, on_hand - reserved AS available
      FROM inventory ORDER BY product_slug
    `).all();
    return respond({inventory:rows.results});
  }
  if (request.method !== 'POST') return respond({error:'Method not allowed'},405);
  const input = await request.json().catch(() => null);
  const {slug,onHand,expectedOnHand} = input ?? {};
  const validCount = value => Number.isInteger(value) && value >= 0 && value <= 9999;
  if (typeof slug !== 'string' || !slugPattern.test(slug) || !validCount(onHand) ||
      (expectedOnHand !== null && !validCount(expectedOnHand))) {
    return respond({error:'Enter a whole stock count between 0 and 9999.'},400);
  }
  let change;
  if (expectedOnHand === null) {
    const key=splitSku(slug);
    if(!key)return respond({error:'Invalid size ID'},400);
    const url = 'https://raw.githubusercontent.com/jeromeleegriffin/wildwood-willow/main/content/products/' + key.base + '.md';
    const product = await fetchCatalog(url,{cache:'no-store'}).catch(() => null);
    if (product?.status === 404) return respond({error:'Product was not found in the catalog.'},404);
    if (!product?.ok) return respond({error:'The catalog could not be verified.'},503);
    const md=await product.text();
    const front=md.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---(?:\s|$)/)?.[1];
    const variants=front&&parseVariants(front);
    if(!variants || (key.id&&!variants.some(v=>v.id===key.id)) || (!key.id&&variants.length))return respond({error:'Choose a valid catalog size.'},400);
    change = await db.prepare(`
      INSERT INTO inventory(product_slug,on_hand) VALUES (?,?)
      ON CONFLICT(product_slug) DO NOTHING
    `).bind(slug,onHand).run();
  } else {
    change = await db.prepare(`
      UPDATE inventory SET on_hand=?
      WHERE product_slug=? AND on_hand=? AND reserved<=?
    `).bind(onHand,slug,expectedOnHand,onHand).run();
  }
  if (!change.meta.changes) {
    return respond({error:'Stock changed or the count is below reserved units. Refresh inventory and try again.'},409);
  }
  return respond({ok:true});
}
