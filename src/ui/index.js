import './ui.css';
import { acceptSnapshot, isDefiniteRejection, maximumQuote, pendingKey } from './commands.js';

const money = (pence) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
const signed = (pence) => `${pence > 0 ? '+' : ''}${money(pence)}`;
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const place = (id) => id === 'earth' ? 'Earth' : 'Eden';

export function mountUI(container, { api, onState = () => {} }) {
  let state, selectedLocation, busy = false, destroyed = false, quote = null, pending = null;
  let notice = '', error = '', mode = 'buy', quantities = new Map(), sessionReady = false, recoveryReady = false;
  let restoreFocus = null;
  const storage = () => window.localStorage;

  function accept(incoming) {
    if (destroyed) return;
    if (state && state.companyId !== incoming.companyId) recoveryReady = false;
    state = acceptSnapshot(state, incoming);
    selectedLocation ??= state.locationId;
    onState(state);
  }

  async function refresh() {
    const response = await api.state();
    accept(response.state);
  }

  function persist(command) {
    // Refuse submission if the retry record cannot survive a browser reload.
    const existing = storage().getItem(pendingKey());
    if (existing) {
      try { pending = JSON.parse(existing); } catch { pending = { companyId: 'unreadable-record' }; }
      throw new Error('Another request is awaiting confirmation. Resolve it before trading.');
    }
    const record = { companyId: state.companyId, ...command };
    storage().setItem(pendingKey(), JSON.stringify(record));
    pending = record;
  }

  function clearPending() {
    storage().removeItem(pendingKey());
    pending = null;
  }

  async function task(work) {
    if (busy || destroyed) return;
    busy = true; error = ''; render();
    try { await work(); }
    catch (cause) {
      error = cause.message || 'Connection interrupted. Please try again.';
      if (cause.status === 409 && sessionReady && !pending) {
        quote = null;
        try { await refresh(); } catch { /* Preserve the original conflict and allow explicit refresh. */ }
      }
    }
    finally { busy = false; if (!destroyed) render(); }
  }

  async function connect() {
    await task(async () => {
      if (sessionReady) await refresh();
      else {
        const response = await api.session();
        accept(response.state); sessionReady = true;
      }
      const saved = storage().getItem(pendingKey());
      if (saved) {
        try {
          pending = JSON.parse(saved);
          if (!pending || typeof pending.companyId !== 'string' || typeof pending.commandId !== 'string'
            || typeof pending.quoteId !== 'string' || !Number.isSafeInteger(pending.expectedRevision)) throw new Error('Invalid retry record');
        } catch { pending = { companyId: 'unreadable-record' }; }
        notice = pending.companyId === state.companyId
          ? 'A previous request needs confirmation. Retry it before making another trade.'
          : 'Your browser session now belongs to a different company. The previous company’s request is unresolved.';
      }
      recoveryReady = true;
    });
  }

  async function sendPending() {
    try {
      if (pending.companyId !== state.companyId) throw new Error('Cannot retry a request belonging to another company.');
      const { commandId, quoteId, expectedRevision } = pending;
      const response = await api.command({ commandId, quoteId, expectedRevision });
      accept(response.state);
      clearPending(); quote = null; quantities.clear(); selectedLocation = state.locationId;
      notice = response.replayed ? 'Previous request confirmed. Your account was charged once.' : 'Confirmed. Your company is up to date.';
      // Replayed responses can predate commands made by another tab.
      await refresh();
    } catch (cause) {
      if (pending && isDefiniteRejection(cause)) {
        clearPending(); quote = null;
        try { await refresh(); } catch { /* Keep the rejection visible; refresh is separately available. */ }
      }
      if (pending) notice = 'Outcome not confirmed. Retry the same request; new trades are paused.';
      throw cause;
    }
  }

  function commodityName(id) {
    return state.markets.flatMap((market) => market.commodities).find((item) => item.id === id)?.name || id;
  }

  function actionLabel(action) {
    return action.type === 'travel' ? `Travel to ${place(action.destinationId)}`
      : `${action.type === 'buy' ? 'Buy' : 'Sell'} ${action.quantity} ${commodityName(action.commodityId)}`;
  }

  function render() {
    if (destroyed) return;
    const hadDialog = !!container.querySelector('[role="dialog"]');
    const focusId = container.contains(document.activeElement) ? document.activeElement?.dataset.focus : null;
    const disabled = busy || !!pending || !recoveryReady;
    container.classList.add('fd-ui');
    if (!state) {
      container.innerHTML = `<section class="fd-loading"><span class="fd-eyebrow">ORBITAL COMMERCE / 01</span><h1>FRONTIERDOM<span>Build your own horizon.</span></h1><p role="status">${busy ? 'Connecting to your company…' : escape(error || 'Your company is ready to connect.')}</p><button data-action="refresh" ${busy ? 'disabled' : ''}>${busy ? 'Connecting…' : 'Retry connection'}</button></section>`;
      return;
    }
    const used = state.ship.cargo.reduce((sum, item) => sum + item.quantity, 0);
    const basis = state.ship.cargo.reduce((sum, item) => sum + item.costBasisPence, 0);
    const market = state.markets.find((item) => item.locationId === selectedLocation);
    const destination = state.locationId === 'earth' ? 'eden' : 'earth';
    const route = state.routes.find((item) => item.from === state.locationId && item.to === destination);
    const comparison = state.markets.find((item) => item.locationId !== selectedLocation);
    const here = selectedLocation === state.locationId;
    const finances = state.finances;
    const cards = market.commodities.map((item, index) => {
      const cargo = state.ship.cargo.find((entry) => entry.commodityId === item.id);
      const other = comparison?.commodities.find((entry) => entry.id === item.id);
      const quantity = quantities.get(item.id) ?? 1;
      const ceiling = mode === 'sell' ? cargo?.quantity || 0 : Math.min(item.stockUnits, state.ship.capacityUnits - used);
      return `<article class="fd-commodity"><div class="fd-item-head"><span class="fd-item-symbol" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span><div><h3>${escape(item.name)}</h3><p>${item.stockUnits} in market · ${cargo?.quantity || 0} aboard</p></div></div><div class="fd-price"><strong>${money(mode === 'buy' ? item.buyUnitPence : item.sellUnitPence)}</strong><span>indicative / unit</span></div><p class="fd-comparison">${place(comparison?.locationId)} buys at <b>${other ? money(other.sellUnitPence) : '—'}</b></p>${cargo?.quantity ? `<p class="fd-basis">Cargo acquisition cost ${money(cargo.costBasisPence)}</p>` : ''}${here ? `<div class="fd-trade-controls"><label class="fd-quantity">Units<input aria-label="${escape(item.name)} quantity" data-quantity="${escape(item.id)}" data-focus="qty-${escape(item.id)}" type="number" inputmode="numeric" min="1" max="${ceiling}" step="1" value="${quantity}" ${disabled || !ceiling ? 'disabled' : ''}></label><button class="fd-quiet" data-action="max" data-id="${escape(item.id)}" ${disabled || !ceiling ? 'disabled' : ''}>Max</button><button data-action="quote" data-id="${escape(item.id)}" data-focus="trade-${escape(item.id)}" ${disabled || !ceiling ? 'disabled' : ''}>Review ${mode}</button></div>` : '<p class="fd-away">Travel here to trade</p>'}</article>`;
    }).join('');
    const receipts = [...state.receipts].sort((a, b) => b.revision - a.revision).slice(0, 5);
    container.innerHTML = `<div class="fd-shell" data-location="${state.locationId}">
      <header class="fd-header"><a class="fd-brand" href="#">FRONTIERDOM<span>INDEPENDENT TRADE COMPANY</span></a><span class="fd-location"><i></i> Docked · ${place(state.locationId)}</span></header>
      <section class="fd-hud" aria-label="Company overview"><div><span>Available cash</span><strong>${money(state.cashPence)}</strong></div><div><span>Cargo hold</span><strong>${used}<small> / ${state.ship.capacityUnits} units</small></strong><meter min="0" max="${state.ship.capacityUnits}" value="${used}" aria-label="Cargo capacity"></meter></div><div class="fd-hud-profit"><span>Realized profit / loss</span><strong class="${finances.realizedProfitPence < 0 ? 'fd-loss' : 'fd-gain'}">${signed(finances.realizedProfitPence)}</strong></div></section>
      <section class="fd-intro"><div><span class="fd-eyebrow">${state.locationId === 'earth' ? 'THE DEPARTURE / EARTH ORBIT' : 'THE FRONTIER / EDEN GATE'}</span><h1>${state.locationId === 'earth' ? 'Opportunity<br>begins in orbit.' : 'A new world.<br>A different margin.'}</h1><p>${state.locationId === 'earth' ? 'Start with Medicine. Review 20 units, compare Eden’s demand, then set your course.' : 'Sell your Medicine here. For the journey home, compare Aurelia’s price on Earth.'}</p></div><div class="fd-scene-window" aria-hidden="true"><span>${escape(state.ship.name)}<small>ONE FREIGHTER · ${state.crew.length} CREW</small></span></div></section>
      <div class="fd-feedback" aria-live="polite" role="status">${busy ? '<span>Contacting station…</span>' : escape(notice)}</div>
      ${error ? `<div class="fd-error" role="alert">${escape(error)}</div>` : ''}
      ${pending ? `<div class="fd-pending"><p>${pending.companyId === state.companyId ? 'Request awaiting confirmation. Retrying uses the original request ID.' : 'Unresolved request belongs to your previous company. Discarding removes only this local retry record; it cannot undo or confirm the old trade.'}</p><button data-action="${pending.companyId === state.companyId ? 'retry' : 'discard'}" ${busy ? 'disabled' : ''}>${busy ? 'Confirming…' : pending.companyId === state.companyId ? 'Retry original request' : 'Discard old retry record & continue'}</button></div>` : ''}
      <div class="fd-workspace"><section class="fd-market"><div class="fd-section-heading"><div><span class="fd-eyebrow">01 / RESEARCH & TRADE</span><h2>Station market</h2></div><button class="fd-quiet" data-action="refresh" ${busy ? 'disabled' : ''}>Refresh</button></div>
      <div class="fd-market-toolbar"><div class="fd-tabs" role="group" aria-label="Market location">${state.markets.map((entry) => `<button aria-pressed="${selectedLocation === entry.locationId}" data-action="market" data-id="${entry.locationId}" ${busy ? 'disabled' : ''}>${place(entry.locationId)}${entry.locationId === state.locationId ? ' <small>HERE</small>' : ''}</button>`).join('')}</div><div class="fd-mode" role="group" aria-label="Trade action"><button data-action="mode" data-id="buy" aria-pressed="${mode === 'buy'}" ${disabled ? 'disabled' : ''}>Buy</button><button data-action="mode" data-id="sell" aria-pressed="${mode === 'sell'}" ${disabled ? 'disabled' : ''}>Sell</button></div></div><div class="fd-cards">${cards}</div><p class="fd-caption">Prices are indicative. Review obtains the exact station quote before you confirm.</p></section>
      <aside class="fd-sidebar"><section class="fd-route"><span class="fd-eyebrow">02 / SET YOUR COURSE</span><h2>${place(state.locationId)} <span>→</span> ${place(destination)}</h2><p>${destination === 'eden' ? 'A settlement beyond the gate. Medical supplies are in demand.' : 'Return to Earth’s established trading hub.'}</p><div class="fd-route-cost"><span>Travel including fuel</span><strong>${route ? money(route.travelCostPence) : 'Unavailable'}</strong></div><button data-action="travel" ${disabled || !route ? 'disabled' : ''}>Review departure <span aria-hidden="true">↗</span></button><small>Travel charges once. Your cargo travels with you.</small></section>
      <section class="fd-cargo"><span class="fd-eyebrow">03 / YOUR COMPANY</span><h2>${escape(state.ship.name)}</h2><div class="fd-inventory">${state.ship.cargo.filter((item) => item.quantity).map((item) => `<div><span>${escape(commodityName(item.commodityId))}</span><b>${item.quantity} units</b></div>`).join('') || '<p>Your hold is empty. Find your first opportunity.</p>'}</div><div class="fd-inventory-total"><span>Cargo acquisition cost</span><b>${money(basis)}</b></div><div class="fd-crew">${state.crew.map((crew) => `<div><span class="fd-avatar" aria-hidden="true">${escape(crew.name.slice(0, 1))}</span><div><b>${escape(crew.name)}</b><small>${escape(crew.role)}</small></div></div>`).join('')}</div></section></aside></div>
      <section class="fd-ledger"><div class="fd-section-heading"><div><span class="fd-eyebrow">04 / THE RESULTS</span><h2>Trade ledger</h2></div><span>All journeys · server confirmed</span></div><div class="fd-totals"><div><span>Sales</span><b>${money(finances.salesPence)}</b></div><div><span>Sold cargo cost</span><b>${money(finances.salesCostBasisPence)}</b></div><div><span>Travel</span><b>${money(finances.travelPence)}</b></div><div><span>Realized profit / loss</span><b class="${finances.realizedProfitPence < 0 ? 'fd-loss' : 'fd-gain'}">${signed(finances.realizedProfitPence)}</b></div><div><span>Net cash flow</span><b>${signed(finances.netCashFlowPence)}</b></div></div><p class="fd-caption">Realized profit deducts sold cargo cost and travel. Unsold cargo stays in your hold. Cash flow includes all purchases.</p><div class="fd-receipts">${receipts.map((receipt) => `<div><span><b>${escape(actionLabel(receipt.action))}</b><small>${place(receipt.locationAfter)} · ${escape(new Date(receipt.occurredAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))}</small></span><span class="fd-receipt-value"><strong>${signed(receipt.creditPence - receipt.debitPence)}</strong><small>Cash movement · profit ${signed(receipt.realizedProfitPence)}</small></span></div>`).join('') || '<p>Your first confirmed trade will appear here.</p>'}</div></section><footer class="fd-footer">FRONTIERDOM <span>Trading prototype · Earth / Eden</span><button class="fd-quiet" data-action="refresh" ${busy ? 'disabled' : ''}>Sync company</button></footer>
    </div>${quote && !pending ? `<div class="fd-overlay"><section class="fd-dialog" role="dialog" aria-modal="true" aria-labelledby="fd-confirm-title" tabindex="-1"><span class="fd-eyebrow">STATION QUOTE / CONFIRM</span><h2 id="fd-confirm-title">${escape(actionLabel(quote.action))}</h2><p>Exact quote from your current station. Prices may change until confirmed.</p><dl><div><dt>Pay</dt><dd>${money(quote.debitPence)}</dd></div><div><dt>Receive</dt><dd>${money(quote.creditPence)}</dd></div></dl><p class="fd-caption">Expires ${escape(new Date(quote.expiresAt).toLocaleTimeString('en-GB'))}</p><div class="fd-dialog-actions"><button class="fd-quiet" data-action="cancel" ${busy ? 'disabled' : ''}>Cancel</button><button data-action="confirm" ${busy ? 'disabled' : ''}>${busy ? 'Confirming…' : 'Confirm transaction'}</button></div></section></div>` : ''}`;
    const dialog = container.querySelector('[role="dialog"]');
    if (dialog && (!hadDialog || !dialog.contains(document.activeElement))) dialog.focus();
    else if (focusId) [...container.querySelectorAll('[data-focus]')].find((element) => element.dataset.focus === focusId)?.focus();
    else if (hadDialog && !dialog) container.querySelector(`[data-action="${restoreFocus || 'refresh'}"]`)?.focus();
  }

  async function handleClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button || button.disabled || !container.contains(button)) return;
    const action = button.dataset.action, id = button.dataset.id;
    if (action === 'cancel') { quote = null; render(); return; }
    if (action === 'market') { selectedLocation = id; render(); return; }
    if (action === 'mode') { mode = id; render(); return; }
    if (action === 'refresh') { await connect(); return; }
    if (action === 'discard') { await task(async () => { clearPending(); notice = 'Old retry record discarded. This company is unchanged.'; }); return; }
    if (action === 'retry') { await task(sendPending); return; }
    if (pending || !recoveryReady) return;
    await task(async () => {
      if (action === 'confirm') {
        if (Date.parse(quote.expiresAt) <= Date.now()) { quote = null; throw new Error('This quote expired. Review again for a fresh price.'); }
        persist({ commandId: crypto.randomUUID(), quoteId: quote.id, expectedRevision: quote.expectedRevision });
        await sendPending(); return;
      }
      restoreFocus = action;
      if (action === 'travel') quote = (await api.quote({ type: 'travel', destinationId: state.locationId === 'earth' ? 'eden' : 'earth' })).quote;
      else {
        const item = state.markets.find((market) => market.locationId === state.locationId).commodities.find((entry) => entry.id === id);
        if (action === 'max') {
          const used = state.ship.cargo.reduce((sum, entry) => sum + entry.quantity, 0);
          const ceiling = mode === 'sell' ? state.ship.cargo.find((entry) => entry.commodityId === id)?.quantity || 0 : Math.min(item.stockUnits, state.ship.capacityUnits - used);
          quote = await maximumQuote(api, { type: mode, commodityId: id }, ceiling);
          quantities.set(id, quote.action.quantity);
        } else {
          const quantity = quantities.get(id) ?? 1;
          if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Choose a positive whole number of units.');
          quote = (await api.quote({ type: mode, commodityId: id, quantity })).quote;
        }
      }
    });
  }

  function handleInput(event) {
    if (event.target.dataset.quantity) quantities.set(event.target.dataset.quantity, Number(event.target.value));
  }

  function handleKey(event) {
    const dialog = container.querySelector('[role="dialog"]');
    if (!dialog) return;
    if (event.key === 'Escape' && !busy) { quote = null; render(); }
    if (event.key === 'Tab') {
      const controls = [...dialog.querySelectorAll('button:not(:disabled)')];
      if (!controls.length) { event.preventDefault(); return; }
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }

  function resume() {
    if (document.visibilityState === 'visible' && sessionReady && !busy) {
      quote = null;
      task(refresh);
    }
  }
  container.addEventListener('click', handleClick);
  container.addEventListener('input', handleInput);
  container.addEventListener('keydown', handleKey);
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('online', resume);
  connect();
  return { destroy() {
    destroyed = true;
    container.removeEventListener('click', handleClick);
    container.removeEventListener('input', handleInput);
    container.removeEventListener('keydown', handleKey);
    document.removeEventListener('visibilitychange', resume);
    window.removeEventListener('online', resume);
    container.replaceChildren(); container.classList.remove('fd-ui');
  } };
}
