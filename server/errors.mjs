export class ApiError extends Error {
  constructor(code, message, status = 400, retryable = false) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

export const invalid = (message = 'Invalid request.') => new ApiError('INVALID_REQUEST', message);

export function exactObject(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) {
    throw invalid();
  }
}

export function uuid(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw invalid('Expected a UUID.');
  }
  return value.toLowerCase();
}

export function actionInput(action, { expedition = false } = {}) {
  if (expedition && ['enroll_expedition','encounter_choice','battle_advance','repair','buy_upgrade','secure_relay'].includes(action?.type)) {
    return expeditionActionInput(action);
  }
  if (action?.type === 'travel') {
    exactObject(action, ['type', 'destinationId']);
    if (!['earth', 'eden'].includes(action.destinationId)) throw invalid('Invalid destination.');
  } else if (['buy', 'sell'].includes(action?.type)) {
    exactObject(action, ['type', 'commodityId', 'quantity']);
    if (typeof action.commodityId !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/.test(action.commodityId) ||
        !Number.isSafeInteger(action.quantity) || action.quantity <= 0 || action.quantity > 10000) {
      throw invalid('Invalid commodity or quantity.');
    }
  } else throw invalid('Unknown action.');
  return structuredClone(action);
}

function positive(value,max) { return Number.isSafeInteger(value) && value>0 && value<=max; }
function commodity(value) { return typeof value==='string' && /^[a-z][a-z0-9-]{0,47}$/.test(value); }
function expeditionActionInput(action) {
  if(action.type==='enroll_expedition') exactObject(action,['type']);
  else if(action.type==='encounter_choice') {
    exactObject(action,action.choice==='drop' ? ['type','encounterId','choice','cargoSelection'] : ['type','encounterId','choice']);
    uuid(action.encounterId);
    if(!['pay','drop','run','fight'].includes(action.choice)) throw invalid('Invalid encounter choice.');
    if(action.choice==='drop') {
      if(!Array.isArray(action.cargoSelection) || action.cargoSelection.length<1 || action.cargoSelection.length>6) throw invalid('Invalid cargo selection.');
      const ids=new Set();
      for(const item of action.cargoSelection) {
        exactObject(item,['commodityId','quantity']);
        if(!commodity(item.commodityId) || !positive(item.quantity,10000) || ids.has(item.commodityId)) throw invalid('Invalid cargo selection.');
        ids.add(item.commodityId);
      }
    }
  } else if(action.type==='battle_advance') {
    exactObject(action,Object.hasOwn(action,'command') ? ['type','encounterId','ticks','command'] : ['type','encounterId','ticks']);
    uuid(action.encounterId);
    if(!positive(action.ticks,180)) throw invalid('Invalid battle tick count.');
    if(Object.hasOwn(action,'command')) {
      const command=action.command;
      if(command?.type==='retreat') exactObject(command,['type']);
      else if(command?.type==='posture') {
        exactObject(command,['type','posture']);
        if(!['defensive','balanced','aggressive'].includes(command.posture)) throw invalid('Invalid posture.');
      } else throw invalid('Invalid battle command.');
    }
  } else if(action.type==='repair') {
    exactObject(action,['type','points']);
    if(!positive(action.points,100)) throw invalid('Invalid repair points.');
  } else if(action.type==='buy_upgrade') {
    exactObject(action,['type','upgradeId']);
    if(action.upgradeId!=='cargo-bracing') throw invalid('Invalid upgrade.');
  } else if(action.type==='secure_relay') {
    exactObject(action,['type','method']);
    if(action.method!=='agreement') throw invalid('Invalid relay method.');
  }
  return structuredClone(action);
}

export function commandInput(body) {
  exactObject(body, ['commandId', 'quoteId', 'expectedRevision']);
  if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) throw invalid('Invalid revision.');
  return { commandId: uuid(body.commandId), quoteId: uuid(body.quoteId), expectedRevision: body.expectedRevision };
}
