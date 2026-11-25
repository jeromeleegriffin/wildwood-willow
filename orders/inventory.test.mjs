import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
for (const name of ['schema.sql', 'inventory.sql']) {
  db.exec(readFileSync(new URL(name, import.meta.url), 'utf8'));
}

const expiry = Math.floor(Date.now() / 1000) + 60;
const insertOrder = db.prepare(`INSERT INTO orders (
  id,customer_name,email,shipping_address,items_json,subtotal_cents,discount_cents,
  shipping_cents,total_cents,payment_method,is_test
) VALUES (?, 'Fixture','test@example.com','Test address','[]',100,0,0,100,'cashapp',?)`);
const insertHold = db.prepare('INSERT INTO inventory_holds(order_id,product_slug,quantity,expires_at) VALUES (?,?,?,?)');
function reserve(id, items, {test = 0, expires = expiry} = {}) {
  db.exec('BEGIN');
  try {
    insertOrder.run(id, test);
    for (const [slug, quantity] of items) insertHold.run(id, slug, quantity, expires);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
const stock = slug => {
  const row = db.prepare('SELECT on_hand,reserved FROM inventory WHERE product_slug=?').get(slug);
  return [row.on_hand,row.reserved];
};
const status = db.prepare('UPDATE orders SET status=? WHERE id=?');
db.exec("INSERT INTO inventory(product_slug,on_hand) VALUES ('first',1),('second',3)");
reserve('real-first',[['first',1]]);
assert.throws(() => reserve('real-late',[['second',1],['first',1]]), /Insufficient/);
assert.deepEqual(stock('second'),[3,0]);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM orders WHERE id='real-late'").get().n,0);
assert.throws(() => reserve('unknown',[['missing',1]]), /Insufficient/);
assert.throws(() => reserve('simulation',[['second',1]],{test:1}), /real orders/);
assert.throws(() => reserve('expired',[['second',1]],{expires:1}), /reserve stock/);
assert.throws(() => db.exec("UPDATE inventory SET on_hand=0 WHERE product_slug='first'"), /CHECK/);
assert.throws(() => db.exec("DELETE FROM inventory_holds WHERE order_id='real-first'"), /Release/);
status.run('cancelled','real-first');
assert.deepEqual(stock('first'),[1,0]);
status.run('cancelled','real-first');
assert.deepEqual(stock('first'),[1,0]);
reserve('real-paid',[['first',1],['second',2]]);
status.run('payment_confirmed','real-paid');
assert.deepEqual(stock('first'),[0,0]);
assert.deepEqual(stock('second'),[1,0]);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM inventory_holds WHERE order_id='real-paid' AND state='consumed'").get().n,2);
console.log('Inventory passed: last-unit protection, multi-line rollback, unknown stock, test isolation, expiry validation, cancellation release, and payment consumption.');

const {expireInventoryHolds} = await import('./expire-inventory-holds.mjs');
const adapter = {
  prepare(query) {
    return {bind: (...args) => ({
      run: () => db.prepare(query).run(...args),
      first: async () => db.prepare(query).get(...args)
    })};
  },
  async batch(statements) {
    db.exec('BEGIN');
    try {
      const results = statements.map(statement => ({meta:statement.run()}));
      db.exec('COMMIT');
      return results;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
};
db.exec("INSERT INTO inventory(product_slug,on_hand) VALUES ('later',2),('expiring',101)");
reserve('real-unpaid',[['expiring',1],['later',1]],{expires:expiry});
reserve('real-current',[['later',1]],{expires:expiry+120});
insertOrder.run('test-unpaid',1);
for (let n = 0; n < 100; n++) reserve('expired-'+n,[['expiring',1]]);
assert.equal(await expireInventoryHolds(adapter,expiry-1),0);
assert.equal(await expireInventoryHolds(adapter,expiry),100);
assert.equal(await expireInventoryHolds(adapter,expiry),1);
assert.equal(await expireInventoryHolds(adapter,expiry),0);
assert.deepEqual(stock('expiring'),[101,0]);
assert.deepEqual(stock('later'),[2,1]);
const getStatus = db.prepare('SELECT status FROM orders WHERE id=?');
assert.equal(getStatus.get('real-unpaid').status,'cancelled');
assert.equal(getStatus.get('real-current').status,'awaiting_payment');
assert.equal(getStatus.get('test-unpaid').status,'awaiting_payment');
assert.equal(getStatus.get('real-paid').status,'payment_confirmed');
const eventCounts = db.prepare(`
  SELECT COUNT(*) AS n, COUNT(DISTINCT order_id) AS unique_orders
  FROM order_events WHERE status='cancelled'
`).get();
assert.equal(eventCounts.n,101);
assert.equal(eventCounts.unique_orders,101);
console.log('Expiry passed: cutoff, batch limit, stock release, one cancellation event per order, repeated runs, and paid/test order protection.');

const {savePendingOrder} = await import('./save-pending-order.mjs');
const checkoutOrder = {
  id:'checkout-created', customerName:'Fixture', email:'test@example.com',
  shippingAddress:'Test address', items:[{slug:'expiring',qty:2,price_cents:1500}],
  subtotalCents:3000, discountCents:100, shippingCents:800, totalCents:3700,
  paymentMethod:'venmo'
};
const checkoutExpiry = Math.floor(Date.now() / 1000) + 300;
await savePendingOrder(adapter,checkoutOrder,checkoutExpiry);
const stored = db.prepare('SELECT * FROM orders WHERE id=?').get(checkoutOrder.id);
assert.equal(stored.is_test,0);
assert.equal(stored.status,'awaiting_payment');
assert.equal(stored.total_cents,3700);
assert.deepEqual(JSON.parse(stored.items_json),checkoutOrder.items);
assert.deepEqual(stock('expiring'),[101,2]);
await assert.rejects(savePendingOrder(adapter,checkoutOrder,checkoutExpiry), /UNIQUE/);
assert.deepEqual(stock('expiring'),[101,2]);
await assert.rejects(savePendingOrder(adapter,{
  ...checkoutOrder,id:'checkout-rejected',
  items:[...checkoutOrder.items,{slug:'later',qty:2,price_cents:1500}]
},checkoutExpiry), /Insufficient/);
assert.equal(getStatus.get('checkout-rejected'),undefined);
assert.deepEqual(stock('expiring'),[101,2]);
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM order_events WHERE order_id=?').get(checkoutOrder.id).n,1);
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM order_events WHERE order_id=?').get('checkout-rejected').n,0);
console.log('Checkout persistence passed: order, holds, and history commit together, duplicate ID cannot reserve again, and a rejected cart rolls back.');

const {submitGuestOrder} = await import('./submit-guest-order.mjs');
const fakeCatalog = url => url.endsWith('store-status.json') ?
  Response.json({mode:'open'}) :
  new Response('---\ntitle: Fixture\nprice: $8.00\nquantity_available: 2\n---\n');
db.exec("INSERT INTO inventory(product_slug,on_hand) VALUES ('handler-fixture',1)");
const env = {DB:adapter,REAL_CHECKOUT_ENABLED:'true'};
const guest = {
  requestId:crypto.randomUUID(), customerName:'Guest', email:'guest@example.com',
  address:{street:'123 Main',city:'Test',region:'TN',postalCode:'00000'},
  items:[{slug:'handler-fixture',qty:1,price_cents:1}],paymentMethod:'cashapp',totalCents:1
};
function submit(details, settings = env) {
  return submitGuestOrder(new Request('https://example.com/checkout',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(details)
  }),settings,{fetchCatalog:fakeCatalog});
}
assert.equal((await submit(guest,{DB:adapter})).status,503);
assert.equal((await submit({...guest,customerName:'x'.repeat(17000)})).status,400);
const [one,two] = await Promise.all([submit(guest),submit(guest)]);
assert.deepEqual([one.status,two.status].sort(),[200,201]);
const result = await one.json();
assert.equal(result.order.status,'awaiting_payment');
assert.equal(result.order.totalCents,1600);
assert.equal(result.order.email,undefined);
assert.equal((await two.json()).order.id,result.order.id);
assert.deepEqual(stock('handler-fixture'),[1,1]);
assert.equal((await submit({...guest,customerName:'Changed guest'})).status,409);
assert.equal((await submit({...guest,requestId:crypto.randomUUID()})).status,409);
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM order_events WHERE order_id=?').get(result.order.id).n,1);
console.log('Guest submission passed: disabled gate, request limit, server pricing, safe receipt, concurrent retry, and stock conflict.');
