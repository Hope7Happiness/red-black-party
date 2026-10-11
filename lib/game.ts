import type { Action, Color, Phase, RoomView, RevealView } from './game-types';
export class GameError extends Error { constructor(message: string, public status = 400) { super(message); } }
export interface Player { id: string; token: string; name: string; card: Color | null; guess: number | null; usedReveal: boolean; }
export interface Room { code: string; phase: Phase; round: number; version: number; hostId: string; players: Player[]; reveals: RevealView[]; expiresAt: number; }
export function normalizeName(value: unknown): string {
  if (typeof value !== 'string') throw new GameError('请输入昵称');
  const name = value.trim().normalize('NFC');
  if (!name || [...name].length > 16 || /[\p{Cc}\p{Cf}]/u.test(name)) throw new GameError('昵称需要 1–16 个字，不能包含控制字符');
  return name;
}
export function newPlayer(name: unknown): Player { return {id: crypto.randomUUID(), token: crypto.randomUUID()+crypto.randomUUID(), name: normalizeName(name), card: null, guess: null, usedReveal: false}; }
export function newRoom(code: string, player: Player): Room { return {code, phase:'lobby', round:0, version:0, hostId:player.id, players:[player], reveals:[], expiresAt:Date.now()+24*60*60*1000}; }
export function authenticate(room: Room, token: string | null): Player {
  const player = token && room.players.find(p => p.token === token);
  if (!player) throw new GameError('加入状态已失效，请重新加入房间',401);
  return player;
}
export function addPlayer(room: Room, player: Player) {
  if (room.phase !== 'lobby') throw new GameError('游戏进行中，请等房主返回大厅后加入',409);
  if (room.players.length >= 24) throw new GameError('房间已满（最多 24 人）',409);
  if (room.players.some(p=>p.name.toLocaleLowerCase()===player.name.toLocaleLowerCase())) throw new GameError('这个昵称已有人使用，请换一个',409);
  if(room.players.length===0) room.hostId=player.id;
  room.players.push(player);
}
function redCount(room: Room) { return room.players.filter(p=>p.card==='red').length; }
function targets(room: Room, player: Player) { return room.players.filter(p=>p.id!==player.id); }
function canReveal(room: Room, player: Player) { return room.phase==='results' && player.guess===redCount(room) && !player.usedReveal && targets(room,player).length>0; }
export function view(room: Room, player: Player): RoomView {
  const results=room.phase==='results';
  const myReveals=room.reveals.filter(r=>r.byId===player.id);
  const relatedReveals=room.reveals.filter(r=>r.byId===player.id || r.targetId===player.id);
  return {code:room.code, phase:room.phase, round:room.round, version:room.version, expiresAt:room.expiresAt,
    players:room.players.map(p=>({id:p.id,name:p.name,isHost:p.id===room.hostId,submitted:p.card!==null,guessed:p.guess!==null,guess:results?p.guess:null,correct:results?p.guess===redCount(room):null,revealedCard:myReveals.find(r=>r.targetId===p.id)?.color??null,usedReveal:p.usedReveal})),
    me:{id:player.id,card:player.card,guess:player.guess,canReveal:canReveal(room,player)},
    submittedCount:room.players.filter(p=>p.card!==null).length,guessedCount:room.players.filter(p=>p.guess!==null).length,
    redCount:results?redCount(room):null,reveals:relatedReveals,allRevealsDone:results&&!room.players.some(p=>canReveal(room,p))};
}
export function applyAction(room: Room, player: Player, input: unknown): boolean {
  if (!input || typeof input!=='object') throw new GameError('无效操作');
  const action=input as Action;
  if (action.round!==room.round) throw new GameError('回合已经更新，请刷新后重试',409);
  const host=()=>{if(player.id!==room.hostId) throw new GameError('只有房主可以操作',403);};
  const phase=(p:Phase)=>{if(room.phase!==p) throw new GameError('当前阶段不能进行这个操作',409);};
  const clear=()=>{room.reveals=[];for(const p of room.players){p.card=null;p.guess=null;p.usedReveal=false;}};
  switch(action.type){
    case 'start': case 'next':
      host(); phase(action.type==='start'?'lobby':'results');
      if(room.players.length<2) throw new GameError('至少需要 2 位玩家');
      if(action.type==='next'&&room.players.some(p=>canReveal(room,p))) throw new GameError('请等猜中者完成翻牌',409);
      clear();room.round++;room.phase='submit';break;
    case 'reset': host(); clear();room.phase='lobby';room.round++;break;
    case 'card':
      phase('submit');
      if(action.color!=='red'&&action.color!=='black') throw new GameError('请选择红牌或黑牌');
      player.card=action.color;
      if(room.players.every(p=>p.card!==null)) room.phase='guess';break;
    case 'guess':
      phase('guess');
      if(!Number.isInteger(action.value)||action.value<0||action.value>room.players.length) throw new GameError('猜数必须为 0 到玩家人数之间的整数');
      player.guess=action.value;
      if(room.players.every(p=>p.guess!==null)) room.phase='results';break;
    case 'reveal': {
      phase('results');
      if(!canReveal(room,player)) throw new GameError('你没有可用的翻牌机会',403);
      const target=targets(room,player).find(p=>p.id===action.targetId);
      if(!target) throw new GameError('请选择另一位玩家',409);
      room.reveals.push({byId:player.id,targetId:target.id,color:target.card!});player.usedReveal=true;break;
    }
    case 'kick': host(); phase('lobby');
      if(action.targetId===player.id) throw new GameError('请使用离开房间');
      if(!room.players.some(p=>p.id===action.targetId)) throw new GameError('玩家已离开',409);
      room.players=room.players.filter(p=>p.id!==action.targetId);break;
    case 'leave': phase('lobby');room.players=room.players.filter(p=>p.id!==player.id);
      if(room.hostId===player.id) room.hostId=room.players[0]?.id??'';
      return true;
    default: throw new GameError('未知操作');
  }
  return false;
}
