const slugPattern = /^[a-z0-9_-]{1,100}$/;

export async function handleAdminInventory(request, db, respond, fetchCatalog = fetch) {
  if (request.method === 'GET') {
    const rows = await db.prepare(`
      SELECT product_slug, on_hand, reserved, on_hand - reserved AS available
      FROM inventory ORDER BY product_slug
    `).all();
    return respond({inventory:rows.results});
  }
  if (request.method !== 'POST') return respond({error:'Method not allowed'},405);
  const input = await request.json().catch(() => null);
  const {slug,onHand,expectedOnHand} = input ?? {};
  const validCount = value => Number.isInteger(value) && value >= 0 && value <= 9999;
  if (typeof slug !== 'string' || !slugPattern.test(slug) || !validCount(onHand) ||
      (expectedOnHand !== null && !validCount(expectedOnHand))) {
    return respond({error:'Enter a whole stock count between 0 and 9999.'},400);
  }
  let change;
  if (expectedOnHand === null) {
    const url = 'https://raw.githubusercontent.com/jeromeleegriffin/wildwood-willow/main/content/products/' + slug + '.md';
    const product = await fetchCatalog(url,{cache:'no-store'}).catch(() => null);
    if (product?.status === 404) return respond({error:'Product was not found in the catalog.'},404);
    if (!product?.ok) return respond({error:'The catalog could not be verified.'},503);
    change = await db.prepare(`
      INSERT INTO inventory(product_slug,on_hand) VALUES (?,?)
      ON CONFLICT(product_slug) DO NOTHING
    `).bind(slug,onHand).run();
  } else {
    change = await db.prepare(`
      UPDATE inventory SET on_hand=?
      WHERE product_slug=? AND on_hand=? AND reserved<=?
    `).bind(onHand,slug,expectedOnHand,onHand).run();
  }
  if (!change.meta.changes) {
    return respond({error:'Stock changed or the count is below reserved units. Refresh inventory and try again.'},409);
  }
  return respond({ok:true});
}
