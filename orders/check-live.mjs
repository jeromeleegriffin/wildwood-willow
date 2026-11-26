import assert from 'node:assert/strict';

const storefront = 'https://wwbotanicals.org';
const worker = 'https://wildwood-willow-orders.jeromeleegriffin.workers.dev';

async function check(path, verify, method = 'GET') {
  await verify(await fetch(path, {method, signal:AbortSignal.timeout(15000), cache:'no-store'}));
}

async function verifyPage(path, pattern) {
  await check(storefront + path, async response => {
    assert.equal(response.status, 200, path);
    assert.match(await response.text(), pattern, path);
  });
}

await Promise.all([
  verifyPage('/admin/', /href="orders\.html"/),
  verifyPage('/admin/test-order.html', /Test order saved/),
  verifyPage('/admin/orders.html', /id="count" class="badge"/),
  verifyPage('/admin/inventory', /Save count/),
  verifyPage('/js/catalog.js', /function displayPrice/),
  verifyPage('/admin/config.yml', /name: variants/),
  verifyPage('/product.html', /id="size-select"/),
  ...['/inventory','/orders'].map(path => check(worker + path, async response => {
    assert.equal(response.status, 401, path);
    assert.deepEqual(await response.json(), {error:'Login required'});
  })),
  ...[['/availability?product=arnica-aloe-cream','GET'],['/checkout','POST']].map(([path,method]) =>
    check(worker + path, async response => {
      assert.equal(response.status, 503, path);
      assert.match((await response.json()).error, /paused/i);
    }, method)
  ),
  check(storefront + '/content/settings/store-status.json', async response => {
    assert.equal(response.status, 200);
    assert.equal((await response.json()).mode, 'pause_orders');
  }),
  check(worker + '/health', async response => {
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {ok:true, mode:'test-only'});
  }),
  check(worker + '/test-orders', async response => {
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {error:'Login required'});
  }),
  check(storefront + '/oauth-proxy/worker.js', async response => {
    assert.ok([403, 404].includes(response.status), 'OAuth source must be inaccessible');
  })
]);
console.log('Live admin, inventory, checkout pause, and OAuth source protections passed.');
