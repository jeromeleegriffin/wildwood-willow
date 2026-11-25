import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from './test-worker.js';

const sql = new DatabaseSync(':memory:');
sql.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
const DB = {
  prepare(query, args = []) {
    const stmt = sql.prepare(query);
    return {
      bind: (...values) => DB.prepare(query, values),
      first: async () => stmt.get(...args) ?? null,
      all: async () => ({results:stmt.all(...args)}),
      run: () => ({meta:{changes:stmt.run(...args).changes}})
    };
  },
  async batch(statements) {
    sql.exec('BEGIN');
    try {
      const results = statements.map(stmt => stmt.run());
      sql.exec('COMMIT');
      return results;
    } catch (error) {
      sql.exec('ROLLBACK');
      throw error;
    }
  }
};

let catalogAvailable = true;
globalThis.fetch = async (url, options) => {
  if (url.startsWith('https://api.github.com/')) return Response.json({permissions:{push:options.headers.Authorization === 'Bearer admin'}});
  if (!catalogAvailable) return new Response('', {status:404});
  if (url.endsWith('coupons.json')) return Response.json({coupons:[
    {code:'TEN',type:'percent',amount:10,minimum:50,enabled:true},
    {code:'FIVE',type:'fixed',amount:5,enabled:true},
    {code:'SHIP',type:'shipping',enabled:true},
    {code:'OLD',type:'fixed',amount:5,expires:'2020-01-01',enabled:true},
    {code:'ACTIVE',type:'fixed',amount:5,expires:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),enabled:true}
  ]});
  return new Response('---\ntitle: Product\nprice: $' + (url.endsWith('/small.md') ? '25.00' : '50.00') + '\n---\n');
};
async function call(path, method = 'GET', payload, token = 'admin') {
  const req = new Request('https://test.local/test-orders'+path, {
    method, headers:token ? {Authorization:'Bearer '+token} : {},
    body:payload === undefined ? undefined : JSON.stringify(payload)
  });
  const res = await worker.fetch(req,{DB});
  return [res.status,await res.json()];
}
const items = (...values) => values.map(([slug, qty]) => ({slug, qty}));
const cart = items(['small',2],['large',1]);
const order = method => ({items:cart,method,name:'Test',email:'test@example.com',address:'123 Test Street',requestId:crypto.randomUUID()});
assert.equal((await call('', 'GET', undefined, ''))[0],401);
assert.equal((await call('', 'GET', undefined, 'readonly'))[0],403);
for (const [qty,shipping] of [[3,800],[4,800],[5,0]]) {
  assert.equal((await call('/quote','POST',{items:items(['small',qty])}))[1].shipping_cents,shipping);
}
for (const [coupon,discount,shipping] of [['TEN',1000,800],['FIVE',500,800],['SHIP',0,0],['ACTIVE',500,800]]) {
  const [status,result] = await call('/quote','POST',{items:cart,coupon});
  assert.equal(status,200);
  assert.equal(result.discount_cents,discount);
  assert.equal(result.shipping_cents,shipping);
}
for (const coupon of ['OLD','WRONG','TEN']) {
  assert.equal((await call('/quote','POST',{items:items(['small',1]),coupon}))[0],400);
}
const cash = order('cashapp');
const [firstStatus,first] = await call('','POST',cash);
assert.equal(firstStatus,201);
assert.equal(first.actual_charge_cents,0);
assert.equal(JSON.parse(first.order.items_json).length,2);
const id = first.order.id;
catalogAvailable = false;
assert.equal((await call('','POST',cash))[1].order.id,id);
catalogAvailable = true;
const [,venmo] = await call('','POST',order('venmo'));
const second = venmo.order.id;
assert.equal(venmo.actual_charge_cents,0);
assert.equal((await call(''))[1].filter(o=>!o.first_viewed_at).length,2);
await call('/view','POST',{id});
assert.equal((await call(''))[1][0].id,second);
await call('/view','POST',{id,unread:true});
assert.equal((await call(''))[1].filter(o=>!o.first_viewed_at).length,2);
const updates = await Promise.all([call('/status','POST',{id,status:'payment_confirmed'}),call('/status','POST',{id,status:'payment_confirmed'})]);
assert.deepEqual(updates.map(update=>update[0]).sort(),[200,409]);
assert.equal((await call('/status','POST',{id,status:'shipped'}))[0],400);
assert.equal((await call('/status','POST',{id,status:'shipped',tracking:'TRACK-TEST'}))[0],200);
assert.equal((await call('/status','POST',{id,status:'completed'}))[0],200);
assert.equal((await call('/status','POST',{id:second,status:'cancelled'}))[0],200);
const detail = (await call('/detail?id='+id))[1];
assert.equal(detail.order.tracking_number,'TRACK-TEST');
assert.deepEqual(detail.history.map(e=>e.status),['awaiting_payment','payment_confirmed','shipped','completed']);
sql.exec("INSERT INTO orders SELECT 'TEST-REAL-FIXTURE',created_at,status,customer_name,email,phone,shipping_address,items_json,subtotal_cents,discount_cents,shipping_cents,total_cents,coupon,payment_method,updated_at,first_viewed_at,0,tracking_number FROM orders LIMIT 1");
sql.exec("INSERT INTO order_events(order_id,status) VALUES ('TEST-REAL-FIXTURE','awaiting_payment')");
assert.equal((await call('/detail?id=TEST-REAL-FIXTURE'))[0],404);
assert.equal((await call('','DELETE',{id}))[0],400);
assert.equal((await call('','DELETE',{id,confirm:'DELETE TEST ORDERS'}))[0],200);
assert.equal((await call('/detail?id='+id))[0],404);
await call('','POST',order('cashapp'));
const [,selected] = await call('','POST',order('venmo'));
assert.equal((await call('','DELETE',{ids:[second,selected.order.id,'TEST-REAL-FIXTURE'],confirm:'DELETE TEST ORDERS'}))[0],200);
assert.equal((await call(''))[1].length,1);
assert.equal((await call('','DELETE',{all:true,confirm:'DELETE TEST ORDERS'}))[0],200);
assert.equal((await call(''))[1].length,0);
assert.equal(sql.prepare('SELECT count(*) AS count FROM orders').get().count,1);
assert.equal(sql.prepare('SELECT order_id FROM order_events').get().order_id,'TEST-REAL-FIXTURE');
console.log('Passed: authorization, shipping boundaries, coupons, two payment methods, zero charges, retry, unread state, history, status conflicts, tracking, cancellation and all test deletion modes with real-order protection.');

