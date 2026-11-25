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

function productFields(markdown) {
  const front = markdown?.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---(?:\s|$)/)?.[1];
  const field = name => (front?.match(new RegExp('^' + name + ':[ \\t]*([^\\r\\n]+)','m'))?.[1] || '')
    .trim().replace(/^(['"])(.*)\1$/,'$2');
  return {title:field('title'),price:field('price').replace(/^\$/,'')};
}

async function quoteItem(item, fetchCatalog) {
  const entry = productFields(await catalogFile('products/' + item.slug + '.md',fetchCatalog));
  const price = priceInCents(entry.price);
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
  return {items,subtotalCents,shippingCents,discountCents,totalCents:subtotalCents + shippingCents - discountCents};
}
