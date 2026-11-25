import assert from 'node:assert/strict';
import {isGuestCheckoutOpen, validateGuestCheckout} from './guest-checkout.mjs';

const body = {
  requestId:'61c21412-bfde-4ddb-916b-7c4bdb1c9993',
  items:[{slug:'Some-Product',qty:2,price_cents:1}],
  customerName:' Test Customer ', email:'test@example.com',
  address:{street:'123 Test Street',unit:'Apt 1',city:'Test City',region:'TN',postalCode:'00000'},
  paymentMethod:'cashapp',coupon:' spring ',totalCents:1
};
const valid = validateGuestCheckout(body);
assert.deepEqual(valid.items,[{slug:'some-product',qty:2}]);
assert.equal(valid.customerName,'Test Customer');
assert.equal(valid.shippingAddress,'123 Test Street\nApt 1\nTest City, TN 00000');
assert.equal(valid.coupon,'SPRING');
assert.equal(valid.totalCents,undefined);
assert.throws(() => validateGuestCheckout({...body,items:[...body.items,{slug:'some-product',qty:1}]}), /quantities/);
for (const qty of [0,100,2.5,'2']) {
  assert.throws(() => validateGuestCheckout({...body,items:[{slug:'some-product',qty}]}), /quantities/);
}
assert.throws(() => validateGuestCheckout({...body,items:[{slug:'../other',qty:1}]}), /quantities/);
assert.throws(() => validateGuestCheckout({...body,paymentMethod:'unknown'}), /Cash App/);
assert.throws(() => validateGuestCheckout({...body,requestId:'bad'}), /new checkout/);
assert.throws(() => validateGuestCheckout({...body,email:'x@y'}), /email address/);
assert.throws(() => validateGuestCheckout({...body,address:{...body.address,postalCode:''}}), /postal code/);

const open = {REAL_CHECKOUT_ENABLED:'true'};
assert.equal(await isGuestCheckoutOpen({}, () => assert.fail('Should not fetch while disabled')),false);
for (const mode of ['open','pause_orders','temporarily_closed','unknown',undefined]) {
  assert.equal(await isGuestCheckoutOpen(open,(url,options)=>{
    assert.match(url,/\/main\/content\/settings\/store-status.json$/);
    assert.equal(options.cache,'no-store');
    return Response.json({mode});
  }),mode==='open');
}
assert.equal(await isGuestCheckoutOpen(open,()=>new Response('unavailable',{status:503})),false);
assert.equal(await isGuestCheckoutOpen(open,()=>new Response('invalid json')),false);
assert.equal(await isGuestCheckoutOpen(open,()=>{throw Error('network');}),false);
console.log('Guest checkout passed: cart/contact validation, client prices ignored, and fail-closed availability.');
