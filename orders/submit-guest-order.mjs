import {isGuestCheckoutOpen, validateGuestCheckout} from './guest-checkout.mjs';
import {quoteGuestOrder, QuoteError} from './quote-guest-order.mjs';
import {savePendingOrder} from './save-pending-order.mjs';

const bodyLimit = 16 * 1024;
const holdSeconds = 30 * 60;

async function readBody(request) {
  if (!request.body) throw new TypeError('Enter checkout details.');
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8',{fatal:true});
  let size = 0;
  let text = '';
  try {
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > bodyLimit) throw new TypeError('Checkout details are too large.');
      text += decoder.decode(value,{stream:true});
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function findOrder(db,id) {
  return db.prepare(`
    SELECT id, status, items_json, customer_name, email, phone, shipping_address,
      payment_method, coupon, subtotal_cents, shipping_cents, discount_cents, total_cents,
      (SELECT MIN(expires_at) FROM inventory_holds WHERE order_id = orders.id) AS expires_at
    FROM orders WHERE id = ? AND is_test = 0
  `).bind(id).first();
}

function receipt(order) {
  return {
    id:order.id,status:order.status,subtotalCents:order.subtotal_cents,
    discountCents:order.discount_cents,shippingCents:order.shipping_cents,
    totalCents:order.total_cents,holdExpiresAt:order.expires_at
  };
}

function sameSubmission(saved, input) {
  const items = JSON.parse(saved.items_json);
  return saved.customer_name === input.customerName && saved.email === input.email &&
    saved.phone === input.phone && saved.shipping_address === input.shippingAddress &&
    saved.payment_method === input.paymentMethod && saved.coupon === input.coupon &&
    items.length === input.items.length &&
    items.every((item,index) => item.slug === input.items[index].slug && item.qty === input.items[index].qty);
}

function response(body, status) {
  return Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
}

function replay(saved, input) {
  if (!sameSubmission(saved,input)) return response({error:'This checkout was already submitted with different details.'},409);
  return response({order:receipt(saved)},200);
}

export async function submitGuestOrder(request, env, {fetchCatalog = fetch, date = new Date()} = {}) {
  if (!await isGuestCheckoutOpen(env,fetchCatalog)) {
    return response({error:'Online ordering is currently paused.'},503);
  }
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) {
    return response({error:'Send checkout details as JSON.'},415);
  }
  let body;
  try {
    body = await readBody(request);
  } catch {
    return response({error:'Enter valid checkout details under 16 KB.'},400);
  }
  let input;
  try {
    input = validateGuestCheckout(body);
  } catch (error) {
    return response({error:error.message},400);
  }
  const id = 'ORDER-' + input.requestId.toUpperCase();
  try {
    const saved = await findOrder(env.DB,id);
    if (saved) return replay(saved,input);
    const quote = await quoteGuestOrder(input,{date,fetchCatalog});
    const expires = Math.floor(date.getTime()/1000) + holdSeconds;
    try {
      await savePendingOrder(env.DB,{...input,...quote,id},expires);
    } catch (error) {
      const concurrent = await findOrder(env.DB,id);
      if (concurrent) return replay(concurrent,input);
      if (String(error?.message).includes('Insufficient or unconfirmed stock')) {
        return response({error:'Stock changed. Review the quantities in your cart.'},409);
      }
      throw error;
    }
    return response({order:{
      id,status:'awaiting_payment',subtotalCents:quote.subtotalCents,
      discountCents:quote.discountCents,shippingCents:quote.shippingCents,
      totalCents:quote.totalCents,holdExpiresAt:expires
    }},201);
  } catch (error) {
    if (error instanceof QuoteError) return response({error:error.message},422);
    return response({error:'Checkout is temporarily unavailable. Try again.'},503);
  }
}
