import {createBattle,stepBattle,COMBAT_VERSION,MAX_TICKS,MAX_COMMANDS} from '../src/sim/combat/index.js';
import {ApiError} from './errors.mjs';

const MAX_EVENTS=2048,WINDOW=128;
const fail=(message)=>{throw new ApiError('BATTLE_UNAVAILABLE',message,409);};
function bounded(state) {
  if(state.version!==COMBAT_VERSION || !Number.isInteger(state.tick) || state.tick<0 || state.tick>MAX_TICKS ||
    !Array.isArray(state.events) || state.events.length>MAX_EVENTS || state.events.some((e,i)=>e.sequence!==i) ||
    Buffer.byteLength(JSON.stringify(state))>240000) throw new Error('Combat continuation exceeded its trusted bounds.');
}

export function openingInput(record,action) {
  if(record.status!=='awaiting_choice' || record.choice!==null) fail('The opening choice is already committed.');
  const frozen=record.frozen_input,pending=frozen.pendingJourney;
  if(pending.startingHull<25) fail('Pay or drop cargo to arrive, then repair the ship before fighting.');
  const units=pending.initialCargo.reduce((n,c)=>n+c.quantity,0);
  const stats={maxHull:100,armour:3,weaponDamage:9,accuracy:65,ammo:60,speed:50};
  return {seed:record.seed,posture:action.posture,protectCargo:action.protectCargo,retreatHullPercent:action.retreatHullPercent,
    scenario:{type:'opening',choice:action.choice,playerHullFloor:25,cargoPolicy:'boarding_only'},
    player:{...stats,id:frozen.ship.id,hull:pending.startingHull,cargoUnits:units,
      captain:frozen.crew.some(c=>c.role==='captain')?2:0,engineer:frozen.crew.some(c=>c.role==='engineer')?2:0},
    pirate:{...stats,id:`raider:${record.id}`,hull:100,cargoUnits:0,captain:2,engineer:2}};
}

export function verifyOpeningResult(record,input,result) {
  const s=result?.scenario,p=result?.player;
  if(!result || result.version!==COMBAT_VERSION || result.seed!==record.seed || !Number.isInteger(result.tick) || result.tick<0 || result.tick>MAX_TICKS ||
    !s || s.type!=='opening' || s.choice!==input.scenario.choice || s.playerHullFloor!==25 || s.cargoPolicy!=='boarding_only' || s.crewSafe!==true ||
    s.initialCargoUnits!==input.player.cargoUnits || !Number.isInteger(s.cargoLostUnits) || s.cargoLostUnits<0 || s.cargoLostUnits>input.player.cargoUnits ||
    !p || p.id!==input.player.id || p.maxHull!==100 || !Number.isInteger(p.hull) || p.hull<25 || p.hull>input.player.hull || p.cargoUnits!==input.player.cargoUnits-s.cargoLostUnits ||
    !['boarded','victory','escaped','pirate_escaped','both_escaped','stalemate'].includes(result.outcome) ||
    (result.outcome!=='boarded' && s.cargoLostUnits!==0)) throw new Error('Opening result failed the trusted scenario invariants.');
}

export function beginOpening(record,action) {
  const input=openingInput(record,action),continuation=createBattle(input);bounded(continuation);
  if(continuation.result) verifyOpeningResult(record,input,continuation.result);
  return {battleInput:input,continuation,tick:continuation.tick,schedule:[],choice:action.choice,
    status:continuation.result?'resolved':'active',result:continuation.result};
}

export function validateAdvance(record,action) {
  if(record.status!=='active' || !record.continuation || record.continuation.result || !record.battle_input) fail('The battle is not active.');
  if(action.command && record.schedule.length>=MAX_COMMANDS) fail('The battle has used all eight strategic commands.');
  bounded(record.continuation);
  if(record.continuation.tick!==record.tick || record.continuation.seed!==record.seed || record.continuation.commandCount!==record.schedule.length) throw new Error('Stored battle identity or schedule mismatch.');
}

export function advanceOpening(record,action) {
  validateAdvance(record,action);
  const schedule=structuredClone(record.schedule),commands=action.command ? [{...action.command,tick:record.tick+1}] : [];
  schedule.push(...commands);
  let continuation=record.continuation;
  for(let n=0;n<action.ticks && continuation.tick<MAX_TICKS && !continuation.result;n++) continuation=stepBattle(continuation,n===0?commands:[]);
  bounded(continuation);
  if(continuation.result) verifyOpeningResult(record,record.battle_input,continuation.result);
  return {battleInput:record.battle_input,continuation,tick:continuation.tick,schedule,choice:record.choice,
    status:continuation.result?'resolved':'active',result:continuation.result};
}

export function projectEncounter(record,from) {
  if(!record) return null;
  const battle=record.continuation,events=battle?.events || [];
  from=from ?? Math.max(0,events.length-WINDOW);
  if(!Number.isInteger(from) || from<0 || from>events.length) throw new ApiError('INVALID_REQUEST','Invalid event cursor.',400);
  const to=Math.min(events.length,from+WINDOW);
  return {id:record.id,status:record.status,choice:record.choice,version:COMBAT_VERSION,seed:record.seed,tick:record.tick,
    snapshot:battle ? {player:battle.player,pirate:battle.pirate,posture:battle.posture,protectCargo:battle.protectCargo,
      retreatHullPercent:battle.retreatHullPercent,commandCount:battle.commandCount} : null,
    events:events.slice(from,to),cursor:{from,to,total:events.length,next:to<events.length?to:null},result:record.result};
}
