# First expedition: bounded risk and a first foothold

Accepted isolated Economy rules, corrected 5 October 2026. Base: live `77948cca638e45bfedf3163281b58c477873e8e3`. This document-only correction changes no kernel, shared contract, Backend or UI files. Lead accepted the shared expedition contract and Combat `8b9ba6f81684a1ce8810c1c5075ef2b47a2216b1`; Economy implementation is `560a1d9` plus `3d5cb85` and terminal adapter `e4279db`. These source receipts are not a released checkpoint-B or gameplay acceptance. Direction: `docs/STRATEGY_NEXT_MVP.md` as read from the canonical checkout. Figures below are integer pence; GBP labels are presentation. Pay/drop and boarded-loss arithmetic follows the accepted rules. Escape with 8 damage and victory with 12 damage remain hypothetical tuning examples, not measured seeded outcomes, probabilities or guaranteed results.

## Baseline and opening incentive

Preserve the six live commodity rules, 40-unit Horizon, Mara/Ivo/Nadia, company-specific stock/demand, weighted-average cargo basis and paid-return replenishment. The medical mission guides a real sale; its incentive is the existing Eden medicine margin, with no additional cash reward and no guaranteed £39,000 ending.

| Accepted operation | Debit pence | Credit pence | Cash after pence |
| --- | ---: | ---: | ---: |
| Start | 0 | 0 | 2500000 |
| Buy 20 Medicine, Earth | 204200 | 0 | 2295800 |
| Travel to Eden | 35000 | 0 | 2260800 |
| Sell 20 Medicine, Eden | 0 | 343350 | 2604150 |
| Buy 20 Aurelia, Eden | 408400 | 0 | 2195750 |
| Paid return crossing | 25000 | 0 | 2170750 |
| Sell 20 Aurelia, Earth, without encounter costs | 0 | 588600 | 2759350 |

Clean round trip: purchases/basis sold 612600, sales 931950, travel 60000, realized profit and net cash flow both 259350 (£2,593.50). Quote the actual current state for every real company; these are fresh-company acceptance inputs.

## First-return interception

One authored raider wants cargo, not a corpse. Trigger once per company on the first eligible Eden -> Earth return after mission enrollment. A company with no cargo passes this one encounter as `passed_empty`; no fake demand or reward. Show: "This raider boards disabled freighters. Surrender can cost cargo; the opening encounter cannot destroy Horizon or kill crew." Later lethal encounters are out of scope.

Departure validates and charges the existing 25000 return cost once and reserves a pending journey. Interception happens before arrival. While pending, disable buy/sell, another departure, upgrades and relay claims. Only settlement moves the ship to Earth and performs the existing replenishment once; repairs happen after arrival. Rejected departure creates no encounter or fee. Do not first apply ordinary travel and then charge travel again.

Freeze the encounter's company revision, cargo, cost basis, hull, seed and demand at departure. The current fresh-company example has 20 Aurelia with 408400 basis and 2170750 cash after the paid crossing.

| Choice | Accepted rule | Opening example |
| --- | --- | --- |
| Pay | Demand `ceil(total cargo acquisition basis / 5)` pence. Pay cash; preserve cargo and hull. Disabled if cash is insufficient; no borrowing for this choice. | 81680 (£816.80), all 20 Aurelia kept, no repairs. |
| Drop cargo | Select commodities; surrender exactly `ceil(total cargo units / 5)` units. Use actual held quantities. No cash debit or sale credit. Allocate surrendered basis with the existing weighted-average rule. | 4 Aurelia surrendered, 81680 basis written off; 16 remain with 326720 basis. |
| Run | Pay 6000 (£60) emergency-thrust service before the seeded escape attempt. Combat decides escape/damage. Successful escape loses no cargo; failed escape permits boarding for `ceil(total units / 4)` units. | Hypothetical escape: 8 hull lost. Boarding from hull 100: 75 hull lost, final hull 25, and 5 Aurelia lost. |
| Fight | Pay 12000 (£120) bounded ammunition/service charge before combat. Choose defensive/balanced/aggressive, protect cargo and a retreat threshold. Combat decides win/escape/boarding. A win or successful retreat keeps cargo; boarding takes `ceil(total units / 2)`. No pirate bounty or loot credit. | Hypothetical victory: 12 hull lost. Boarding from hull 100: 75 hull lost, final hull 25, and 10 Aurelia lost. |

