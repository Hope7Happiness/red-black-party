import test from 'node:test';
import assert from 'node:assert/strict';
import { newRoom, newPlayer, addPlayer, applyAction, view } from '../lib/game.ts';
function setup(){const players=['甲','乙','丙'].map(newPlayer);const room=newRoom('ABC234',players[0]);players.slice(1).forEach(p=>addPlayer(room,p));return {room,players};}
const act=(r,p,type,fields={})=>applyAction(r,p,{type,round:r.round,...fields});
test('complete round: private submissions, simultaneous result, chosen reveal and next round',()=>{
 const {room:r,players:[a,b,c]}=setup();
 assert.throws(()=>act(r,b,'start'),/房主/);act(r,a,'start');
 act(r,a,'card',{color:'red'});act(r,b,'card',{color:'black'});
 act(r,a,'card',{color:'black'});assert.equal(view(r,a).me.card,'black');assert.equal(view(r,a).submittedCount,2);
 assert.equal(view(r,b).redCount,null);assert.ok(view(r,b).players.every(p=>p.revealedCard===null));
 act(r,a,'card',{color:'red'});
 assert.throws(()=>act(r,a,'guess',{value:1}),/阶段/);
 act(r,c,'card',{color:'red'});assert.equal(r.phase,'guess');
 assert.throws(()=>act(r,a,'card',{color:'black'}),/阶段/);assert.equal(a.card,'red');
 act(r,a,'guess',{value:0});act(r,b,'guess',{value:1});
 act(r,a,'guess',{value:2});assert.equal(view(r,a).me.guess,2);assert.equal(view(r,a).guessedCount,2);
 let v=view(r,c);assert.equal(v.redCount,null);assert.equal(v.players[0].guess,null);assert.equal(v.players[0].revealedCard,null);assert.equal(v.players[0].correct,null);assert.equal(JSON.stringify(v).includes(a.token),false);
 act(r,c,'guess',{value:2});assert.equal(r.phase,'results');assert.equal(view(r,b).redCount,2);
 assert.throws(()=>act(r,a,'guess',{value:0}),/阶段/);assert.equal(a.guess,2);
 assert.throws(()=>act(r,b,'reveal',{targetId:a.id}),/没有/);
 assert.throws(()=>act(r,a,'next'),/翻牌/);
 assert.throws(()=>act(r,a,'reveal',{targetId:a.id}),/另一位/);
 act(r,a,'reveal',{targetId:b.id});v=view(r,a);assert.equal(v.players[1].revealedCard,'black');assert.equal(v.players[0].revealedCard,null);
 for(const other of [c]){const hidden=view(r,other);assert.deepEqual(hidden.reveals,[]);assert.ok(hidden.players.every(p=>p.revealedCard===null));}
 assert.equal(view(r,c).me.canReveal,true);
 assert.equal(view(r,b).reveals.length,1);assert.equal(view(r,b).reveals[0].byId,a.id);
 assert.ok(view(r,b).players.every(p=>p.revealedCard===null));
 assert.throws(()=>act(r,a,'reveal',{targetId:c.id}),/没有/);
 act(r,c,'reveal',{targetId:b.id});assert.equal(view(r,a).allRevealsDone,true);
 assert.equal(view(r,c).players[1].revealedCard,'black');assert.equal(view(r,a).reveals.length,1);assert.equal(view(r,c).reveals.length,1);assert.equal(view(r,b).reveals.length,2);assert.deepEqual(view(r,b).reveals.map(x=>x.byId),[a.id,c.id]);
 act(r,a,'next');assert.equal(r.round,2);assert.equal(r.phase,'submit');assert.ok(r.players.every(p=>p.card===null&&p.guess===null));
 assert.throws(()=>applyAction(r,b,{type:'card',round:1,color:'red'}),/回合/);
});
test('all correct supports everyone revealing and ends cleanly',()=>{
 const {room:r,players}=setup();act(r,players[0],'start');
 players.forEach(p=>act(r,p,'card',{color:'black'}));players.forEach(p=>act(r,p,'guess',{value:0}));
 act(r,players[0],'reveal',{targetId:players[1].id});act(r,players[1],'reveal',{targetId:players[0].id});
 assert.equal(view(r,players[2]).allRevealsDone,false);
 act(r,players[2],'reveal',{targetId:players[0].id});assert.equal(view(r,players[2]).allRevealsDone,true);act(r,players[0],'next');
});
test('lobby membership, host transfer, no midgame joins, reset recovers stalled rounds',()=>{
 const {room:r,players:[a,b,c]}=setup();assert.throws(()=>addPlayer(r,newPlayer('甲')),/昵称/);
 act(r,a,'leave');assert.equal(r.hostId,b.id);act(r,b,'kick',{targetId:c.id});assert.throws(()=>act(r,b,'start'),/至少/);
 addPlayer(r,newPlayer('丁'));act(r,b,'start');assert.throws(()=>addPlayer(r,newPlayer('戊')),/进行中/);
 act(r,b,'reset');assert.equal(r.phase,'lobby');assert.ok(r.players.every(p=>p.card===null));
});
test('guess boundaries include zero and total, reject fractional/out-of-range guesses',()=>{
 const {room:r,players}=setup();act(r,players[0],'start');players.forEach(p=>act(r,p,'card',{color:'red'}));
 for(const n of [-1,4,1.5,'3'])assert.throws(()=>act(r,players[0],'guess',{value:n}),/整数/);
 players.forEach(p=>act(r,p,'guess',{value:3}));assert.ok(view(r,players[0]).players.every(p=>p.correct));
});

test('changed card is used in final count and survives persisted-room reload',()=>{
 const {room:r,players:[a,b,c]}=setup();act(r,a,'start');
 act(r,a,'card',{color:'red'});act(r,b,'card',{color:'black'});
 const restored=JSON.parse(JSON.stringify(r));const [ra,rb,rc]=restored.players;
 act(restored,ra,'card',{color:'black'});assert.equal(view(restored,ra).submittedCount,2);
 act(restored,rc,'card',{color:'black'});
 assert.throws(()=>act(restored,ra,'card',{color:'red'}),/阶段/);
 [ra,rb,rc].forEach(p=>act(restored,p,'guess',{value:0}));
 assert.equal(view(restored,ra).redCount,0);assert.ok(view(restored,ra).players.every(p=>p.correct));
});
