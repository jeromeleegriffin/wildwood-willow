import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
let handler;
runInNewContext(readFileSync(new URL('../admin/size-ids.js',import.meta.url),'utf8'),{
  CMS:{registerEventListener(h){assert.equal(h.name,'preSave');handler=h.handler;}}
});
const map = obj => ({
  get:k=>obj[k],set:(k,v)=>map({...obj,[k]:v}),toJS:()=>obj
});
const list = rows => ({
  size:rows.length,toJS:()=>rows,map:fn=>list(rows.map((row,i)=>fn(map(row),i).toJS()))
});
function save(rows,collection='products'){
  const data=map({variants:list(rows)});
  const result=handler({entry:map({collection,data})});
  return result?.get('variants').toJS();
}
const rows=save([{size:'4 oz',price:'10.00',id:''},{size:'8 OZ',price:'16.00'}]);
assert.equal(rows[0].id,'4-oz');
assert.equal(rows[1].id,'8-oz');
assert.equal(rows[0].price,'10.00');
assert.equal(save([{...rows[0],size:'4 ounce',price:'12.00'}])[0].id,'4-oz');
assert.equal(save([{size:'old',id:'4-oz'},{size:'4 oz'}])[1].id,'4-oz-2');
assert.throws(()=>save([{size:'4 oz'},{size:'4 OZ'}]),/different name/);
assert.throws(()=>save([{size:'one',id:'same'},{size:'two',id:'same'}]),/duplicate/);
assert.equal(save([], 'services'),undefined);
console.log('Automatic size ID tests passed: generation, price edits, stable IDs, collisions and duplicate validation.');
