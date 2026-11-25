import { readFileSync, readdirSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const window = {};
runInNewContext(readFileSync(new URL('../js/catalog.js', import.meta.url), 'utf8'), {window});
const {parse, stock} = window.WWCatalog;
const directory = new URL('../content/products/',import.meta.url);
const products = readdirSync(directory).filter(name => /^[a-z0-9_-]+\.md$/.test(name)).sort();
if (!products.length) throw new Error('No catalog products found.');

const values = [];
for (const name of products) {
  const quantity = stock(parse(readFileSync(new URL(name,directory),'utf8')));
  const slug = name.slice(0,-3);
  if (quantity === null) {
    console.error('Skipped ' + slug + ': stock quantity is missing or invalid.');
    continue;
  }
  values.push("  ('" + slug + "', " + quantity + ")");
}
if (!values.length) throw new Error('No products with confirmed quantities found.');

console.log('INSERT INTO inventory (product_slug, on_hand) VALUES\n' +
  values.join(',\n') + '\nON CONFLICT(product_slug) DO NOTHING;');
