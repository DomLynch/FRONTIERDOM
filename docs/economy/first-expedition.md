# First expedition: bounded risk and a first foothold

Proposal for Lead acceptance, 5 October 2026. Base: live `77948cca638e45bfedf3163281b58c477873e8e3`. Economy owns this sizing artifact only; no trading kernel, shared contract, Backend or UI change is included. Direction: `docs/STRATEGY_NEXT_MVP.md` as read from the canonical checkout. Figures below are integer pence; GBP labels are presentation. Combat examples are target fixtures, not measured probabilities or secretly forced battle results.

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

| Choice | Exact proposed rule | Opening example |
| --- | --- | --- |
| Pay | Demand `ceil(total cargo acquisition basis / 5)` pence. Pay cash; preserve cargo and hull. Disabled if cash is insufficient; no borrowing for this choice. | 81680 (£816.80), all 20 Aurelia kept, no repairs. |
| Drop cargo | Select commodities; surrender exactly `ceil(total cargo units / 5)` units. Use actual held quantities. No cash debit or sale credit. Allocate surrendered basis with the existing weighted-average rule. | 4 Aurelia surrendered, 81680 basis written off; 16 remain with 326720 basis. |
| Run | Pay 6000 (£60) emergency-thrust service before the seeded escape attempt. Combat decides escape/damage. Successful escape loses no cargo; failed escape permits boarding for `ceil(total units / 4)` units. | Success target: 8 hull lost; failure target: 25 hull lost and 5 Aurelia lost. |
| Fight | Pay 12000 (£120) bounded ammunition/service charge before combat. Choose defensive/balanced/aggressive, protect cargo and a retreat threshold. Combat decides win/escape/boarding. A win or successful retreat keeps cargo; boarding takes `ceil(total units / 2)`. No pirate bounty or loot credit. | Win target: 12 hull lost; boarding-loss target: 60 hull lost and 10 Aurelia lost. |

Run/fight fees are the full economic resource charge for this encounter: do not bill the same ammunition again from playback events. Combat may track normalized ammo within its resolver. Economy must not calculate damage, retreat or escape independently. Target fixtures must be accepted against Combat's resolver; do not advertise numerical win/escape chances before measuring them.

Proposed introductory Combat configuration: initial hull 100; boarding/encounter termination at hull 25, no crew deaths or permanent ship destruction. Combat enforces this explicit scenario rule, not an Economy clamp applied secretly after a lethal outcome. Starting hull below 25 uses a noncombat encounter or skips combat until repaired. This is an authored nonlethal encounter, not guaranteed victory.

Repair at either station: 500 pence (£5) per missing hull point; full repair quotes exactly `(100 - hull) * 500`. Partial repairs buy whole points only. No negative hull, repair above maximum, automatic spend or wage clock. A damaged ship can complete this reserved return; tow assistance is included in its paid crossing. Repairs are optional; show condition affecting subsequent combat honestly.

## Worked result fixtures

Assume repairs chosen after arrival, then sell all surviving Aurelia into replenished Earth stock. No upgrade/relay spend is included yet.

| Outcome | Extra cash costs pence | Cargo lost / basis written off | Earth sale pence | End cash pence | Realized expedition profit pence |
| --- | ---: | --- | ---: | ---: | ---: |
| Pay | 81680 | 0 / 0 | 588600 | 2677670 | 177670 |
| Drop | 0 | 4 / 81680 | 472800 | 2643550 | 143550 |
| Run, escape, 8 damage | 6000 + 4000 repair | 0 / 0 | 588600 | 2749350 | 249350 |
| Run, boarded, 25 damage | 6000 + 12500 repair | 5 / 102100 | 443700 | 2595950 | 95950 |
| Fight, win, 12 damage | 12000 + 6000 repair | 0 / 0 | 588600 | 2741350 | 241350 |
| Fight, boarded, 60 damage | 12000 + 30000 repair | 10 / 204200 | 297300 | 2426050 | -73950 |

Earth sale quotes are not flat £300 multiplied by quantity: 10 units sell for 297300, 15 for 443700, 16 for 472800, 20 for 588600. Lost cargo receives no proceeds. Written-off acquisition basis is recognized as a loss exactly once; do not charge both that basis and a fictional resale valuation.

