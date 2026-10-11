import assert from 'node:assert/strict';
const base=process.argv[2]??'http://127.0.0.1:8787';
async function api(path,method='GET',body,token){const r=await fetch(base+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw new Error(`${r.status}: ${data.error}`);return data;}
const a=await api('/api/rooms','POST',{name:'测试甲'});const code=a.room.code;const path='/api/rooms/'+code;
const [b,c]=await Promise.all(['测试乙','测试丙'].map(name=>api(path+'/join','POST',{name})));
const all=[a,b,c];let round=0;
const action=(who,type,fields={})=>api(path+'/action','POST',{type,round,...fields},who.token);
const current=who=>api(path,'GET',undefined,who.token);
assert.equal((await current(a)).room.players.length,3);
await action(a,'start');round=1;
await Promise.all(all.map((p,i)=>action(p,'card',{color:i===1?'black':'red'})));
assert.equal((await current(a)).room.phase,'guess');
await Promise.all([action(a,'guess',{value:0}),action(b,'guess',{value:0})]);
await action(a,'guess',{value:2});assert.equal((await current(a)).room.me.guess,2);assert.equal((await current(a)).room.guessedCount,2);
let r=(await current(c)).room;assert.equal(r.redCount,null);assert.ok(r.players.every(p=>p.guess===null&&p.revealedCard===null));
await action(c,'guess',{value:2});r=(await current(a)).room;
assert.equal(r.redCount,2);assert.equal(r.players.filter(p=>p.correct).length,2);
await assert.rejects(action(a,'guess',{value:0}),/409/);
await action(a,'reveal',{targetId:b.room.me.id});r=(await current(a)).room;
assert.equal(r.players.find(p=>p.id===b.room.me.id).revealedCard,'black');
for(const other of [c]){const hidden=(await current(other)).room;assert.deepEqual(hidden.reveals,[]);assert.ok(hidden.players.every(p=>p.revealedCard===null));}
assert.equal((await current(b)).room.reveals[0].byId,a.room.me.id);
await action(c,'reveal',{targetId:b.room.me.id});assert.equal((await current(b)).room.reveals.length,2);assert.equal((await current(a)).room.reveals.length,1);await action(a,'next');round=2;
r=(await current(b)).room;assert.equal(r.round,2);assert.equal(r.phase,'submit');assert.equal(r.me.card,null);
await Promise.all(all.map(p=>action(p,'card',{color:'black'})));await Promise.all(all.map(p=>action(p,'guess',{value:1})));
r=(await current(c)).room;assert.equal(r.redCount,0);assert.ok(r.players.every(p=>!p.correct));assert.equal(r.allRevealsDone,true);
await action(a,'reset');round=3;
await action(c,'leave');await action(b,'leave');await action(a,'leave');
console.log('PASS: 3 independent player sessions, concurrent joins/cards/guesses, secret ballot, private chosen reveal, independent same-target reveals, editable guesses and result locking, next round, nobody correct, reset and leave.');
