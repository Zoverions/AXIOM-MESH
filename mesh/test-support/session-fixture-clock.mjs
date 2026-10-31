const SESSION_FIXTURE_LIFETIME_MS = 24 * 60 * 60 * 1_000;

export function sessionFixtureExpiry(referenceTime) {
  if (!(referenceTime instanceof Date) || Number.isNaN(referenceTime.getTime())) {
    throw new TypeError('referenceTime must be a valid Date');
  }

  return new Date(referenceTime.getTime() + SESSION_FIXTURE_LIFETIME_MS).toISOString();
}
