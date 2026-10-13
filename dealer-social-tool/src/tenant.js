// Every request and background job runs "inside" one dealership. Services read the
// current dealership from here so data can never leak between customers.
import { AsyncLocalStorage } from 'node:async_hooks';

const store = new AsyncLocalStorage();

export function runWithTenant(dealershipId, fn) {
  return store.run({ dealershipId: Number(dealershipId) }, fn);
}

export function tenantId() {
  const ctx = store.getStore();
  if (!ctx?.dealershipId) throw Object.assign(new Error('No dealership selected'), { status: 400 });
  return ctx.dealershipId;
}

export function hasTenant() {
  return !!store.getStore()?.dealershipId;
}

/** Scripts and tests: make every following call in this async context use `dealershipId`. */
export function enterTenant(dealershipId) {
  store.enterWith({ dealershipId: Number(dealershipId) });
}
