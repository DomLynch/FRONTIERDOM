const money=p=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(p/100);
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const name=id=>({'medicine':'Medicine','aurelia':'Aurelia','food':'Food','fuel':'Fuel','machinery':'Machinery','exotic-metal':'Exotic Metal'}[id] || id);
export const outcomeLabel=outcome=>({victory:'Raider withdrew',escaped:'Horizon escaped',pirate_escaped:'Raider escaped',both_escaped:'Both ships disengaged',stalemate:'Encounter timed out',boarded:'Horizon was boarded'}[outcome] || outcome);

/** Read-only validation, never a resolver or an economic authority. */
export function checkedEncounter(value,state) {
  if (!state.expedition) return null;
  if (value===null || value===undefined) {
    if (state.expedition.pendingJourney) throw new Error('Missing encounter projection. Reconnect before continuing.');
    return null;
  }
  const cursor=value.cursor;
  if (typeof value.id!=='string' || !['awaiting_choice','active','resolved'].includes(value.status)
    || value.version!==1 || !Number.isInteger(value.tick) || value.tick<0 || value.tick>180
    || !cursor || ![cursor.from,cursor.to,cursor.total].every(n=>Number.isInteger(n)&&n>=0&&n<=2048)
    || cursor.from>cursor.to || cursor.to>cursor.total || !Array.isArray(value.events) || value.events.length>128
    || value.events.length!==cursor.to-cursor.from
    || cursor.next!==(cursor.to<cursor.total ? cursor.to : null)
    || value.events.some((e,i)=>e.sequence!==cursor.from+i || !Number.isInteger(e.tick) || e.tick>value.tick)
    || (state.expedition.pendingJourney && state.expedition.pendingJourney.encounterId!==value.id)
    || (value.status==='active' && (!value.snapshot?.player || !value.snapshot?.pirate || value.result))) {
    throw new Error('Invalid encounter projection. Reconnect before continuing.');
  }
  return value;
}

export function expeditionObjective(state,encounter) {
  const e=state.expedition;
  if(!e) return null; // A-only snapshots keep the accepted trading guide.
  if(!e.enrolled) return {id:'enroll-expedition',title:'The first expedition',label:'Review expedition enrollment',story:'Eden’s living network leads beyond trade. Join the first return expedition; your current company, cargo and cash stay yours.',action:{type:'enroll_expedition'}};
  if(e.pendingJourney) return {id:encounter?.status==='active'?'battle':'interception',title:encounter?.status==='active'?'Horizon under interception':'Unregistered vessel on intercept',label:'Review the interception',story:'Your return fare is already paid. Earth arrival waits until this encounter is settled.',panel:'expedition'};
  return null;
}

export function intentLabel(action) {
  return ({enroll_expedition:'Join the first expedition',encounter_choice:`${action.choice?.toUpperCase()} · opening interception`,battle_advance:`Advance ${action.ticks} server ticks${action.command ? ' with next-tick order' : ''}`,repair:`Repair ${action.points} hull points`,buy_upgrade:'Install cargo bracing',secure_relay:'Agree limited extraction at Eden relay'})[action.type] || null;
}

export function dropIntent(pending,selection) {
  const chosen=Object.entries(selection).filter(([,quantity])=>quantity>0).map(([commodityId,quantity])=>({commodityId,quantity}));
  if(chosen.some(c=>!Number.isSafeInteger(c.quantity)) || chosen.reduce((n,c)=>n+c.quantity,0)!==pending.demands.dropUnits) {
    throw new Error(`Choose exactly ${pending.demands.dropUnits} cargo units to surrender.`);
  }
  return {type:'encounter_choice',encounterId:pending.encounterId,choice:'drop',cargoSelection:chosen};
}

export function advanceIntent(encounter,ticks,command) {
  if(encounter?.status!=='active' || ![1,2,5,180].includes(ticks)) throw new Error('No active battle to advance.');
  if(command && encounter.snapshot.commandCount>=8) throw new Error('All eight strategic orders are used.');
  return {type:'battle_advance',encounterId:encounter.id,ticks,...(command?{command}:{})};
}

