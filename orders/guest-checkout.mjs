const storeStatusUrl = 'https://raw.githubusercontent.com/jeromeleegriffin/wildwood-willow/main/content/settings/store-status.json';

function requiredText(value, max, label) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > max || /[\x00-\x1f\x7f]/.test(text)) {
    throw new TypeError('Enter a valid ' + label + '.');
  }
  return text;
}

export function validateGuestCheckout(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new TypeError('Enter checkout details.');
  }
  const requestId = typeof body.requestId === 'string' ? body.requestId.toLowerCase() : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(requestId)) {
    throw new TypeError('Start a new checkout and try again.');
  }
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 40) {
    throw new TypeError('Choose between 1 and 40 products.');
  }
  const seen = new Set();
  const items = body.items.map(item => {
    const slug = typeof item?.slug === 'string' ? item.slug.toLowerCase() : '';
    if (!/^[a-z0-9_-]{1,100}$/.test(slug) || seen.has(slug) ||
        !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 99) {
      throw new TypeError('Check the products and quantities in your cart.');
    }
    seen.add(slug);
    return {slug, qty:item.qty};
  });
  const email = requiredText(body.email, 200, 'email address');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new TypeError('Enter a valid email address.');
  }
  if (!['cashapp','venmo'].includes(body.paymentMethod)) {
    throw new TypeError('Choose Cash App or Venmo.');
  }
  const address = body.address;
  const street = requiredText(address?.street, 150, 'street address');
  const unit = address?.unit ? requiredText(address.unit, 80, 'unit') : '';
  const city = requiredText(address?.city, 100, 'city');
  const region = requiredText(address?.region, 50, 'state or region');
  const postalCode = requiredText(address?.postalCode, 20, 'postal code');
  return {
    requestId, items, email, paymentMethod:body.paymentMethod,
    customerName:requiredText(body.customerName,120,'customer name'),
    phone:body.phone ? requiredText(body.phone,40,'phone number') : null,
    shippingAddress:[street,unit,city + ', ' + region + ' ' + postalCode].filter(Boolean).join('\n'),
    coupon:body.coupon ? requiredText(body.coupon,80,'coupon code').toUpperCase() : null
  };
}

export async function isGuestCheckoutOpen(env, fetchStoreStatus = fetch) {
  if (env.REAL_CHECKOUT_ENABLED !== 'true') return false;
  try {
    const response = await fetchStoreStatus(storeStatusUrl, {cache:'no-store'});
    return response.ok && (await response.json())?.mode === 'open';
  } catch {
    return false;
  }
}
