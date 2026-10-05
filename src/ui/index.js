import './ui.css';
import { acceptSnapshot, isDefiniteRejection, maximumQuote, pendingKey, removeResolvedPending } from './commands.js';
import { createLoginAttempt, authReturnMessage, pendingMatchesAccount } from './auth.js';
import { voyageObjective, quoteObjective, readGuidance, saveGuidance } from './guidance.js';

const money = (pence) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
const signed = (pence) => `${pence > 0 ? '+' : ''}${money(pence)}`;
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const place = (id) => id === 'earth' ? 'Earth' : 'Eden';

export function mountUI(container, { api, onState = () => {}, googleAuthOrigin }) {
  let state, selectedLocation, busy = false, destroyed = false, quote = null, pending = null;
  let notice = '', error = '', mode = 'buy', quantities = new Map(), sessionReady = false, recoveryReady = false;
  let restoreFocus = null;
  let panel = null, guidanceVisible = true, guidanceCompany;
  let user = null, authChecked = false, accountMismatch = false, loginBusy = false, loginSequence = 0;
  const loginAttempt = createLoginAttempt(api, (url) => window.location.assign(url), { authOrigin: googleAuthOrigin, siteOrigin: window.location.origin });
  const storage = () => window.localStorage;
  const returned = authReturnMessage(new URLSearchParams(window.location.search));
  if (returned) {
    notice = returned;
    const url = new URL(window.location.href); url.searchParams.delete('auth');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function accept(incoming) {
    if (destroyed) return;
    if (state && state.companyId !== incoming.companyId) recoveryReady = false;
    state = acceptSnapshot(state, incoming);
    if (guidanceCompany !== state.companyId) {
      guidanceCompany = state.companyId;
      guidanceVisible = readGuidance(storage(), state.companyId);
      panel = null;
    }
    selectedLocation ??= state.locationId;
    onState(state);
  }

  async function refresh() {
    const response = await api.state();
    if (pending && !pendingMatchesAccount(pending, user, response.state.companyId)) {
      accountMismatch = true; recoveryReady = false;
      throw new Error('Sign in with the original Google account to confirm your pending trade.');
    }
    accept(response.state);
  }

  function persist(command) {
    // Refuse submission if the retry record cannot survive a browser reload.
    const existing = storage().getItem(pendingKey());
    if (existing) {
      try { pending = JSON.parse(existing); } catch { pending = { companyId: 'unreadable-record' }; }
      throw new Error('Another request is awaiting confirmation. Resolve it before trading.');
    }
    const record = { companyId: state.companyId, userId: user.id, ...command };
    storage().setItem(pendingKey(), JSON.stringify(record));
    pending = record;
  }

  function clearPending() {
    const other = removeResolvedPending(storage(), pendingKey(), pending);
    if (other) {
      pending = other;
      throw new Error('Another saved trade needs confirmation. Refresh to recover it.');
    }
    pending = null;
  }

  async function task(work) {
    if (busy || destroyed) return;
    busy = true; error = ''; render();
    try { await work(); }
    catch (cause) {
      error = cause.message || 'Connection interrupted. Please try again.';
      if (cause.status === 401 || cause.status === 403 || cause.code === 'ACCOUNT_CHANGED') {
        recoveryReady = false; quote = null; authChecked = false;
        notice = 'Your session needs reconnecting. Sign in with the same Google account to restore your progress.';
      }
      if (cause.status === 409 && sessionReady && !pending) {
        quote = null;
        try { await refresh(); } catch { /* Preserve the original conflict and allow explicit refresh. */ }
      }
    }
    finally { busy = false; if (!destroyed) render(); }
  }

  async function connect() {
    await task(async () => {
      // Inspect intent before any session bootstrap: a missing cookie must not
      // create a new company while a previous company's outcome is unknown.
      const saved = storage().getItem(pendingKey());
      if (saved) {
        try {
          pending = JSON.parse(saved);
          if (!pending || typeof pending.companyId !== 'string' || typeof pending.commandId !== 'string'
            || typeof pending.quoteId !== 'string' || !Number.isSafeInteger(pending.expectedRevision)) throw new Error('Invalid retry record');
        } catch { pending = { companyId: 'unreadable-record' }; }
        notice = 'An earlier trade still needs confirmation. Sign in with its original Google account; the exact request is saved.';
      }
      authChecked = false; recoveryReady = false;
      const auth = await api.authSession();
      if (destroyed) return;
      if (user?.id !== auth.user?.id) {
        state = undefined; selectedLocation = undefined; sessionReady = false; quote = null; quantities.clear();
      }
      user = auth.user; authChecked = true; accountMismatch = false; recoveryReady = false;
      if (!user) { sessionReady = false; return; }
      if (pending?.userId && pending.userId !== user.id) { accountMismatch = true; return; }
      if (sessionReady || saved) await refresh();
      else {
        const response = await api.session();
        accept(response.state); sessionReady = true;
      }
      sessionReady = true;
      if (pending) notice = pendingMatchesAccount(pending, user, state.companyId)
        ? 'A previous request needs confirmation. Retry it before making another trade.'
        : 'Sign in with the original Google account to confirm your pending trade.';
      recoveryReady = true;
    });
  }

  async function sendPending() {
    let submitted = false;
    try {
      if (!authChecked || !pendingMatchesAccount(pending, user, state?.companyId)) throw new Error('Sign in with the original Google account before retrying.');
      const auth = await api.authSession();
      if (auth.user?.id !== user.id) {
        authChecked = false; recoveryReady = false;
        throw new Error('Your account session changed. Reconnect with the original Google account before retrying.');
      }
      await refresh(); // Verify the pending company under the current server session.
      const { commandId, quoteId, expectedRevision } = pending;
      submitted = true;
      const response = await api.command({ commandId, quoteId, expectedRevision }, { expectedCompanyId: pending.companyId });
      accept(response.state);
      clearPending(); quote = null; quantities.clear(); selectedLocation = state.locationId;
      notice = response.replayed ? 'Previous request confirmed. Your account was charged once.' : 'Confirmed. Your company is up to date.';
      // Replayed responses can predate commands made by another tab.
      await refresh();
    } catch (cause) {
      if (submitted && pending && isDefiniteRejection(cause)) {
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
    const disabled = busy || loginBusy || !!pending || !recoveryReady || !authChecked;
    const logoutBlocked = !!pending && !accountMismatch && (!!state || pending.userId === user?.id);
    container.classList.add('fd-ui');
    container.classList.toggle('fd-playing', !!state && !!user && authChecked && !accountMismatch);
    if (!state || !user || !authChecked || accountMismatch) {
      container.innerHTML = `<section class="fd-auth"><a class="fd-brand" href="#">FRONTIERDOM<span>INDEPENDENT TRADE COMPANY</span></a><div class="fd-auth-card"><span class="fd-eyebrow">YOUR COMPANY / YOUR HORIZON</span><h1>${pending ? 'Your trade is<br>safe to recover.' : 'The frontier<br>is yours to build.'}</h1><p>${pending ? 'Use the original Google account to confirm the saved request. It will never be charged twice.' : 'One freighter. Three crew. A world of opportunity. Sign in to start trading or continue your journey.'}</p>${user ? `<div class="fd-auth-account"><span>Signed in as</span><strong>${escape(user.displayName || 'Google account')}</strong></div>` : ''}<p class="fd-auth-status" role="status">${escape(loginBusy ? 'Opening Google sign-in…' : busy ? 'Connecting to your company…' : notice)}</p>${error ? `<p class="fd-error" role="alert">${escape(error)}</p>` : ''}<div class="fd-auth-actions">${loginBusy ? '<button class="fd-quiet" data-action="cancel-login">Cancel sign-in</button>' : !user || !authChecked ? `<button class="fd-google" data-action="login" ${busy ? 'disabled' : ''}><span aria-hidden="true">G</span> Continue with Google</button>` : ''}<button class="fd-quiet" data-action="refresh" ${busy || loginBusy ? 'disabled' : ''}>${busy ? 'Connecting…' : 'Retry connection'}</button>${user ? `<button class="fd-quiet" data-action="logout" ${busy || loginBusy || logoutBlocked ? 'disabled' : ''}>${accountMismatch ? 'Sign out to use original account' : 'Sign out'}</button>` : ''}</div>${logoutBlocked ? '<p class="fd-caption">Confirm your pending trade before signing out.</p>' : ''}<p class="fd-caption">Your company progress is saved to your account.</p></div><footer class="fd-footer">ORBITAL COMMERCE <span>Earth / Eden · Trading prototype</span></footer></section>`;
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
    const objective = voyageObjective(state);
    const captain = state.crew.find(c => c.role === 'captain');
    const last = receipts[0];
    const confirmedArrival = last?.action.type === 'travel' && last.locationAfter === 'eden';
    const crewLines = { captain:'I’ll take Horizon through the gate. You choose the cargo and the course.', engineer:'I keep the freighter running. Our hold has room for 40 units.', trader:'Compare the far market, then review the local quote. A margin is never a promise.' };
    const heading = {market:'Station market',route:'Gate corridor',ship:'Horizon & crew',ledger:'Voyage ledger'};
    let content = '';
    if (panel === 'market') content = `<div class="fd-market-toolbar"><div class="fd-tabs" role="group" aria-label="Market location">${state.markets.map(entry => `<button aria-pressed="${selectedLocation === entry.locationId}" data-action="market" data-id="${entry.locationId}">${place(entry.locationId)} <small>${entry.locationId === state.locationId ? 'DOCKED' : 'REMOTE'}</small></button>`).join('')}</div><div class="fd-mode" role="group" aria-label="Trade action"><button data-action="mode" data-id="buy" aria-pressed="${mode === 'buy'}" ${disabled ? 'disabled' : ''}>Buy</button><button data-action="mode" data-id="sell" aria-pressed="${mode === 'sell'}" ${disabled ? 'disabled' : ''}>Sell</button></div></div><p class="fd-market-context">${here ? `Trading at your physical port: ${place(state.locationId)}.` : `Remote prices at ${place(selectedLocation)}. Horizon is still docked at ${place(state.locationId)}; travel before trading here.`}</p><div class="fd-cards">${cards}</div><p class="fd-caption">Indicative prices. Review a station quote before confirming.</p>`;
    if (panel === 'route') content = `<div class="fd-route-map" aria-label="Earth through the gate to Eden"><span class="${state.locationId === 'earth' ? 'fd-here' : ''}">Earth<small>Human orbital port</small></span><span>◇<small>Ancient gate</small></span><span class="${state.locationId === 'eden' ? 'fd-here' : ''}">Eden<small>Living frontier</small></span></div><p>Horizon is docked at <b>${place(state.locationId)}</b>. Reviewing a remote market does not move your ship.</p><div class="fd-route-cost"><span>${place(state.locationId)} → ${place(destination)} · fuel included</span><strong>${route ? money(route.travelCostPence) : 'Unavailable'}</strong></div><p class="fd-caption">Cargo stays aboard. This trading route has no combat encounter yet. Launch occurs only after a confirmed travel command.</p><button data-action="travel" ${disabled || !route ? 'disabled' : ''}>Review departure to ${place(destination)}</button>`;
    if (panel === 'ship') content = `<p class="fd-caption">One independent freighter · ${state.crew.length} crew · ${used}/${state.ship.capacityUnits} cargo units</p><div class="fd-inventory">${state.ship.cargo.map(item => `<div><span>${escape(commodityName(item.commodityId))}</span><b>${item.quantity} units</b></div>`).join('') || '<p>The hold is empty.</p>'}</div><div class="fd-route-cost"><span>Cargo acquisition cost</span><strong>${money(basis)}</strong></div><div class="fd-crew">${state.crew.map(crew => `<article><span class="fd-avatar" aria-hidden="true">${escape(crew.name.slice(0,1))}</span><div><h3>${escape(crew.name)} <small>${escape(crew.role)}</small></h3><p>${escape(crewLines[crew.role] || 'Ready for the next voyage.')}</p></div></article>`).join('')}</div>`;
    if (panel === 'ledger') content = `<div class="fd-totals"><div><span>Realized profit / loss</span><b class="${finances.realizedProfitPence < 0 ? 'fd-loss' : 'fd-gain'}">${signed(finances.realizedProfitPence)}</b></div><div><span>Net cash flow</span><b>${signed(finances.netCashFlowPence)}</b></div><div><span>Sales</span><b>${money(finances.salesPence)}</b></div><div><span>Sold cargo cost</span><b>${money(finances.salesCostBasisPence)}</b></div><div><span>Travel</span><b>${money(finances.travelPence)}</b></div></div><p class="fd-caption">Profit deducts sold cargo cost and travel. Cash flow includes purchases still aboard. No tutorial reward is added.</p><div class="fd-receipts">${receipts.map(receipt => `<div><span><b>${escape(actionLabel(receipt.action))}</b><small>${place(receipt.locationAfter)} · confirmed revision ${receipt.revision}</small></span><span class="fd-receipt-value"><strong>${signed(receipt.creditPence-receipt.debitPence)}</strong><small>Cash movement · profit ${signed(receipt.realizedProfitPence)}</small></span></div>`).join('') || '<p>No confirmed transactions yet.</p>'}</div>`;
    container.innerHTML = `<div class="fd-game" data-location="${state.locationId}">
      <header class="fd-header"><div><span class="fd-brand">FRONTIERDOM</span><span class="fd-location">${escape(state.ship.name)} · Docked at ${place(state.locationId)}</span></div><button class="fd-quiet" data-action="panel" data-id="ship" aria-label="Open ship and crew">Crew ${state.crew.length}</button></header>
      <section class="fd-hud" aria-label="Company overview"><div><span>Available cash</span><strong>${money(state.cashPence)}</strong></div><div><span>Cargo aboard</span><strong>${used}<small> / ${state.ship.capacityUnits}</small></strong></div><button class="fd-quiet" data-action="panel" data-id="ledger"><span>Realized P/L</span><strong class="${finances.realizedProfitPence < 0 ? 'fd-loss' : 'fd-gain'}">${signed(finances.realizedProfitPence)}</strong></button></section>
      <div class="fd-world-window" aria-hidden="true"></div>
      <section class="fd-mission" aria-label="Current objective" data-objective="${objective.id}"><div class="fd-mission-title"><div><span class="fd-eyebrow">THE OTHER SIDE · ${place(state.locationId).toUpperCase()}</span><h1>${escape(pending ? 'Confirm your saved trade' : objective.title)}</h1></div><button class="fd-quiet fd-guidance-toggle" data-action="guidance" aria-expanded="${guidanceVisible}">${guidanceVisible ? 'Hide guide' : 'Resume guide'}</button></div>
      ${guidanceVisible && !pending ? `<p class="fd-story">${state.revision === 0 ? `2035. An ancient gate beyond the Moon has opened onto Eden. You own ${escape(state.ship.name)}, one freighter and a chance to build something of your own. ` : confirmedArrival ? 'EDEN-01. Beneath the forests, lights move against the wind. The valley seems to breathe. ' : ''}${escape(objective.story)}</p><span class="fd-captain">${escape(captain?.name || 'Captain')} · Captain’s voyage guide</span>` : ''}
      <div class="fd-feedback" aria-live="polite" role="status">${busy ? 'Contacting station…' : escape(notice)}</div>${error ? `<div class="fd-error" role="alert">${escape(error)}</div>` : ''}
      ${pending ? `<div class="fd-pending"><p>Outcome not confirmed. The original request is saved; new trades are paused.</p><button data-action="retry" ${busy ? 'disabled' : ''}>Retry original request</button></div>` : `<button class="fd-next" data-action="next" ${disabled ? 'disabled' : ''}>${escape(objective.label)} <span aria-hidden="true">→</span></button>`}
      <nav class="fd-nav" aria-label="Ship controls">${['market','route','ship','ledger'].map(id => `<button class="fd-quiet" data-action="panel" data-id="${id}" aria-pressed="${panel === id}">${{market:'Market',route:'Route',ship:'Crew',ledger:'Ledger'}[id]}</button>`).join('')}</nav></section>
      ${panel ? `<section class="fd-panel" aria-label="${heading[panel]}"><header><h2>${heading[panel]}</h2><button class="fd-quiet" data-action="close-panel" aria-label="Close ${heading[panel]}">Close</button></header><div class="fd-panel-content">${content}<div class="fd-panel-footer"><span>${escape(user.displayName || 'Google account')}</span><button class="fd-quiet" data-action="refresh" ${busy ? 'disabled' : ''}>Sync</button><button class="fd-quiet" data-action="logout" ${busy || logoutBlocked ? 'disabled' : ''}>Sign out</button></div></div></section>` : ''}
    </div>${quote && !pending ? `<div class="fd-overlay"><section class="fd-dialog" role="dialog" aria-modal="true" aria-labelledby="fd-confirm-title" tabindex="-1"><span class="fd-eyebrow">STATION QUOTE / CONFIRM</span><h2 id="fd-confirm-title">${escape(actionLabel(quote.action))}</h2><p>${quote.action.type === 'travel' ? `Horizon stays at ${place(state.locationId)} until you confirm. Fuel is included; cargo travels with you.` : 'Exact quote from your current station. Prices may change until confirmed.'}</p><dl><div><dt>Pay</dt><dd>${money(quote.debitPence)}</dd></div><div><dt>Receive</dt><dd>${money(quote.creditPence)}</dd></div></dl>${quote.action.type === 'buy' ? `<p class="fd-caption">Cash after purchase ${money(state.cashPence-quote.debitPence)} · cargo ${used+quote.action.quantity}/${state.ship.capacityUnits}. ${guidanceVisible ? 'Keep enough cash for your crossing.' : ''}</p>` : ''}<p class="fd-caption">Expires ${escape(new Date(quote.expiresAt).toLocaleTimeString('en-GB'))}. Confirmed profit and cash flow appear separately in the ledger.</p><div class="fd-dialog-actions"><button class="fd-quiet" data-action="cancel" ${busy ? 'disabled' : ''}>Cancel</button><button data-action="confirm" ${busy ? 'disabled' : ''}>${busy ? 'Confirming…' : quote.action.type === 'travel' ? `Launch for ${place(quote.action.destinationId)}` : 'Confirm transaction'}</button></div></section></div>` : ''}`;
    const dialog = container.querySelector('[role="dialog"]');
    if (dialog && (!hadDialog || !dialog.contains(document.activeElement))) dialog.focus();
    else if (focusId) [...container.querySelectorAll('[data-focus]')].find((element) => element.dataset.focus === focusId)?.focus();
    else if (hadDialog && !dialog) container.querySelector(`[data-action="${restoreFocus || 'refresh'}"]`)?.focus();
  }

  async function handleClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button || button.disabled || !container.contains(button)) return;
    const action = button.dataset.action, id = button.dataset.id;
    if (action === 'guidance') {
      guidanceVisible = !guidanceVisible;
      saveGuidance(storage(), state.companyId, guidanceVisible);
      render(); return;
    }
    if (action === 'panel') { panel = panel === id ? null : id; render(); return; }
    if (action === 'close-panel') { panel = null; render(); return; }
    if (action === 'cancel-login') {
      loginSequence++; loginAttempt.cancel(); loginBusy = false; notice = 'Sign-in cancelled. Your progress is unchanged.'; render(); return;
    }
    if (action === 'login') {
      if (busy || loginBusy || (pending && state && !accountMismatch && authChecked)) return;
      quote = null; loginBusy = true; error = ''; render();
      const attempt = ++loginSequence;
      let leaving = false;
      try { leaving = await loginAttempt.start(); }
      catch (cause) { if (attempt === loginSequence) error = cause.message; }
      finally { if (attempt === loginSequence) { loginBusy = leaving; if (!destroyed) render(); } }
      return;
    }
    if (action === 'logout') {
      if (busy || loginBusy) return;
      await task(async () => {
        // A different tab may have submitted since this button was rendered.
        const saved = storage().getItem(pendingKey());
        if (saved) { try { pending = JSON.parse(saved); } catch { pending = { companyId: 'unreadable-record' }; } }
        if (pending && !accountMismatch && (!!state || pending.userId === user?.id)) throw new Error('Confirm your pending trade before signing out.');
        authChecked = false; recoveryReady = false; quote = null;
        await api.signOut();
        user = null; state = undefined; selectedLocation = undefined; sessionReady = false; authChecked = true; accountMismatch = false;
        notice = pending ? 'Signed out. Use the original Google account to confirm your saved trade.' : 'Signed out. Your company will be here when you return.';
      });
      return;
    }
    if (action === 'cancel') { quote = null; render(); return; }
    if (action === 'market') { selectedLocation = id; render(); return; }
    if (action === 'mode') { mode = id; render(); return; }
    if (action === 'refresh') { await connect(); return; }
    if (action === 'retry') { await task(sendPending); return; }
    if (pending || !recoveryReady || !user || !authChecked) return;
    await task(async () => {
      if (action === 'next') {
        const objective = voyageObjective(state);
        if (objective.panel) { panel = objective.panel; selectedLocation = state.locationId; return; }
        restoreFocus = 'next';
        quote = await quoteObjective(api, state, objective);
        return;
      }
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
    if (document.visibilityState === 'visible' && !busy && !loginBusy) {
      quote = null;
      connect();
    }
  }
  function pageShow(event) {
    if (event.persisted) { loginSequence++; loginAttempt.cancel(); loginBusy = false; busy = false; connect(); }
  }
  container.addEventListener('click', handleClick);
  container.addEventListener('input', handleInput);
  container.addEventListener('keydown', handleKey);
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('online', resume);
  window.addEventListener('pageshow', pageShow);
  connect();
  return { destroy() {
    destroyed = true;
    loginSequence++;
    loginAttempt.cancel();
    container.removeEventListener('click', handleClick);
    container.removeEventListener('input', handleInput);
    container.removeEventListener('keydown', handleKey);
    document.removeEventListener('visibilitychange', resume);
    window.removeEventListener('online', resume);
    window.removeEventListener('pageshow', pageShow);
    container.replaceChildren(); container.classList.remove('fd-ui', 'fd-playing');
  } };
}
