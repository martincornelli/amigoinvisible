import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDocFromServer,collection,getDocs,deleteDoc,updateDoc} from 'firebase/firestore';
import {Repository} from '../src/repository.js';
let env;
const repo=uid=>new Repository(env.authenticatedContext(uid).firestore(),{currentUser:{uid}});
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-entre-nosotros',firestore:{rules:readFileSync('firestore.rules','utf8')}});});
beforeEach(()=>env.clearFirestore());after(()=>env.cleanup());

test('removing a participant clears their couple, keeps capacity and permits later rejoining',async()=>{
 const owner=repo('owner');const id=await owner.create({title:'Bajas',name:'Ana',capacity:4,budget:''});
 for(const uid of ['b','c','d'])await repo(uid).join(id,uid);
 await owner.partner(id,'owner','b');await owner.partner(id,'c','d');
 await owner.removeParticipant(id,'b');let current=await owner.get(id);
 assert.deepEqual(current.memberIds,['owner','c','d']);assert.equal(current.people.b,undefined);
 assert.equal(current.people.owner.partnerId,'');assert.equal(current.people.c.partnerId,'d');
 assert.equal(current.capacity,4);assert.equal((await repo('b').list()).length,0);
 await assert.rejects(owner.execute(id),/faltan/);
 await assert.rejects(owner.removeParticipant(id,'b'),/ya no/);
 await repo('b').join(id,'B de nuevo');assert.equal((await owner.get(id)).people.b.partnerId,'');
 await owner.removeParticipant(id,'b');await owner.capacity(id,3);
 await owner.partner(id,'c','');await owner.execute(id);
 await assert.rejects(owner.removeParticipant(id,'c'),/cerrado/);
 current=await owner.get(id);
 const people={...current.people};delete people.c;
 await assertFails(updateDoc(doc(owner.db,'exchanges',id),{memberIds:['owner','d'],people}));
});

test('removal rules reject nonowners, owner removal, dangling partners and unrelated changes',async()=>{
 const owner=repo('owner');const id=await owner.create({title:'Permisos bajas',name:'Ana',capacity:4,budget:''});
 for(const uid of ['b','c','d'])await repo(uid).join(id,uid);
 await owner.partner(id,'b','c');const current=await owner.get(id);
 const people={...current.people};delete people.b;
 const change={memberIds:['owner','c','d'],people};
 await assertFails(updateDoc(doc(owner.db,'exchanges',id),change));
 people.c={...people.c,partnerId:''};
 for(const uid of ['b','stranger'])await assertFails(updateDoc(doc(repo(uid).db,'exchanges',id),change));
 await assert.rejects(repo('b').removeParticipant(id,'c'),/creador/);
 await assert.rejects(owner.removeParticipant(id,'owner'),/organiza/);
 const withoutOwner={...current.people};delete withoutOwner.owner;
 await assertFails(updateDoc(doc(owner.db,'exchanges',id),{memberIds:['b','c','d'],people:withoutOwner}));
 await assertFails(updateDoc(doc(owner.db,'exchanges',id),{...change,capacity:3}));
 await assertFails(updateDoc(doc(owner.db,'exchanges',id),{...change,people:{...people,d:{name:'Changed',partnerId:''}}}));
 await assertFails(updateDoc(doc(owner.db,'exchanges',id),{memberIds:['owner','d'],people:{owner:people.owner,d:people.d}}));
 await owner.removeParticipant(id,'b');assert.equal((await owner.get(id)).people.c.partnerId,'');
});

