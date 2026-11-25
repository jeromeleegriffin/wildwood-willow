CREATE TABLE IF NOT EXISTS inventory (
  product_slug TEXT PRIMARY KEY,
  on_hand INTEGER NOT NULL CHECK (typeof(on_hand) = 'integer' AND on_hand >= 0),
  reserved INTEGER NOT NULL DEFAULT 0
    CHECK (typeof(reserved) = 'integer' AND reserved BETWEEN 0 AND on_hand)
);

CREATE TABLE IF NOT EXISTS inventory_holds (
  order_id TEXT NOT NULL REFERENCES orders(id),
  product_slug TEXT NOT NULL REFERENCES inventory(product_slug),
  quantity INTEGER NOT NULL CHECK (typeof(quantity) = 'integer' AND quantity > 0),
  expires_at INTEGER NOT NULL CHECK (typeof(expires_at) = 'integer' AND expires_at > 0),
  state TEXT NOT NULL DEFAULT 'held' CHECK (state IN ('held', 'released', 'consumed')),
  PRIMARY KEY (order_id, product_slug)
);

CREATE INDEX IF NOT EXISTS inventory_holds_expiry
  ON inventory_holds(expires_at, order_id) WHERE state = 'held';

CREATE TRIGGER IF NOT EXISTS inventory_hold_add
AFTER INSERT ON inventory_holds
BEGIN
  SELECT RAISE(ABORT, 'Only awaiting-payment real orders can reserve stock')
    WHERE NEW.state <> 'held'
      OR NEW.expires_at <= unixepoch()
      OR NOT EXISTS (
        SELECT 1 FROM orders WHERE id = NEW.order_id AND is_test = 0
          AND status = 'awaiting_payment'
      );
  UPDATE inventory SET reserved = reserved + NEW.quantity
    WHERE product_slug = NEW.product_slug AND on_hand - reserved >= NEW.quantity;
  SELECT RAISE(ABORT, 'Insufficient or unconfirmed stock') WHERE changes() <> 1;
END;

CREATE TRIGGER IF NOT EXISTS inventory_hold_change
BEFORE UPDATE ON inventory_holds
BEGIN
  SELECT RAISE(ABORT, 'Invalid inventory hold transition')
    WHERE OLD.state <> 'held' OR NEW.state NOT IN ('released', 'consumed')
      OR NEW.order_id <> OLD.order_id OR NEW.product_slug <> OLD.product_slug
      OR NEW.quantity <> OLD.quantity OR NEW.expires_at <> OLD.expires_at;
  SELECT RAISE(ABORT, 'Expired inventory hold cannot be consumed')
    WHERE NEW.state = 'consumed' AND OLD.expires_at <= unixepoch();
  UPDATE inventory SET
    reserved = reserved - OLD.quantity,
    on_hand = on_hand - CASE WHEN NEW.state = 'consumed' THEN OLD.quantity ELSE 0 END
    WHERE product_slug = OLD.product_slug;
END;

CREATE TRIGGER IF NOT EXISTS inventory_hold_keep_active
BEFORE DELETE ON inventory_holds WHEN OLD.state = 'held'
BEGIN
  SELECT RAISE(ABORT, 'Release the inventory hold before deleting it');
END;

CREATE TRIGGER IF NOT EXISTS inventory_hold_order_status
AFTER UPDATE OF status ON orders
WHEN OLD.is_test = 0 AND OLD.status = 'awaiting_payment'
  AND NEW.status IN ('payment_confirmed', 'cancelled')
BEGIN
  UPDATE inventory_holds
    SET state = CASE WHEN NEW.status = 'payment_confirmed' THEN 'consumed' ELSE 'released' END
    WHERE order_id = NEW.id AND state = 'held';
END;
