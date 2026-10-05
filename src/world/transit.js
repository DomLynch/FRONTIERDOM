/** Cosmetic crossing follows a confirmed location change; snapshots are never modified. */
export function createTransit() {
  let location = null;
  let company = null;
  let seconds = 0;
  return {
    accept(next, reducedMotion = false, companyId = null) {
      if (next !== 'earth' && next !== 'eden') throw new RangeError('Expected earth or eden locationId');
      const sameCompany = company === companyId;
      const changed = sameCompany && location !== null && next !== location;
      company = companyId;
      location = next;
      if (!sameCompany) seconds = 0;
      else if (changed) seconds = reducedMotion ? 0 : 1.6;
      else if (reducedMotion) seconds = 0;
      return changed;
    },
    advance(dt) { seconds = Math.max(0, seconds - dt); return seconds / 1.6; },
    cancel() { seconds = 0; },
    get active() { return seconds > 0; }
  };
}
