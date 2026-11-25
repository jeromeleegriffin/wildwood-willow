const batchSize = 100;
const expiredOrders = `
  SELECT o.id
  FROM inventory_holds AS h
  JOIN orders AS o ON o.id = h.order_id
  WHERE h.state = 'held' AND h.expires_at <= ?
    AND o.is_test = 0 AND o.status = 'awaiting_payment'
  GROUP BY o.id
  ORDER BY MIN(h.expires_at), o.id
  LIMIT ?
`;

export async function expireInventoryHolds(db, cutoff = Math.floor(Date.now() / 1000)) {
  // Both statements see the same orders because D1 runs the batch in one transaction.
  // The order status trigger releases all held lines, including any later-expiring lines.
  const [, update] = await db.batch([
    db.prepare(`
      INSERT INTO order_events (order_id, status)
      SELECT id, 'cancelled' FROM (${expiredOrders})
    `).bind(cutoff, batchSize),
    db.prepare(`
      UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
      WHERE id IN (${expiredOrders})
    `).bind(cutoff, batchSize)
  ]);
  return update.meta.changes;
}
