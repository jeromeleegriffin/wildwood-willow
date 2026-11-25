import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {sendOrderEmails} from './send-order-emails.mjs';
const sql = new DatabaseSync(':memory:');
for (const name of ['schema.sql','email-outbox.sql']) sql.exec(readFileSync(new URL(name,import.meta.url),'utf8'));
const DB = {prepare:text=>({bind:(...args)=>({
  first:async()=>sql.prepare(text).get(...args),
  run:async()=>sql.prepare(text).run(...args)
})})};
const insert = sql.prepare(`INSERT INTO orders (id,customer_name,email,shipping_address,items_json,
  subtotal_cents,discount_cents,shipping_cents,total_cents,payment_method,is_test)
  VALUES (?, 'Fixture','buyer@example.com','Private address',?,1000,0,800,1800,'venmo',?)`);
insert.run('TEST-FIXTURE','[]',1);
insert.run('ORDER-FIXTURE',JSON.stringify([{qty:1,title:'<Fixture>'}]),0);
assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM order_email_outbox').get().n,2);
const messages=[];
let failCustomer=true;
const ORDER_EMAIL={send:async message=>{
  if(message.to==='buyer@example.com' && failCustomer) throw Error('Temporary failure');
  messages.push(message);
  return {messageId:'message-'+messages.length};
}};
const now=Math.floor(Date.now()/1000);
assert.equal(await sendOrderEmails({DB},now),0);
assert.equal(await sendOrderEmails({DB,ORDER_EMAIL},now),0);
assert.equal(sql.prepare("SELECT attempts FROM order_email_outbox WHERE kind='admin'").get().attempts,0);
const env={DB,ORDER_EMAIL,ORDER_ADMIN_EMAIL:'staff@example.com, second@example.com, STAFF@example.com'};
assert.equal(await sendOrderEmails(env,now),1);
assert.deepEqual(messages[0].to,['staff@example.com']);
assert.deepEqual(messages[0].bcc,['second@example.com']);
assert.doesNotMatch(messages[0].text,/buyer@example.com|Private address/);
assert.match(messages[0].text,/admin\/orders/);
failCustomer=false;
assert.equal(await sendOrderEmails(env,now+119),0);
const successes=await Promise.all([sendOrderEmails(env,now+120),sendOrderEmails(env,now+120)]);
assert.equal(successes[0]+successes[1],1);
assert.equal(messages[1].to,'buyer@example.com');
assert.equal(messages[1].bcc,undefined);
assert.match(messages[1].text,/\$18\.00/);
assert.match(messages[1].text,/Payment is still pending/);
assert.match(messages[1].html,/&lt;Fixture&gt;/);
assert.doesNotMatch(messages[1].html,/<Fixture>/);
assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM order_email_outbox WHERE sent_at IS NOT NULL').get().n,2);
assert.equal(await sendOrderEmails(env,now+3600),0);
console.log('Email outbox passed: real orders only, separate recipients, admin privacy, retries, concurrent claims, and safe content.');