export function quoteConsequences(quote) {
  const d=quote.disclosures;
  if(!d) return '';
  const c=d.consequences,a=d.accounting;
  return `<div class="fd-stakes"><h3>Quoted consequences</h3><p>Hull on acceptance ${c.hullAfter}/100 · capacity ${c.capacityAfter} · port ${c.locationAfter==='earth'?'Earth':'Eden'}${c.battleRequired?' (battle still required; final hull and cargo are not yet known)':''}</p>${c.cargoRemoved.length?`<p>Surrender ${c.cargoRemoved.map(r=>`${r.quantity} ${esc(name(r.commodityId))}`).join(', ')} · written-off acquisition cost ${money(a.cargoWriteOffBasisPence)}</p>`:''}<p>Operating expense ${money(a.operatingExpensePence)} · capital spend ${money(a.capitalSpendPence)}</p>${c.relayStatusAfter?`<p>Relay rights ${esc(c.relayStatusAfter)} · future Eden→Earth fare ${money(c.futureReturnFarePence)}</p>`:''}</div>`;
}

export function battleControls(encounter,{disabled,playing,speed}) {
  if(encounter?.status!=='active') return '';
  const s=encounter.snapshot;
  return `<div class="fd-battle" aria-label="Battle controls"><div class="fd-battle-status"><span>Horizon hull <b>${s.player.hull}/${s.player.maxHull}</b></span><span>Raider hull <b>${s.pirate.hull}/${s.pirate.maxHull}</b></span><span>Server tick <b>${encounter.tick}/180</b></span></div><div class="fd-playback"><button data-action="battle-play" ${disabled&&!playing?'disabled':''}>${playing?'Pause':'Play'}</button>${[1,2,5].map(n=>`<button class="fd-quiet" data-action="battle-speed" data-id="${n}" aria-pressed="${speed===n}">${n}×</button>`).join('')}<button class="fd-quiet" data-action="battle-instant" ${disabled?'disabled':''}>Instant</button></div><p class="fd-caption">${s.commandCount}/8 orders · ${esc(s.posture)} · ammo ${s.player.ammo}. Speeds request 1/2/5 ticks per cadence. Instant requests at most 180. Pausing keeps the current request.</p><button class="fd-quiet fd-tactical" data-action="panel" data-id="expedition">Tactics & recorded events</button></div>`;
}

