import { ApiError, uuid } from './errors.mjs';
import {isDeepStrictEqual} from 'node:util';

const changed=()=>new ApiError('ENCOUNTER_CHANGED','This encounter is not available for that company.',409);
const bounded=(value,max)=> {
  if(value!==null && (!value || typeof value!=='object' || Buffer.byteLength(JSON.stringify(value))>max)) throw new Error('Encounter storage bound exceeded.');
};
const decode=row=>row ? {...row,seed:Number(row.seed)} : null;

export async function loadEncounter(client,companyId,id,{lock=false}={}) {
  const {rows:[row]}=await client.query(`select * from frontierdom.encounters where company_id=$1 and id=$2${lock?' for update':''}`,[uuid(companyId),uuid(id)]);
  if(!row) throw changed();
  return decode(row);
}

export async function companyEncounter(client,companyId) {
  return decode((await client.query('select * from frontierdom.encounters where company_id=$1',[uuid(companyId)])).rows[0]);
}

// Caller already holds the company row lock in the command's transaction.
// Only server-generated departure metadata and trusted kernel input enter here.
export async function freezeEncounter(client,{id,companyId,departureCommandId,sourceRevision,seed,input}) {
  if(!Number.isSafeInteger(sourceRevision) || sourceRevision<0 || !Number.isSafeInteger(seed) || seed<0 || seed>4294967295) throw new Error('Invalid frozen encounter metadata.');
  bounded(input,24000);
  if(!input || Array.isArray(input)) throw new Error('Invalid frozen encounter input.');
  const {rows:[row]}=await client.query(`insert into frontierdom.encounters
    (id,company_id,departure_command_id,source_revision,seed,frozen_input,status)
    values($1,$2,$3,$4,$5,$6,'awaiting_choice') returning *`,
  [uuid(id),uuid(companyId),uuid(departureCommandId),sourceRevision,seed,input]);
  return decode(row);
}

export async function continueEncounter(client,previous,{status,choice,tick,schedule,continuation,result=null,battleInput=previous.battle_input}) {
  if(previous.status==='resolved') throw changed();
  if(!['active','resolved'].includes(status) || !['pay','drop','run','fight'].includes(choice) ||
     (previous.choice && previous.choice!==choice) || !Number.isSafeInteger(tick) || tick<previous.tick || tick>180 ||
     !Array.isArray(schedule) || schedule.length>8 || schedule.length<previous.schedule.length ||
     !isDeepStrictEqual(schedule.slice(0,previous.schedule.length),previous.schedule) ||
     (previous.battle_input!==null && !isDeepStrictEqual(previous.battle_input,battleInput)) ||
     (status==='resolved')!==(result!==null)) throw new Error('Invalid encounter continuation.');
  if(schedule.length-previous.schedule.length>1 || (status==='active' && continuation===null)) throw new Error('Invalid battle continuation.');
  for(const command of schedule) {
    if(!Number.isInteger(command.tick) || command.tick<1 || command.tick>180 ||
      !['retreat','posture'].includes(command.type) ||
      (command.type==='posture' && !['defensive','balanced','aggressive'].includes(command.posture))) throw new Error('Invalid accepted battle schedule.');
  }
  if(schedule.slice(previous.schedule.length).some(command=>command.tick!==previous.tick+1 || command.tick>tick)) throw new Error('Battle commands must be stamped at the next simulation tick.');
  bounded(schedule,3000);bounded(continuation,240000);bounded(result,24000);bounded(battleInput,24000);
  const {rows:[row]}=await client.query(`update frontierdom.encounters set
    status=$3,choice=$4,tick=$5,schedule=$6,continuation=$7,result=$8,battle_input=$9
    where company_id=$1 and id=$2 and status=$10 and tick=$11 returning *`,
  [previous.company_id,previous.id,status,choice,tick,JSON.stringify(schedule),continuation,result,battleInput,previous.status,previous.tick]);
  if(!row) throw changed();
  return decode(row);
}