Run/fight fees are the full economic resource charge for this encounter: do not bill the same ammunition again from playback events. Combat may track normalized ammo within its resolver. Economy must not calculate damage, retreat or escape independently. The accepted opening resolver determines actual outcomes and damage; do not advertise numerical win/escape chances before measuring them.

Accepted introductory Combat configuration: initial hull 100; boarding/encounter termination at hull 25, no crew deaths or permanent ship destruction. Combat enforces this explicit scenario rule, not an Economy clamp applied secretly after a lethal outcome. Starting hull below 25 rejects run/fight; pay/drop preserves actual condition and permits repairs after arrival. Starting exactly at hull 25 boards at tick zero. Victory, escape, pirate escape, both escape and stalemate keep cargo; simultaneous pirate destruction has victory precedence. This is an authored nonlethal encounter, not guaranteed victory.

Repair at either station: 500 pence (£5) per missing hull point; full repair quotes exactly `(100 - hull) * 500`. Partial repairs buy whole points only. No negative hull, repair above maximum, automatic spend or wage clock. A damaged ship can complete this reserved return; tow assistance is included in its paid crossing. Repairs are optional; show condition affecting subsequent combat honestly.

## Worked result fixtures

Assume starting hull 100, full repair chosen after arrival, then sell all surviving Aurelia into replenished Earth stock. No upgrade/relay spend is included. The two escape/victory rows are hypothetical damage examples; the boarded rows use the actual accepted hull floor and loss rule.

| Outcome | Extra cash costs pence | Cargo lost / basis written off | Earth sale pence | End cash pence | Realized expedition profit pence |
| --- | ---: | --- | ---: | ---: | ---: |
| Pay | 81680 | 0 / 0 | 588600 | 2677670 | 177670 |
| Drop | 0 | 4 / 81680 | 472800 | 2643550 | 143550 |
| Run, escape, hypothetical 8 damage | 6000 + 4000 repair | 0 / 0 | 588600 | 2749350 | 249350 |
| Run, boarded, 75 damage / hull 25 | 6000 + 37500 repair | 5 / 102100 | 443700 | 2570950 | 70950 |
| Fight, win, hypothetical 12 damage | 12000 + 6000 repair | 0 / 0 | 588600 | 2741350 | 241350 |
| Fight, boarded, 75 damage / hull 25 | 12000 + 37500 repair | 10 / 204200 | 297300 | 2418550 | -81450 |

Earth sale quotes are not flat £300 multiplied by quantity: 10 units sell for 297300, 15 for 443700, 16 for 472800, 20 for 588600. Lost cargo receives no proceeds. Written-off acquisition basis is recognized as a loss exactly once; do not charge both that basis and a fictional resale valuation.

Full repair after boarding costs 37500 (£375) from the accepted hull-25 terminal state. The boarded-run fixture ends at £25,709.50, a £709.50 profit; the boarded-fight fixture loses £814.50 relative to starting capital but leaves £24,185.50, a repaired ship and the same viable trade route. After this one encounter, an ordinary clean 20/20 trip adds £2,593.50, reaching £26,779.00 from the boarded-fight fixture. No free restart, cash reset or scripted payout is needed.

Cash-poor encounter: pay/run/fight require their actual cash costs; drop remains a zero-cash surrender option. Cash-poor empty-cargo pending return arrives without a demand. Travel was prepaid, so the introduction cannot strand its participant in transit.

**PARKED — legacy stranded-save recovery.** An existing Eden company with no cargo and less than 25000 cash remains unable to return in accepted checkpoint B. No recovery action, loan, debt field, reset or fictional income is implemented. The earlier recovery-credit sketch (tow liability plus working-capital loan) is an unaccepted future proposal; its figures are not current quote/action rules. A tow alone would not give an empty zero-cash company a viable next load.

