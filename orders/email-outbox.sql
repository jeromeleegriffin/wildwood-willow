CREATE TABLE IF NOT EXISTS order_email_outbox (
  order_id TEXT NOT NULL REFERENCES orders(id),
  kind TEXT NOT NULL CHECK (kind IN ('customer','admin')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT (unixepoch()),
  lease_token TEXT,
  leased_until INTEGER,
  sent_at INTEGER,
  message_id TEXT,
  PRIMARY KEY (order_id, kind)
);

CREATE INDEX IF NOT EXISTS order_email_outbox_pending
  ON order_email_outbox(next_attempt_at, leased_until, order_id, kind)
  WHERE sent_at IS NULL;

CREATE TRIGGER IF NOT EXISTS enqueue_real_order_emails
AFTER INSERT ON orders
WHEN NEW.is_test = 0 AND NEW.status = 'awaiting_payment'
BEGIN
  INSERT INTO order_email_outbox(order_id,kind)
    VALUES (NEW.id,'customer'),(NEW.id,'admin');
END;
