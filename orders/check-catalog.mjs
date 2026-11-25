import { readFileSync, readdirSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const window = {};
runInNewContext(readFileSync(new URL('../js/catalog.js', import.meta.url), 'utf8'), {window});
const {parse, stock} = window.WWCatalog;
const directory = new URL('../content/products/', import.meta.url);
const files = readdirSync(directory).filter(name => /^[a-z0-9_-]+\.md$/i.test(name)).sort();
if (!files.length) throw new Error('No product records found.');
const issues = [];
for (const file of files) {
  const product = parse(readFileSync(new URL(file, directory), 'utf8'));
  if (!product?.title) {
    issues.push(file + ' — missing product front matter or title');
    continue;
  }
  if (stock(product) === null) issues.push(product.title + ' — missing or invalid quantity');
  if (!/^\$?\d+(?:\.\d{1,2})?$/.test(product.price?.trim() || '')) {
    issues.push(product.title + ' — missing or invalid price');
  }
}
console.log('Catalog products inspected: ' + files.length);
for (const issue of issues) console.error(issue);
if (issues.length) process.exitCode = 1;
