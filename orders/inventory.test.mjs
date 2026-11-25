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