The boarded-fight fixture loses £739.50 relative to starting capital but leaves £24,260.50, a repaired ship and the same viable trade route. After this one encounter, an ordinary clean 20/20 trip adds £2,593.50, reaching £26,854.00. No free restart, cash reset or scripted payout is needed.

Cash-poor encounter: pay/run/fight require their actual cash costs; drop remains a zero-cash surrender option. Cash-poor empty-cargo pending return arrives without a demand. Travel was prepaid, so the introduction cannot strand its participant in transit.

Existing company already stranded at Eden with no cargo and less than 25000 cash is a concrete inherited gap, not an encounter loss. The first-expedition rules do not fix it by resetting the company, giving a fake sale or calling a free tow paid travel. Lead should either exclude that legacy state explicitly from this checkpoint or approve a separate recovery-credit action: return to Earth, charge a 35000-pence tow bill as cash/debt, and provide 125000-pence working capital as a loan, never revenue. Debt would equal unpaid tow plus the loan; show it plainly. Proposed repayment: at Earth only, 25% of positive newly realized profit, capped by outstanding debt and cash above a 60000-pence next-round-trip reserve. While debt remains, cargo purchases must retain the next journey reserve, and upgrades/relay spending are disabled. Only one outstanding recovery loan; no repeated credit stacking. This needs explicit financing receipts and migration fields; it is not part of the proposed core expedition delta. A tow alone leaves an empty zero-cash company unable to buy its next load, so do not present towing alone as complete recovery.

## One attainable upgrade

Cargo bracing: 150000 (£1,500), one purchase, capacity 40 -> 50. Available at Earth after first encounter settlement/pass; require 35000 remaining cash after purchase as a visible outbound reserve. No damage/weapon bonuses. It changes the next load decision immediately and does not invalidate already-held cargo.

Pay fixture leaves £26,776.70; buying bracing leaves £25,276.70, so the upgrade is covered by the £1,776.70 earned profit. Drop fixture's profit is £64.50 short of the upgrade price; let the player spend original capital deliberately or do another run. Do not label this an earned free reward. Failed fight should guide another trade, rather than claim its loss earned an upgrade.

## One relay and one benefit

Site `eden-relay-01`: contested -> secured, attached to this company's progression. Label "first foothold / relay operating rights", never ownership of Eden or shared planetary conquest.

Agreement path: at Eden after the first-return encounter, consume 2 owned Medicine and 30000 (£300) liaison/equipment payment. The envoy trades operating rights for medical aid and a limited extraction pledge; persist that choice as the site's recorded agreement, not a free-floating diplomacy system. At freshly replenished Earth, 2 Medicine cost 20060, so the direct contribution costs 50060 (£500.60) at acquisition basis, plus the actual travel needed to reach Eden. Different existing cargo uses its actual basis, not that fixture price.

Tactical path: reuse Combat's bounded relay-raider scenario. Actual combat/service/repair costs apply; only a verified victory secures the site, successful retreat leaves it contested. No agreement debit or donation on the tactical path; no extra payout. Combat sizes this second scenario, not Economy. The agreement path keeps the foothold achievable without a forced win.

Single benefit: secured relay reduces future Eden -> Earth route cost by 10000, from 25000 to 15000 (£250 -> £150). It discounts future departures only; the securing journey has no retroactive refund. Both acquisition paths yield the same non-stacking concession. Outbound stays 35000. A subsequent unchanged clean 20/20 trade earns 269350 (£2,693.50), not a fictitious reward. Treaty-only contribution breaks even after six discounted returns; extra travel/repair costs extend that break-even. Show the site changing visually when the server confirms it.

## Pure rule and trusted settlement proposal

Lead owns final API names/schema. Proposed intentions: `resolveEncounter(encounterId, choice, cargoSelection?, tactics?)`, `repair(points)`, `buyUpgrade('cargo-bracing')`, `secureRelay('agreement' | 'combat')`; optional `recoverHome` only if a complete recovery-credit extension is accepted. Quotes disclose debits, units/basis at risk, fees, repair rate, and attainable benefits from trusted snapshots.