sql.exec(readFileSync(new URL('./inventory.sql', import.meta.url), 'utf8'));
sql.exec("INSERT INTO inventory(product_slug,on_hand) VALUES ('fixture',2)");
const {savePendingOrder} = await import('./save-pending-order.mjs');
const fixture = {id:'ORDER-FIXTURE',customerName:'Fixture',email:'fixture@example.com',
  shippingAddress:'Test address',items:[{slug:'fixture',qty:1}],subtotalCents:100,
  discountCents:0,shippingCents:0,totalCents:100,paymentMethod:'cashapp'};
await savePendingOrder(DB,fixture,Math.floor(Date.now()/1000)+300);
const real = async (path, method='GET', payload, token='admin') => {
  const response = await worker.fetch(new Request('https://test.local/orders'+path,{
    method,headers:token ? {Authorization:'Bearer '+token} : {},
    body:payload === undefined ? undefined : JSON.stringify(payload)
  }),{DB});
  return [response.status,await response.json()];
};
assert.equal((await real('','GET',undefined,''))[0],401);
assert.ok((await real(''))[1].some(order=>order.id===fixture.id));
assert.equal((await real(''))[1].find(order=>order.id===fixture.id).email,undefined);
assert.equal((await call('/detail?id='+fixture.id))[0],404);
assert.equal((await real('/view','POST',{id:fixture.id}))[0],200);
assert.equal((await real('/status','POST',{id:fixture.id,status:'payment_confirmed'}))[0],200);
assert.equal((await real('/status','POST',{id:fixture.id,status:'cancelled'}))[0],409);
assert.equal(sql.prepare("SELECT on_hand FROM inventory WHERE product_slug='fixture'").get().on_hand,1);
assert.equal((await real('/status','POST',{id:fixture.id,status:'shipped',tracking:'TRACK-FIXTURE'}))[0],200);
assert.equal((await real('/status','POST',{id:fixture.id,status:'completed'}))[0],200);
assert.equal((await real('/detail?id='+fixture.id))[1].history.length,4);
assert.equal((await real('','DELETE',{id:fixture.id}))[0],404);
console.log('Real order admin passed: sign-in, privacy, test isolation, unread state, inventory consumption, fulfillment history, and deletion protection.');