## One attainable upgrade

Cargo bracing: 150000 (£1,500), one purchase, capacity 40 -> 50. Available at Earth after first encounter settlement/pass; require 35000 remaining cash after purchase as a visible outbound reserve. No damage/weapon bonuses. It changes the next load decision immediately and does not invalidate already-held cargo.

Pay fixture leaves £26,776.70; buying bracing leaves £25,276.70, so the upgrade is covered by the £1,776.70 earned profit. Drop fixture's profit is £64.50 short of the upgrade price; let the player spend original capital deliberately or do another run. Do not label this an earned free reward. Failed fight should guide another trade, rather than claim its loss earned an upgrade.

## One relay and one benefit

Site `eden-relay-01`: contested -> secured, attached to this company's progression. Label "first foothold / relay operating rights", never ownership of Eden or shared planetary conquest.

Agreement path: at Eden after the first-return encounter, consume 2 owned Medicine and 30000 (£300) liaison/equipment payment. The envoy trades operating rights for medical aid and a limited extraction pledge; persist that choice as the site's recorded agreement, not a free-floating diplomacy system. At freshly replenished Earth, 2 Medicine cost 20060, so the direct contribution costs 50060 (£500.60) at acquisition basis, plus the actual travel needed to reach Eden. Different existing cargo uses its actual basis, not that fixture price.

**PARKED — tactical relay acquisition.** The earlier second-battle/verified-victory path is not accepted or implemented in B; no reviewed relay scenario exists. Current B accepts agreement only and rejects `secure_relay` with method `combat`. The agreement makes a foothold achievable without a forced win.

Single benefit: secured relay reduces future Eden -> Earth route cost by 10000, from 25000 to 15000 (£250 -> £150). It discounts future departures only; the securing journey has no retroactive refund. The accepted agreement grants this non-stacking concession once; any later tactical path would need a new reviewed contract. Outbound stays 35000. A subsequent unchanged clean 20/20 trade earns 269350 (£2,693.50), not a fictitious reward. Treaty-only contribution breaks even after six discounted returns; extra travel/repair costs extend that break-even. Show the site changing visually when the server confirms it.

## Implemented pure rule and trusted settlement interface

Lead owns the shared transport/schema. Current action types are `enroll_expedition`, existing `travel`, `encounter_choice` (`encounterId`, `choice`, exact `cargoSelection` for drop), `battle_advance` (`encounterId`, `ticks`, optional next-tick command intent), `repair` (`points`), `buy_upgrade` (`upgradeId: 'cargo-bracing'`, never the old `id` alias), and `secure_relay` (`method: 'agreement'`). No `resolveEncounter`, `buyUpgrade`, `secureRelay`, `recoverHome` or debt action is an implemented transport name.

Exports from `src/sim/economy/index.js`: existing `createInitialState`, `quoteAction`, `applyAction`; added `migrateExpeditionState`, `quoteExpeditionAction`, `describeExpeditionAction`, `applyExpeditionAction`, `applyBattleProgress` and `applyBattleSettlement`. The old proposed `applyExpeditionSettlement` name was not implemented. Quotes retain exact debit/credit; `describeExpeditionAction` supplies accounting components and cargo/basis/condition/capacity/location consequences from the shared rules.

`applyBattleProgress(state, action, metadata)` commits one zero-cost revision/receipt; `applyBattleSettlement(state, action, verifiedResult, metadata)` commits actual hull, one verified cargo write-off and reserved arrival/replenishment. Ordinary `applyAction` rejects `battle_advance`: Backend must run the trusted resolver and call the dedicated progress/settlement helper. At hull-25 tick-zero boarding, settlement accepts the original run/fight `encounter_choice` while choice is still null and combines fee plus loss into one revision/receipt; do not commit the choice separately first.

Backend owns command/receipt/time metadata, departure encounter identity/uint32 seed, optional full accepted-command schedule, private resolver continuation and atomic persistence/replay. Combat produces the terminal result from the accepted module. Economy verifies economic result invariants, including version/seed/scenario/player/cargo/floor/crew safety; those shape checks do not authenticate arbitrary browser JSON. Clients submit intentions, never outcome, seed, damage, balances, lost units or site ownership. Battle loss allocation is deterministic commodity-ID order and shares weighted-average BigInt basis arithmetic with trading.

