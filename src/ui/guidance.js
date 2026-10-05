import { maximumQuote } from './commands.js';

export const guidanceKey = companyId => `frontierdom.guidance.v1:${companyId}`;

// Presentation only. Progress comes from the server snapshot, never this preference.
export function readGuidance(storage, companyId) {
  try { return storage.getItem(guidanceKey(companyId)) !== 'hidden'; } catch { return true; }
}
export function saveGuidance(storage, companyId, visible) {
  try { storage.setItem(guidanceKey(companyId), visible ? 'visible' : 'hidden'); } catch { /* Guidance still works for this visit. */ }
}

/** A suggestion, not a contract or reward. Quotes remain the sole price authority. */
export function voyageObjective(state) {
  const here = state.locationId;
  const market = state.markets.find(m => m.locationId === here);
  const cargo = id => state.ship.cargo.find(c => c.commodityId === id)?.quantity || 0;
  const row = id => market.commodities.find(c => c.id === id);
  const used = state.ship.cargo.reduce((sum, c) => sum + c.quantity, 0);
  const destination = here === 'earth' ? 'eden' : 'earth';
  const route = state.routes.find(r => r.from === here && r.to === destination);
  const reservePence = route?.travelCostPence || 0;
  const soldMedicine = state.receipts.some(r => r.action.type === 'sell' && r.action.commodityId === 'medicine' && r.locationAfter === 'eden');
  const delivered = soldMedicine ? 'Medicine traded at Eden. ' : '';
  const sell = (id, title, story) => ({ id:`sell-${id}`, title, story, label:`Review ${row(id).name} sale`,
    action:{ type:'sell', commodityId:id, quantity:Math.min(cargo(id), row(id).demandUnits) } });
  const travel = title => ({ id:`travel-${destination}`, title,
    story:here === 'earth' ? `${cargo('medicine')} medicine aboard. Review the gate crossing before launch.` : 'Your cargo travels with Horizon. Review the cost before returning to Earth.',
    label:`Review crossing to ${destination === 'earth' ? 'Earth' : 'Eden'}`, action:{ type:'travel', destinationId:destination } });
  if (here === 'eden' && cargo('medicine') && row('medicine').demandUnits) {
    return sell('medicine', 'Deliver your medicine', 'Eden’s settlement is buying medicine. Review the exact sale; proceeds and profit are different.');
  }
  if (here === 'earth' && cargo('aurelia') && row('aurelia').demandUnits) {
    return sell('aurelia', 'Trade your return cargo', 'Horizon is home. Review the Earth sale, then inspect the confirmed voyage ledger.');
  }
  if ((here === 'earth' && cargo('medicine')) || (here === 'eden' && cargo('aurelia'))) {
    if (route && state.cashPence >= reservePence) return travel(here === 'earth' ? 'Take medicine through the gate' : 'Bring Aurelia home');
  }
  // Arbitrary returning saves may contain other cargo or lack crossing cash.
  if (used && (used === state.ship.capacityUnits || state.cashPence <= reservePence || (here === 'eden' && cargo('medicine')))) {
    const held = state.ship.cargo.find(c => c.quantity && row(c.commodityId)?.demandUnits);
    if (held) return sell(held.commodityId, 'Make room for the next voyage', 'Trade cargo at your current port to free capacity or fund the crossing.');
  }
  const good = here === 'earth' ? 'medicine' : 'aurelia';
  const quantity = Math.min(here === 'earth' ? 20 : 10, state.ship.capacityUnits-used, row(good).stockUnits);
  if (quantity > 0 && state.cashPence > reservePence) return {
    id:`buy-${good}`, title:here === 'earth' ? 'Load medicine for Eden' : 'Prepare a return cargo',
    story:here === 'earth' ? 'Eden needs medical supplies. Review up to 20 units, keeping the gate fare in reserve.' : `${delivered}Aurelia grows through Eden’s living terrain. Compare Earth’s market; review up to 10 units for the return.`,
    label:`Review ${row(good).name} cargo`, action:{ type:'buy', commodityId:good, quantity }, reservePence
  };
  if (route && state.cashPence >= reservePence) return travel(`Return to ${destination === 'earth' ? 'Earth' : 'Eden'}`);
  return { id:'market', title:'Find a viable trade', story:'Check the local market and your hold. No affordable crossing is currently available.', label:'Open local market', panel:'market' };
}

export async function quoteObjective(api, state, objective) {
  if (objective.action.type !== 'buy') return (await api.quote(objective.action)).quote;
  // Reserve comes from the authoritative route snapshot; debit from exact quotes.
  const reservedApi = { async quote(action) {
    const response = await api.quote(action);
    if (response.quote.debitPence > state.cashPence-objective.reservePence) {
      throw Object.assign(new Error('Keep enough cash for the crossing.'), { code:'INSUFFICIENT_CASH' });
    }
    return response;
  } };
  return maximumQuote(reservedApi, { type:'buy', commodityId:objective.action.commodityId }, objective.action.quantity);
}

// Only a completed exact quote search may change a cargo suggestion to a crossing.
export async function reviewObjective(api, state, objective) {
  try { return { quote:await quoteObjective(api,state,objective), objective }; }
  catch (error) {
    if (objective.action.type !== 'buy' || error.code !== 'NO_AVAILABLE_UNITS') throw error;
    const route=state.routes.find(r=>r.from===state.locationId);
    if (!route || state.cashPence<route.travelCostPence) throw error;
    const next={ id:`travel-${route.to}`, title:'Review the crossing without extra cargo',
      story:'No cargo load fits the current quotes while reserving your fare. You can cross with your existing hold and inspect the other port.',
      label:`Review crossing to ${route.to==='earth' ? 'Earth' : 'Eden'}`, action:{type:'travel',destinationId:route.to} };
    // A stale fare or provider outage remains an error; never substitute a guessed quote.
    return { quote:(await api.quote(next.action)).quote, objective:next };
  }
}
