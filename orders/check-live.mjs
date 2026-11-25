import assert from 'node:assert/strict';

const storefront = 'https://wwbotanicals.org';
const worker = 'https://wildwood-willow-orders.jeromeleegriffin.workers.dev';

async function check(path, verify) {
  await verify(await fetch(path, {signal:AbortSignal.timeout(15000), cache:'no-store'}));
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
console.log('Live storefront, admin orders, paused ordering, test-only API, and OAuth source protections passed.');
