/**
 * Central feature switches.
 * Trials: the ability exists but is OFF at launch (owner decision). Flip this ONE flag, and add a server-side
 * "start trial" action, to turn it on later. Entitlement resolution already understands `trial`.
 */
export const TRIAL_OFFERS_ENABLED = false;
export function canStartTrial(): boolean { return TRIAL_OFFERS_ENABLED; }
