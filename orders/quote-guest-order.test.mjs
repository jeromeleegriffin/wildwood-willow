import assert from 'node:assert/strict';
import {quoteGuestOrder} from './quote-guest-order.mjs';

const coupon = (code, type, amount, fields = {}) => ({code,type,amount,enabled:true,...fields});
const coupons = [
  coupon('PERCENT','percent',12.5,{minimum:100}), coupon('FIXED','fixed',500),
  coupon('SHIP','shipping',0), coupon('DATED','fixed',3,{expires:'2026-11-25'}),
  coupon('INVALID-DATE','fixed',3,{expires:'2026-02-30'}),
  coupon('DISABLED','fixed',3,{enabled:false}),
  coupon('DUPLICATE','fixed',3), coupon('DUPLICATE','fixed',4)
];
const fetchCatalog = (url, options) => {
  assert.equal(options.cache,'no-store');
  if (url.endsWith('/settings/coupons.json')) return Response.json({coupons});
  if (url.endsWith('/missing.md')) return new Response(null,{status:404});
  const stock = url.endsWith('/unknown-stock.md') ? '' : 'quantity_available: 20\n';
  return new Response('---\ntitle: "Fixture"\nprice: $25.00\n' + stock + '---\n');
};
const cart = (qty, coupon, slug = 'fixture') => ({items:[{slug,qty}],coupon});
const quote = (qty, coupon, date) => quoteGuestOrder(cart(qty,coupon),{fetchCatalog,date});
for (const [qty,shipping] of [[3,800],[4,800],[5,0]]) {
  const result = await quote(qty);
  assert.equal(result.subtotalCents,qty*2500);
  assert.equal(result.shippingCents,shipping);
}
assert.equal((await quote(4,'PERCENT')).discountCents,1250);
assert.equal((await quote(1,'FIXED')).totalCents,800);
assert.equal((await quote(1,'SHIP')).totalCents,2500);
assert.equal((await quote(1,'DATED',new Date('2026-11-26T05:59:59Z'))).discountCents,300);
await assert.rejects(quote(1,'DATED',new Date('2026-11-26T06:00:00Z')),/expired/);
for (const code of ['PERCENT','DISABLED','DUPLICATE','UNKNOWN','INVALID-DATE']) {
  await assert.rejects(quote(1,code),/invalid/);
}
assert.equal((await quoteGuestOrder(cart(1,null,'unknown-stock'),{fetchCatalog})).subtotalCents,2500);
for (const [slug,qty] of [['missing',1]]) {
  await assert.rejects(quoteGuestOrder(cart(qty,null,slug),{fetchCatalog}),/unavailable/);
}
await assert.rejects(quoteGuestOrder(cart(1),{fetchCatalog:()=>new Response(null,{status:503})}),/catalog is temporarily unavailable/);
console.log('Pricing passed: catalog totals, shipping boundaries, stock checks, coupon limits and Central Time expiration.');

const sized='---\ntitle: Fixture\nprice: 9.99\nvariants:\n  - id: 2-oz\n    size: 2 oz\n    price: "9.99"\n  - id: 4-oz\n    size: 4 oz\n    price: 16.99\n---\n';
const sizeFetch=url=>url.endsWith('/fixture.md')?new Response(sized):new Response(null,{status:404});
const sizes=await quoteGuestOrder({items:[{slug:'fixture__size__2-oz',qty:2},{slug:'fixture__size__4-oz',qty:1}]},{fetchCatalog:sizeFetch});
assert.equal(sizes.subtotalCents,3697);
assert.equal(sizes.items[1].title,'Fixture (4 oz)');
for(const slug of ['fixture','fixture__size__8-oz'])await assert.rejects(quoteGuestOrder(cart(1,null,slug),{fetchCatalog:sizeFetch}),/size/);
await assert.rejects(quoteGuestOrder(cart(1,null,'fixture__size__2-oz'),{fetchCatalog:()=>new Response(sized.replace('id: 4-oz','id: 2-oz'))}),/size/);
console.log('Size pricing and invalid selection checks passed.');
