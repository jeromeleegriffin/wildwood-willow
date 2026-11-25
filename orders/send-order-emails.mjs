const from = {email:'notifications@orders.wwbotanicals.org',name:'Wildwood & Willow Botanicals'};
const ordersPage = 'https://wwbotanicals.org/admin/orders.html?view=real';
const amount = cents => '$' + (cents / 100).toFixed(2);
const safe = text => String(text).replace(/[&<>"']/g,char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
})[char]);

function orderMessage(order,kind,adminAddresses) {
  const customer = kind === 'customer';
  const method = order.payment_method === 'cashapp' ? 'Cash App' : 'Venmo';
  const status = {
    awaiting_payment:'Awaiting payment', payment_confirmed:'Payment confirmed',
    shipped:'Shipped', completed:'Completed', cancelled:'Cancelled'
  }[order.status];
  const lines = customer ? [
    'Thank you for shopping with Wildwood & Willow Botanicals.',
    'Order: ' + order.id,
    ...JSON.parse(order.items_json).map(item => item.qty + ' × ' + item.title),
    'Merchandise: ' + amount(order.subtotal_cents),
    'Discount: ' + amount(order.discount_cents),
    'Shipping: ' + amount(order.shipping_cents),
    'Total: ' + amount(order.total_cents),
    'Selected payment method: ' + method,
    'Status: ' + status,
    ...(order.status === 'awaiting_payment'
      ? ['This email confirms receipt of your order. Payment is still pending. Use the payment instructions shown at checkout, and include your order number when paying.']
      : []),
    'Questions? Visit https://wwbotanicals.org/#contact.'
  ] : [
    'A new online order was received.',
    'Order: ' + order.id,
    'Total: ' + amount(order.total_cents),
    'Status: ' + status,
    'Open the administrator dashboard to review: ' + ordersPage
  ];
  return {
    from,to:customer ? order.email : [adminAddresses[0]],
    ...(!customer && adminAddresses.length > 1 ? {bcc:adminAddresses.slice(1)} : {}),
    subject:(customer ? 'Order received: ' : 'New online order: ') + order.id,
    text:lines.join('\n'),
    html:lines.map(line=>'<p>'+safe(line)+'</p>').join('')
  };
}

const maxAttempts = 6;
export async function sendOrderEmails(env, now = Math.floor(Date.now()/1000)) {
  if (!env.ORDER_EMAIL?.send) return 0;
  const configured = typeof env.ORDER_ADMIN_EMAIL === 'string' ? env.ORDER_ADMIN_EMAIL : '';
  const adminAddresses = [...new Set(configured.split(',').map(address => address.trim().toLowerCase()).filter(Boolean))];
  const adminReady = adminAddresses.length > 0 && adminAddresses.length <= 50 &&
    adminAddresses.every(address => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address));
  let sent = 0;
  for (let index=0; index<20; index++) {
    const token = crypto.randomUUID();
    const job = await env.DB.prepare(`
      UPDATE order_email_outbox SET lease_token=?, leased_until=?, attempts=attempts+1
      WHERE (order_id,kind) = (
        SELECT order_id,kind FROM order_email_outbox
        WHERE sent_at IS NULL AND attempts<? AND next_attempt_at<=?
          AND (leased_until IS NULL OR leased_until<=?) AND (kind='customer' OR ?=1)
        ORDER BY next_attempt_at,order_id,kind LIMIT 1
      )
      RETURNING order_id,kind,attempts
    `).bind(token,now+600,maxAttempts,now,now,adminReady?1:0).first();
    if (!job) break;
    const order = await env.DB.prepare(`SELECT id,email,items_json,subtotal_cents,discount_cents,
      shipping_cents,total_cents,status,payment_method FROM orders WHERE id=? AND is_test=0
    `).bind(job.order_id).first();
    let delivery;
    try {
      if (!order) throw Error('Order unavailable');
      delivery = await env.ORDER_EMAIL.send(orderMessage(order,job.kind,adminAddresses));
    } catch {
      await env.DB.prepare(`UPDATE order_email_outbox SET next_attempt_at=?,lease_token=NULL,leased_until=NULL
        WHERE order_id=? AND kind=? AND lease_token=?`)
        .bind(now+Math.min(3600,60*2**job.attempts),job.order_id,job.kind,token).run();
      continue;
    }
    await env.DB.prepare(`UPDATE order_email_outbox SET sent_at=?,message_id=?,lease_token=NULL,leased_until=NULL
      WHERE order_id=? AND kind=? AND lease_token=?`)
      .bind(now,delivery?.messageId ?? null,job.order_id,job.kind,token).run();
    sent++;
  }
  return sent;
}
