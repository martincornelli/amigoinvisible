import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draw, invitationCode } from '../src/draw.js';
test('matching respects couples and gives and receives exactly once',()=>{
  for(let size=4;size<=50;size++)for(let attempt=0;attempt<10;attempt++){
    const people=Array.from({length:size},(_,i)=>({id:String(i),partnerId:i<2?String(1-i):null}));
    const result=draw(people);
    assert.ok(result);assert.equal(Object.keys(result).length,size);assert.equal(new Set(Object.values(result)).size,size);
    for(const p of people){assert.notEqual(result[p.id],p.id);assert.notEqual(result[p.id],p.partnerId);}
  }
});
test('impossible matching is reported and invalid people rejected',()=>{
  assert.equal(draw([{id:'a',partnerId:'b'},{id:'b',partnerId:'a'},{id:'c'}]),null);
  assert.throws(()=>draw([{id:'a'},{id:'a'},{id:'b'}]));
  assert.throws(()=>draw([{id:'a',partnerId:'x'},{id:'b'},{id:'c'}]));
});
test('invitation parser accepts shared web and existing Android links only',()=>{
  const code='a'.repeat(48);
  for(const link of [code,`https://martincornelli.github.io/amigoinvisible/#join/${code}`,`https://entre-nosotros-e8c82.web.app/join/${code}`]) assert.equal(invitationCode(link),code);
  for(const link of ['',`https://evil.test/#join/${code}`,`https://martincornelli.github.io.evil.test/amigoinvisible/#join/${code}`,`https://martincornelli.github.io/amigoinvisible/#join/<script>`,code+'a'])assert.equal(invitationCode(link),null);
});
