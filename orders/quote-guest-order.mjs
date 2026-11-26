const catalog = 'https://raw.githubusercontent.com/jeromeleegriffin/wildwood-willow/main/content/';
const centralDate = new Intl.DateTimeFormat('en-CA', {
  timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'
});

export class QuoteError extends Error {}

function priceInCents(value) {
  const match = /^(\d{1,6})(?:\.(\d{1,2}))?$/.exec(value);
  return match ? Number(match[1]) * 100 + Number((match[2] || '').padEnd(2,'0')) : null;
}

async function catalogFile(path, fetchCatalog) {
  try {
    const response = await fetchCatalog(catalog + path,{cache:'no-store'});
    if (response.status === 404) return null;
    if (response.ok) return await response.text();
  } catch {
    // Stop checkout if the authoritative catalog cannot be reached.
  }
  throw new QuoteError('The catalog is temporarily unavailable.');
}

function parseVariants(front) {
  const lines=front.split(/\r?\n/);
  const start=lines.findIndex(l=>/^variants:\s*$/.test(l));
  if(start<0) return /^variants:\s*(?!\[\]\s*$).+/m.test(front)?null:[];
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
  for(const r of rows){if(!/^[a-z0-9][a-z0-9-]{0,23}$/.test(r.id||'')||ids.has(r.id)||!r.size||r.size.length>80||!/^\d{1,6}(?:\.\d{1,2})?$/.test(r.price||''))return null;ids.add(r.id);}
  return rows;
}
function splitSku(sku){const parts=sku.split('__size__');return parts.length===1?{base:sku,id:null}:parts.length===2&&/^[a-z0-9][a-z0-9-]{0,23}$/.test(parts[1])?{base:parts[0],id:parts[1]}:null;}
function productFields(markdown) {
  const front = markdown?.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---(?:\s|$)/)?.[1];
  const field = name => (front?.match(new RegExp('^' + name + ':[ \\t]*([^\\r\\n]+)','m'))?.[1] || '')
    .trim().replace(/^(['"])(.*)\1$/,'$2');
  return {title:field('title'),price:field('price').replace(/^\$/,''),variants:parseVariants(front||'')};
}

async function quoteItem(item, fetchCatalog) {
  const key=splitSku(item.slug);
  if(!key)throw new QuoteError('Invalid product size.');
  const entry=productFields(await catalogFile('products/'+key.base+'.md',fetchCatalog));
  const variant=entry.variants?.find(v=>v.id===key.id);
  if(entry.variants===null || (key.id&&!variant) || (!key.id&&entry.variants.length))throw new QuoteError('Choose a valid product size.');
  const price=priceInCents(variant?.price??entry.price);
  if(variant)entry.title+=' ('+variant.size+')';
  // Only the transactional inventory hold decides whether stock can be sold.
  if (!entry.title || price === null) {
    throw new QuoteError('A product in your cart is unavailable.');
  }
  return {...item,title:entry.title,price_cents:price};
}

async function getCoupon(code, subtotal, date, fetchCatalog) {
  const source = await catalogFile('settings/coupons.json',fetchCatalog);
  let coupons;
  try { coupons = JSON.parse(source)?.coupons; } catch { /* Handle invalid settings below. */ }
  if (!Array.isArray(coupons)) throw new QuoteError('Coupons are temporarily unavailable.');
  const matches = coupons.filter(entry => entry?.enabled === true && String(entry.code).toUpperCase() === code);
  const selected = matches[0];
  const minimum = priceInCents(String(selected?.minimum ?? 0));
  if (matches.length !== 1 || minimum === null || subtotal < minimum) {
    throw new QuoteError('Coupon is invalid or the minimum was not met.');
  }
  if (selected.expires) {
    const expiration = new Date(selected.expires + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(selected.expires) || !Number.isFinite(expiration.getTime()) ||
        expiration.toISOString().slice(0,10) !== selected.expires || selected.expires < centralDate.format(date)) {
      throw new QuoteError('Coupon is expired or invalid.');
    }
  }
  return selected;
}

export async function quoteGuestOrder(cart, {date = new Date(), fetchCatalog = fetch} = {}) {
  const items = await Promise.all(cart.items.map(item => quoteItem(item, fetchCatalog)));
  const subtotalCents = items.reduce((sum,item)=>sum + item.price_cents * item.qty,0);
  let shippingCents = subtotalCents <= 10000 ? 800 : 0;
  let discountCents = 0;
  if (cart.coupon) {
    const coupon = await getCoupon(cart.coupon,subtotalCents,date,fetchCatalog);
    const amount = priceInCents(String(coupon.amount ?? 0));
    if (coupon.type === 'shipping') shippingCents = 0;
    else if (coupon.type === 'fixed' && amount > 0) discountCents = Math.min(amount,subtotalCents);
    else if (coupon.type === 'percent' && amount > 0 && amount <= 10000) {
      discountCents = Math.round(subtotalCents * amount / 10000);
    } else throw new QuoteError('Coupon is invalid.');
  }
  const beforeTax = subtotalCents + shippingCents - discountCents;
  const taxCents = cart.postalCode ? await quoteTax(cart.postalCode,beforeTax,fetchCatalog) : 0;
  return {items,subtotalCents,shippingCents,discountCents,taxCents,totalCents:beforeTax + taxCents};
}

async function quoteTax(postalCode, beforeTax, fetchCatalog) {
  const source = await catalogFile('settings/sales-tax.json',fetchCatalog);
  let settings;
  try { settings = JSON.parse(source); } catch {}
  if (settings?.enabled === false) return 0;
  if (settings?.enabled !== true || !Array.isArray(settings.rates)) {
    throw new QuoteError('Sales tax settings are temporarily unavailable.');
  }
  const matches = settings.rates.filter(rate => rate?.zip === postalCode.slice(0,5));
  const percent = matches[0]?.percent;
  if (matches.length !== 1 || typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 25) {
    throw new QuoteError('Contact the shop to verify sales tax for this delivery address.');
  }
  return Math.round(beforeTax * percent / 100);
}