Economy pure helpers proposed: `quoteExpeditionAction(state, action)` and `applyExpeditionSettlement(state, verifiedOutcome, metadata)` in one new `src/sim/economy/expedition.js`. Combat produces the trusted seeded outcome/events. Backend constructs/persists seed, locked encounter inputs, accepted simulation-time interventions and verified result; clients submit intention IDs, never damage/cash/cargo losses, victory or site ownership. Combat generates timestamps/ticks without using rendering clocks to determine outcomes.

Minimal state additions: hull/maxHull; mission enrollment and first-return consumed flag; pending journey/encounter identity/status; owned upgrade ID; relay status/acquisition method; cumulative operatingExpensePence, cargoWriteOffBasisPence and capitalSpendPence. Preserve existing fields and add migration defaults without resetting cash, cargo, markets, receipts or cumulative finances. Optional recovery adds outstandingDebtPence, protected journey reserves and explicit financing cash-flow fields.

Accounting without debt: existing purchases/sales/sold-basis/travel remain intact. `netCashFlow = sales - purchases - travel - operatingExpense - capitalSpend`; `realizedProfit = sales - salesCostBasis - travel - operatingExpense - cargoWriteOffBasis`. Repair, ransom, service charges and treaty payment are operating expenses. Cargo surrendered/donated is basis written off. Upgrade is capital spending, with its cost shown separately from operating profit. Arrival alone does not realize unsold inventory. Do not hide new expenses inside purchases or double-count travel.

Debt recovery, if accepted: recognize full tow expense once, cash debit equals amount paid, record remainder liability; loan proceeds increase cash and liability equally without being profit. Subsequent repayment is a cash/financing movement and reduces liability without recognizing the expense again. Lead must explicitly extend receipt/summary fields before implementation; the v1 cash-flow formula cannot honestly represent credit rescue unchanged.

Rejection and replay invariants:

- One company owner, current state/encounter revisions and an unexpired exact quote; no negative balances, stock, demand, cargo, basis, hull, debt or unsafe totals. Metadata comes from Backend.
- All economic changes, receipt, journey arrival/replenishment, consumed encounter flag, battle result reference and progression state commit together. Rejection leaves all unchanged.
- Same company/command ID + same payload returns the original stored result; changed payload conflicts. Idempotency check precedes expired/stale-state checks. New command IDs cannot settle an already resolved encounter, upgrade or secured relay again.
- Persist seed and accepted command schedule before outcome sampling. Reload, retreat retries, playback speed and instant resolution cannot reroll. One reserved return gets one fee and one replenishment.
- Weighted-average removal uses BigInt intermediate `basis * removedQuantity / heldQuantity`, rounded down; final removed units consume the remainder. Sold basis and written-off basis have separate totals.
- Existing Earth company enrolls on its next return; existing Eden company can use its current real cargo and next paid return. Prior trading receipts never fabricate mission/encounter completion or rewards. Empty return passes once; resumed pending returns resume their original encounter.
- Upgrade prerequisite/reserve, repair affordability and relay resource consumption are server checks. Apply a concession once, never refund past trips or stack repeated claims.

## Sized next delta and acceptance

Sizing assumption: shared contract settled and Combat emits a usable seeded outcome. Economy implementation: one new expedition module, narrow existing-kernel hooks for 40/50 capacity, future return discount and deferred arrival/replenishment, plus focused fixture tests: approximately 250-400 logic lines and 180-260 test lines, 4-6 focused engineering hours including VPS verification and one review repair pass. Universal recovery credit adds approximately 100-160 logic lines, 6-8 recovery tests and 2-3 hours; defer it only with the explicit existing-save limitation above. These are estimates, not delivery promises.

Dependencies: Lead approves shared action/accounting/migration shape; Combat approves nonlethal configuration and fixture outcomes; Backend owns transactions/seed/result persistence; UI/World make the voyage, choice, damage, upgrade and relay status visible. No Economy delivery estimate includes their integration, art, device acceptance or deployment.

Focused acceptance: reproduce baseline and all six monetary fixtures; partial cargo removal/remainder; no-cash drop; empty return; resumed/migrated company; duplicate settlement and reload; rejected action unchanged; paid arrival/replenishment once; upgrade only once; relay agreement and verified combat acquisition same single discount; quoted new-route profits include real fees. Run substantial verification on the VPS after implementation. Final release acceptance is an actual persistent expedition in the client, not this arithmetic artifact.
