import { env } from 'cloudflare:workers';
import { GameError, newPlayer, newRoom, addPlayer, authenticate, applyAction, view, type Room } from './game';
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// Owner requested all existing rooms closed at this timestamp.
const ROOM_CLOSED_BEFORE=1791688273047;
const minRoomExpiry=()=>Math.max(Date.now(), ROOM_CLOSED_BEFORE + 24*60*60*1000);
function code(){return [...crypto.getRandomValues(new Uint8Array(6))].map(n=>alphabet[n%alphabet.length]).join('');}
function db(){if(!env.DB) throw new Error('Database unavailable');return env.DB;}
function reply(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store, private','Vary':'Authorization','X-Content-Type-Options':'nosniff'}});}
async function body(req:Request){
 if(!req.headers.get('content-type')?.includes('application/json'))throw new GameError('需要 JSON 请求',415);
 if(Number(req.headers.get('content-length')??0)>4096)throw new GameError('请求过大',413);
 const reader=req.body?.getReader();if(!reader)throw new GameError('请求为空');
 let text='',size=0;const decoder=new TextDecoder();
 while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>4096){await reader.cancel();throw new GameError('请求过大',413);}text+=decoder.decode(r.value,{stream:true});}text+=decoder.decode();
 try{const value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw 0;return value;}catch{throw new GameError('无效 JSON 请求');}
}
async function load(code:string):Promise<Room>{
 const row=await db().prepare('SELECT state FROM rooms WHERE code = ? AND expires_at > ?').bind(code,minRoomExpiry()).first<{state:string}>();
 if(!row)throw new GameError('房间不存在或已过期，请创建新房间',404);
 return JSON.parse(row.state);
}
export async function handle(req:Request,roomCode?:string,operation?:'join'|'action'){
 try{
  if(req.method==='POST'){
   const origin=req.headers.get('origin');
   if(origin&&origin!==new URL(req.url).origin)throw new GameError('请求来源无效',403);
  }
  if(!roomCode){
   const input=await body(req);const player=newPlayer(input.name);
   // Reclaim expired rooms opportunistically, keeping all state short lived.
   await db().prepare('DELETE FROM rooms WHERE expires_at <= ?').bind(minRoomExpiry()).run();
   for(let i=0;i<5;i++){
    const room=newRoom(code(),player);
    const result=await db().prepare('INSERT OR IGNORE INTO rooms (code,state,version,expires_at) VALUES (?,?,?,?)').bind(room.code,JSON.stringify(room),room.version,room.expiresAt).run();
    if(result.meta.changes===1)return reply({token:player.token,room:view(room,player)},201);
   }
   throw new GameError('创建繁忙，请稍后重试',503);
  }
  roomCode=roomCode.toUpperCase();if(!/^[A-Z2-9]{6}$/.test(roomCode))throw new GameError('请输入正确的 6 位房间码');
  const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1]??null;
  if(req.method==='GET'){const room=await load(roomCode);return reply({room:view(room,authenticate(room,token))});}
  const input=await body(req);const joining=operation==='join'?newPlayer(input.name):null;
  for(let retry=0;retry<16;retry++){
   const room=await load(roomCode),previousVersion=room.version;
   let left=false;
   const player=joining??authenticate(room,token);
   if(joining)addPlayer(room,joining);else left=applyAction(room,player,input);
   room.version++;
   const result=await db().prepare('UPDATE rooms SET state = ?, version = ? WHERE code = ? AND version = ? AND expires_at > ?').bind(JSON.stringify(room),room.version,room.code,previousVersion,Date.now()).run();
   if(result.meta.changes===1){
    if(left)return reply({left:true});
    return reply({...joining?{token:joining.token}:{},room:view(room,player)});
   }
  }
  throw new GameError('大家正在同时操作，请重试',409);
 }catch(error){
  if(error instanceof GameError)return reply({error:error.message},error.status);
  console.error('Room API failure',error instanceof Error?error.message:'unknown');
  return reply({error:'服务暂时不可用，请稍后重试'},503);
 }
}