test('concurrent removal and drawing never leave a partial finalized encounter',async()=>{
 const owner=repo('owner');const id=await owner.create({title:'Carrera',name:'Ana',capacity:3,budget:''});
 await repo('b').join(id,'B');await repo('c').join(id,'C');
 const outcomes=await Promise.allSettled([owner.removeParticipant(id,'b'),owner.execute(id)]);
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
 const current=await owner.get(id);
 if(current.status==='drawn'){assert.equal(current.memberIds.length,3);assert.ok(await repo('b').result(current));}
 else {assert.equal(current.memberIds.length,2);await assertFails(getDocFromServer(doc(owner.db,'exchanges',id,'results','owner')));}
});
test('four web accounts create, join, set couples, draw and reopen private results',async()=>{
 const owner=repo('owner'),other=repo('other'),third=repo('third'),fourth=repo('fourth');
 const id=await owner.create({title:'Navidad',name:'Ana',capacity:4,budget:'1000'});
 await other.join(id,'Bruno');await third.join(id,'Carla');await fourth.join(id,'Diego');
 await owner.partner(id,'owner','other');await owner.partner(id,'third','fourth');
 await owner.execute(id);
 const names=[];
 for(const [r,excluded] of [[owner,['Ana','Bruno']],[other,['Ana','Bruno']],[third,['Carla','Diego']],[fourth,['Carla','Diego']]]){
   assert.equal((await r.list()).length,1);const current=await r.get(id);assert.equal(current.status,'drawn');
   const name=await r.result(current);assert.ok(!excluded.includes(name));names.push(name);
 }
 assert.equal(new Set(names).size,4);
 await assertFails(getDocFromServer(doc(owner.db,'exchanges',id,'results','other')));
 await assertFails(getDocs(collection(owner.db,'exchanges',id,'results')));
 await assert.rejects(owner.execute(id),/cerrado/);await assert.rejects(owner.remove(id),/cerrado/);
});
test('only creator deletes; cancelled invitation cannot be reused',async()=>{
 const owner=repo('owner'),other=repo('other');
 const id=await owner.create({title:'Error',name:'Ana',capacity:3,budget:''});await other.join(id,'Bruno');
 await assert.rejects(other.remove(id),/creador/);await assertFails(deleteDoc(doc(other.db,'exchanges',id)));
 await owner.remove(id);assert.equal((await owner.list()).length,0);assert.equal((await other.list()).length,0);
 await assert.rejects(repo('late').join(id,'Caro'),/no existe/);
});
test('concurrent joins do not exceed capacity and membership cannot be impersonated',async()=>{
 const owner=repo('owner');const id=await owner.create({title:'Cupos',name:'Ana',capacity:3,budget:''});await repo('b').join(id,'B');
 const outcomes=await Promise.allSettled([repo('c').join(id,'C'),repo('d').join(id,'D')]);
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal((await owner.get(id)).memberIds.length,3);
 await assertFails(updateDoc(doc(repo('stranger').db,'exchanges',id),{ownerId:'stranger'}));
});
test('partner changes require owner and handle unlinking and unavailable partners',async()=>{
 const owner=repo('owner');const id=await owner.create({title:'Parejas',name:'Ana',capacity:4,budget:''});
 for(const name of ['b','c','d'])await repo(name).join(id,name);
 await assert.rejects(repo('b').partner(id,'owner','b'),/creador/);
 await owner.partner(id,'owner','b');await assert.rejects(owner.partner(id,'c','b'),/disponible/);
 await owner.partner(id,'owner','c');const current=await owner.get(id);
 assert.equal(current.people.b.partnerId,'');assert.equal(current.people.c.partnerId,'owner');
 await owner.partner(id,'owner','');assert.equal((await owner.get(id)).people.c.partnerId,'');
});
test('50 results are atomic within Firestore rule access limits',async()=>{
 const owner=repo('u0');const id=await owner.create({title:'Familia grande',name:'u0',capacity:50,budget:''});
 for(let i=1;i<50;i++)await repo('u'+i).join(id,'u'+i);
 await owner.execute(id);const current=await owner.get(id);assert.equal(current.status,'drawn');
 for(const uid of ['u0','u24','u49'])assert.ok(current.participants.some(p=>p.name===undefined)===false && await repo(uid).result(current));
});

test('capacity can grow and shrink before the draw, preserving members and couples',async()=>{
 const owner=repo('owner');const id=await owner.create({title:'Cambios',name:'Ana',capacity:4,budget:''});
 await repo('b').join(id,'Bruno');await repo('c').join(id,'Carla');await owner.partner(id,'owner','b');
 await owner.capacity(id,5);let current=await owner.get(id);assert.equal(current.capacity,5);assert.equal(current.people.b.partnerId,'owner');
 await owner.capacity(id,3);assert.equal((await owner.get(id)).capacity,3);
 await assert.rejects(repo('d').join(id,'Diego'),/completo/);
 await owner.capacity(id,4);await repo('d').join(id,'Diego');
 await assert.rejects(owner.capacity(id,3),/anotadas/);
 for(const value of [2,51,3.5,''])await assert.rejects(owner.capacity(id,value),/entre 3 y 50/);
 await owner.execute(id);await assert.rejects(owner.capacity(id,5),/cerrado/);
 await assertFails(updateDoc(doc(owner.db,'exchanges',id),{capacity:5}));
});

test('rules independently enforce capacity permissions and bounds',async()=>{
 const owner=repo('owner');const id=await owner.create({title:'Permisos',name:'Ana',capacity:4,budget:''});
 for(const uid of ['b','c','d'])await repo(uid).join(id,uid);
 await assert.rejects(repo('b').capacity(id,5),/creador/);
 for(const uid of ['b','stranger'])await assertFails(updateDoc(doc(repo(uid).db,'exchanges',id),{capacity:5}));
 for(const capacity of [2,3,51,4.5,'5'])await assertFails(updateDoc(doc(owner.db,'exchanges',id),{capacity}));
 await assertFails(updateDoc(doc(owner.db,'exchanges',id),{capacity:5,ownerId:'b'}));
});

test('shrinking capacity while someone joins never overfills the encounter',async()=>{
 const owner=repo('owner');const id=await owner.create({title:'Concurrencia',name:'Ana',capacity:4,budget:''});
 await repo('b').join(id,'B');await repo('c').join(id,'C');
 const outcomes=await Promise.allSettled([owner.capacity(id,3),repo('d').join(id,'D')]);
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
 const current=await owner.get(id);assert.equal(current.memberIds.length,current.capacity);
});