export function expeditionPanel(state,encounter,{disabled,posture,protectCargo,retreatHullPercent,dropSelection,repairPoints,history}) {
  const e=state.expedition,p=e.pendingJourney;
  if(p && encounter?.status==='awaiting_choice') {
    const units=p.initialCargo.reduce((n,c)=>n+c.quantity,0);
    return `<p class="fd-narrative">“We can pay, surrender some cargo, run—or hold our ground. Your call.”</p><p class="fd-caption">Return fare already paid. Physical location remains Eden until settlement. Opening encounter: hull floor 25, boarding ends the battle, no crew death or ship destruction.</p><div class="fd-choice-grid"><button data-action="exp-choice" data-id="pay" ${disabled?'disabled':''}><b>Pay</b><small>Demand ${money(p.demands.payPence)} · arrive Earth</small></button><button data-action="exp-choice" data-id="drop" ${disabled?'disabled':''}><b>Surrender cargo</b><small>Exactly ${p.demands.dropUnits} units · no cash fee</small></button></div><div class="fd-drop-selection">${state.ship.cargo.map(c=>`<label>${esc(name(c.commodityId))} · ${c.quantity} aboard<input data-drop="${esc(c.commodityId)}" type="number" min="0" max="${c.quantity}" step="1" value="${dropSelection[c.commodityId]||0}" ${disabled?'disabled':''}></label>`).join('')}</div><h3>Run or fight: tactical setup</h3><label class="fd-setting">Posture<select data-setting="posture" ${disabled?'disabled':''}>${['defensive','balanced','aggressive'].map(s=>`<option ${posture===s?'selected':''}>${s}</option>`).join('')}</select></label><p class="fd-caption">Defensive fires less often and reduces incoming accuracy; aggressive fires every tick and exposes you more. These are fixed prototype ratings, not crew upgrades.</p><label class="fd-setting"><input type="checkbox" data-setting="protectCargo" ${protectCargo?'checked':''} ${disabled?'disabled':''}> Protect cargo: lower accuracy, faster escape progress</label><label class="fd-setting">Retreat at remaining hull %<input data-setting="retreatHullPercent" type="number" min="0" max="100" step="1" value="${retreatHullPercent}" ${disabled?'disabled':''}></label><p class="fd-caption">Automatic retreat uses remaining hull, not damage taken. Boarding at 25 hull loses ${Math.ceil(units/4)} units for run (¼ rounded up), or ${Math.ceil(units/2)} for fight (½ rounded up), once. Hull below 25 must use pay/drop. Hull at 25 boards immediately.</p><div class="fd-choice-grid"><button data-action="exp-choice" data-id="run" ${disabled||p.startingHull<25?'disabled':''}><b>Run</b><small>£60 service fee · boarding risk remains</small></button><button data-action="exp-choice" data-id="fight" ${disabled||p.startingHull<25?'disabled':''}><b>Fight</b><small>£120 service fee · no guaranteed win</small></button></div>`;
  }
  if(encounter?.status==='active') return `<div class="fd-battle-status"><span>Horizon hull <b>${encounter.snapshot.player.hull}/100</b></span><span>Raider hull <b>${encounter.snapshot.pirate.hull}/100</b></span></div><p>${encounter.snapshot.commandCount}/8 strategic orders used. Orders apply at the next server tick; no direct steering or firing.</p><div class="fd-orders">${['defensive','balanced','aggressive'].map(s=>`<button class="fd-quiet" data-action="battle-order" data-id="${s}" ${disabled||encounter.snapshot.commandCount>=8?'disabled':''}>${s}</button>`).join('')}<button data-action="battle-order" data-id="retreat" ${disabled||encounter.snapshot.commandCount>=8?'disabled':''}>Review retreat order</button></div>${eventHistory(encounter,history,disabled)}`;
  const completed=['resolved','passed_empty'].includes(e.firstReturnStatus),result=encounter?.result;
  return `<p class="fd-narrative">${result?.outcome?esc(outcomeLabel(result.outcome)):e.firstReturnStatus==='passed_empty'?'An empty-hold return passed without interception.':e.enrolled?'First loaded return from Eden may be intercepted.':'Review enrollment to join the first expedition.'}</p>${result?.scenario?`<p class="fd-caption">Confirmed ${result.scenario.cargoLostUnits} cargo units lost · crew safe · hull ${e.shipCondition.hull}/100. Settlement and Earth arrival are server-confirmed.</p>`:''}<div class="fd-aftercare"><div><span>Hull</span><b>${e.shipCondition.hull}/100</b></div><div><span>Cargo</span><b>${state.ship.cargo.reduce((n,c)=>n+c.quantity,0)}/${state.ship.capacityUnits}</b></div><div><span>Cash</span><b>${money(state.cashPence)}</b></div></div><label class="fd-setting">Repair whole hull points<input data-setting="repairPoints" type="number" min="1" max="${100-e.shipCondition.hull}" value="${repairPoints}" ${disabled||e.shipCondition.hull===100?'disabled':''}></label><button data-action="exp-repair" ${disabled||e.shipCondition.hull===100?'disabled':''}>Review repair · £5 per hull point</button><p class="fd-caption">Repairs are an operating expense. You choose points; nothing is spent automatically.</p><button class="fd-quiet" data-action="exp-upgrade" ${disabled||!completed||state.locationId!=='earth'||e.upgrades.includes('cargo-bracing')?'disabled':''}>${e.upgrades.includes('cargo-bracing')?'Cargo bracing installed · 50-unit hold':'Review cargo bracing · £1,500'}</button><p class="fd-caption">Available at Earth after the first return. Hold capacity 40→50; keep £350 outbound reserve. Capital spend, no combat damage bonus.</p><h3>Eden’s living memory</h3><p class="fd-narrative">An envoy offers limited extraction and relay operating rights. Two Medicine and £300 buys an agreement; it does not make you owner of Eden.</p><button data-action="exp-relay" ${disabled||!completed||state.locationId!=='eden'||e.relay.status==='secured'?'disabled':''}>${e.relay.status==='secured'?'Relay rights secured':'Review relay agreement'}</button><p class="fd-caption">At Eden after the first return: consume 2 actual Medicine. Secured rights discount future Eden→Earth fares by £100. Current relay: ${esc(e.relay.status)}.</p>${eventHistory(encounter,history,disabled)}`;
}

function eventHistory(encounter,history,disabled) {
  if(!encounter) return '';
  const window=history || encounter;
  return `<h3>Recorded events</h3><p class="fd-caption">Window ${window.cursor.from}–${window.cursor.to} of ${window.cursor.total}; read-only history, not a new settlement.</p><ol class="fd-events">${window.events.slice(-12).map(e=>`<li>Tick ${e.tick} · ${esc(e.type)}${e.damage!==undefined?` · ${e.damage} hull damage`:''}${e.cargoLost!==undefined?` · ${e.cargoLost} cargo lost`:''}</li>`).join('') || '<li>No battle events yet.</li>'}</ol><div class="fd-choice-grid"><button class="fd-quiet" data-action="battle-history" data-id="0" ${disabled?'disabled':''}>Read from start</button>${window.cursor.next!==null?`<button class="fd-quiet" data-action="battle-history" data-id="${window.cursor.next}" ${disabled?'disabled':''}>Next owned window</button>`:''}</div>`;
}
