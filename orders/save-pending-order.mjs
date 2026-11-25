// Accepts a server-validated quote. The checkout handler must enforce store
// availability and compute all prices, discounts, and shipping before calling.
export async function savePendingOrder(db, order, holdExpiresAt) {
  if (!Array.isArray(order.items) || !order.items.length) {
    throw new TypeError('A pending order requires at least one item');
  }

  const createOrder = db.prepare(`
    INSERT INTO orders (
      id, customer_name, email, phone, shipping_address, items_json,
      subtotal_cents, discount_cents, shipping_cents, tax_cents, total_cents, coupon,
      payment_method, status, is_test
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'awaiting_payment', 0)
  `).bind(
    order.id, order.customerName, order.email, order.phone ?? null, order.shippingAddress,
    JSON.stringify(order.items), order.subtotalCents, order.discountCents,
    order.shippingCents, order.taxCents ?? 0, order.totalCents, order.coupon ?? null, order.paymentMethod
  );
  const insertHold = db.prepare(`
    INSERT INTO inventory_holds (order_id, product_slug, quantity, expires_at)
    VALUES (?, ?, ?, ?)
  `);
  const holds = order.items.map(item => insertHold.bind(order.id, item.slug, item.qty, holdExpiresAt));
  const initialEvent = db.prepare(`
    INSERT INTO order_events (order_id, status) VALUES (?, 'awaiting_payment')
  `).bind(order.id);

  await db.batch([createOrder, ...holds, initialEvent]);
}