Minimal state additions: hull/maxHull; mission enrollment and first-return consumed flag; pending journey/encounter identity/status; owned upgrade ID; relay status/acquisition method; cumulative operatingExpensePence, cargoWriteOffBasisPence and capitalSpendPence. Preserve existing fields and add migration defaults without resetting cash, cargo, markets, receipts or cumulative finances. Recovery-credit fields remain parked and absent.

Accounting without debt: existing purchases/sales/sold-basis/travel remain intact. `netCashFlow = sales - purchases - travel - operatingExpense - capitalSpend`; `realizedProfit = sales - salesCostBasis - travel - operatingExpense - cargoWriteOffBasis`. Repair, ransom, service charges and treaty payment are operating expenses. Cargo surrendered/donated is basis written off. Upgrade is capital spending, with its cost shown separately from operating profit. Arrival alone does not realize unsold inventory. Do not hide new expenses inside purchases or double-count travel.

Rejection and replay invariants:

- One company owner, current state/encounter revisions and an unexpired exact quote; no negative balances, stock, demand, cargo, basis, hull or unsafe totals. Metadata comes from Backend.
- All economic changes, receipt, journey arrival/replenishment, consumed encounter flag, battle result reference and progression state commit together. Rejection leaves all unchanged.
- Same company/command ID + same payload returns the original stored result; changed payload conflicts. Idempotency check precedes expired/stale-state checks. New command IDs cannot settle an already resolved encounter, upgrade or secured relay again.
- Persist seed and accepted command schedule before outcome sampling. Reload, retreat retries, playback speed and instant resolution cannot reroll. One reserved return gets one fee and one replenishment.
- Weighted-average removal uses BigInt intermediate `basis * removedQuantity / heldQuantity`, rounded down; final removed units consume the remainder. Sold basis and written-off basis have separate totals.
- Existing Earth company enrolls on its next return; existing Eden company can use its current real cargo and next paid return. Prior trading receipts never fabricate mission/encounter completion or rewards. Empty return passes once; resumed pending returns resume their original encounter.
- Upgrade prerequisite/reserve, repair affordability and relay resource consumption are server checks. Apply a concession once, never refund past trips or stack repeated claims.

## Implementation receipts and remaining acceptance

The original 4-6-hour/line-count sizing was a pre-implementation estimate, not a current delivery promise. Economy now has isolated source commits `560a1d9`, `3d5cb85` and `e4279db`; recovery-credit and tactical relay work are parked. No code or jobs accompany this documentation correction.

Matching evidence: `560a1d9` economy 28/28 VPS checks; `3d5cb85` expedition 17/17; `e4279db` expedition/settlement 26/26 at `/srv/dev-jobs/frontierdom-economy-expedition-24f02a52006e/result.json`, followed by a strengthened cross-commodity remainder fixture with settlement 9/9 at `/srv/dev-jobs/frontierdom-economy-expedition-73f7a4cde2b7/result.json`. Those adapter tests use the accepted terminal shape; they do not claim actual Backend transaction or rendered-combat acceptance. The accepted Combat standalone 18-test source receipt is separate and unchanged.

Focused implemented checks cover baseline/pay/drop, one prepaid arrival/replenishment, zero-cash drop/empty return, migration without reset, choice fees once, progress receipts, terminal invariants, no second loss, deterministic mixed-cargo allocation/penny remainder, tick-zero boarding in one receipt, below-floor noncombat/repair, strict upgradeId/capital accounting and agreement-only future discount. Backend still owns durable exact replay, concurrent commands and owner isolation.

Remaining delivery acceptance: Lead pairs the actual Combat module with Backend transactions and UI/World; Auditor reviews changed authority and actual player-flow evidence before Deploy. An actual persistent expedition must show the voyage, choice, damage/costs, upgrade and agreement foothold. Browser, physical phone, balance/fun and publication evidence remain distinct from these arithmetic/source receipts.
