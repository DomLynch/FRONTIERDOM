import { ApiError, uuid } from './errors.mjs';

export function encounterId(state) {
  const pending=state.expedition?.pendingJourney;
  return pending ? uuid(pending.encounterId) : null;
}

export function assertExpeditionAction(state,action) {
  const pending=encounterId(state);
  const encounterAction=['encounter_choice','battle_advance'].includes(action.type);
  if(pending && !encounterAction) throw new ApiError('ENCOUNTER_PENDING','Resolve the pending crossing before another company action.',409);
  if(encounterAction && (!pending || uuid(action.encounterId)!==pending)) {
    throw new ApiError('ENCOUNTER_CHANGED','This encounter is not the company’s current pending crossing.',409);
  }
}

export function expeditionBinding(state) {
  return { expeditionVersion:state.expedition?.version ?? null,
    pendingEncounterId:encounterId(state),firstReturnStatus:state.expedition?.firstReturnStatus ?? null };
}

export function assertExpeditionQuote(state,stored) {
  const binding=expeditionBinding(state);
  if(stored.rulesVersion!=='expedition-1' || Object.keys(binding).some(key=>stored[key]!==binding[key])) {
    throw new ApiError('STALE_QUOTE','Expedition state changed. Request a fresh quote.',409);
  }
}
