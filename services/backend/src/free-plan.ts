/** Reviewed 2026-11-16; decimal provider units. Most quotas are shared by an organization. */
export const FREE_QUOTAS = Object.freeze({
  databaseBytes: 500_000_000, uncachedEgressBytes: 5_000_000_000, cachedEgressBytes: 5_000_000_000,
  storageBytes: 1_000_000_000, monthlyActiveUsers: 50_000, edgeInvocations: 500_000,
  realtimeMessages: 2_000_000, peakRealtimeConnections: 200, realtimeMessagesPerSecond: 100, channelJoinsPerSecond: 100,
});
export const OPERATION_LIMITS = Object.freeze({ jsonBytes: 8192, pageRows: 50, notificationBatch: 20, maxRetries: 3, usageFreshnessMs: 900_000 });
/** Unchanged HOT working-set limits; immutable history is retained separately. */
export const APP_FINANCE_CAPACITY = Object.freeze({ visibleEventsPerChild: 128, hiddenEventsPerChild: 32, occurrences: 100, goals: 32, savingsRules: 8, payouts: 32, paymentsPerPayout: 32 });
/** Physical local TEMP table/index footprint; not hosted capacity or an approved retention policy. */
export const FINANCE_STORAGE_MEASUREMENT = Object.freeze({
  report: 'spec/production/staging/finance-checkpoints/local-postgres-storage-20261117001203359-52a9a7b2.json',
  sha256: 'bd8ab482d906cd9ef67efe92daa84f21b039982c9ea7e62eea0275e0db6c60e0',
  weeks: 52, events: 1307, bytesIncludingIndexes: 6_397_952,
  scope: 'LOCAL synthetic PostgreSQL JSONB/TOAST/indexes; no hosted proof',
});
/** Owner-approved planning targets only. No hosted enrollment/retention enforcement is implied. */
export const PILOT_SCOPE_REQUIREMENTS = Object.freeze({
  intendedFamilies: 3, historyWindowMonths: 12, financeForecastDays: 365,
  enrollmentCapEnforced: false, automaticFinancialDeletionApproved: false,
  scope: 'owner-accepted pilot target; external legal/privacy and hosted release gates remain closed',
});
export const DEFAULT_CAPACITY_ASSUMPTIONS = Object.freeze({
  accountsPerFamily: 4, daysPerMonth: 30, messagesPerFamilyDay: 10, messageHistoryDays: 30, storedMessageBytes: 4096,
  financeCommandsPerFamilyDay: 8, financeGrowthDays: 365, storedFinanceCommandBytes: 5000,
  childrenPerFamily: 2, financeHiddenCommandFraction: 0.1, financeEventsPerCommand: 1,
  identityConsentBytesPerFamily: 65_536, checkinsPerFamilyDay: 2, checkinHistoryDays: 30, storedCheckinBytes: 512,
  notificationsPerFamilyDay: 12, notificationHistoryDays: 30, storedNotificationBytes: 512,
  casesPerFamilyMonth: 0.1, caseHistoryMonths: 6, storedCaseBytes: 8192, indexAndOverheadMultiplier: 1.5,
  fixedDatabaseBytes: 40_000_000, requestsPerAccountDay: 40, retryMultiplier: 1.1,
  egressBytesPerAccountDay: 100_000, fullExportsPerMonth: 4, logicalExportToDatabaseRatio: 1,
  activeAccountFraction: 0.1, socketsPerActiveAccount: 1.25, meteredHintsPerMutation: 3,
});
export type CapacityAssumptions = { [K in keyof typeof DEFAULT_CAPACITY_ASSUMPTIONS]: number };
type Metric = keyof typeof FREE_QUOTAS;
type Band = 'normal' | 'warning' | 'restricted' | 'unavailable';
const keys = Object.keys(FREE_QUOTAS) as Metric[];
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: Record<string, unknown>, fields: readonly string[]) => Object.keys(v).length === fields.length && Object.keys(v).every(k => fields.includes(k));
const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= Number.MAX_SAFE_INTEGER;
const band = (ratio: number): Band => ratio >= 0.9 ? 'unavailable' : ratio >= 0.7 ? 'restricted' : ratio >= 0.5 ? 'warning' : 'normal';

/** Estimates only. Finance growth is a forecast horizon, never permission to erase ledger history. */
export function estimateCapacity(families: number, overrides: Partial<CapacityAssumptions> = {}) {
  if (!Number.isSafeInteger(families) || families < 1 || families > 1_000_000 || !object(overrides)
    || Object.keys(overrides).some(k => !Object.hasOwn(DEFAULT_CAPACITY_ASSUMPTIONS, k))) throw new Error('Invalid capacity assumptions.');
  const a: CapacityAssumptions = { ...DEFAULT_CAPACITY_ASSUMPTIONS, ...overrides };
  if (Object.values(a).some(v => !number(v) || v > 1_000_000_000) || a.accountsPerFamily < 1 || a.daysPerMonth < 1
    || a.indexAndOverheadMultiplier < 1 || a.retryMultiplier < 1 || a.activeAccountFraction > 1 || a.logicalExportToDatabaseRatio < 1
    || a.childrenPerFamily < 1 || a.childrenPerFamily > a.accountsPerFamily || a.financeHiddenCommandFraction > 1 || a.financeEventsPerCommand < 1) throw new Error('Invalid capacity assumptions.');
  const databaseComponents = {
    identityConsentBytes: families * a.identityConsentBytesPerFamily,
    messageBytes: families * a.messagesPerFamilyDay * a.messageHistoryDays * a.storedMessageBytes,
    financeBytes: families * a.financeCommandsPerFamilyDay * a.financeGrowthDays * a.storedFinanceCommandBytes,
    checkinBytes: families * a.checkinsPerFamilyDay * a.checkinHistoryDays * a.storedCheckinBytes,
    notificationBytes: families * a.notificationsPerFamilyDay * a.notificationHistoryDays * a.storedNotificationBytes,
    caseBytes: families * a.casesPerFamilyMonth * a.caseHistoryMonths * a.storedCaseBytes,
  };
  const databaseBytes = Math.ceil(a.fixedDatabaseBytes + Object.values(databaseComponents).reduce((sum, n) => sum + n, 0) * a.indexAndOverheadMultiplier);
  const backupEgressBytes = Math.ceil(databaseBytes * a.logicalExportToDatabaseRatio * a.fullExportsPerMonth);
  const writesPerDay = families * (a.messagesPerFamilyDay + a.financeCommandsPerFamilyDay + a.checkinsPerFamilyDay + a.notificationsPerFamilyDay);
  const estimates = {
    databaseBytes, uncachedEgressBytes: Math.ceil(families * a.accountsPerFamily * a.egressBytesPerAccountDay * a.daysPerMonth * a.retryMultiplier + backupEgressBytes),
    cachedEgressBytes: 0, storageBytes: 0, monthlyActiveUsers: Math.ceil(families * a.accountsPerFamily),
    edgeInvocations: Math.ceil(families * a.accountsPerFamily * a.requestsPerAccountDay * a.daysPerMonth * a.retryMultiplier),
    realtimeMessages: Math.ceil(families * (a.messagesPerFamilyDay + a.financeCommandsPerFamilyDay + a.checkinsPerFamilyDay) * a.daysPerMonth * a.meteredHintsPerMutation * a.retryMultiplier),
    peakRealtimeConnections: Math.ceil(families * a.accountsPerFamily * a.activeAccountFraction * a.socketsPerActiveAccount),
  };
  if ([...Object.values(estimates), backupEgressBytes, writesPerDay].some(v => !number(v))) throw new Error('Capacity estimate exceeds numeric bounds.');
  const perChildEvents = a.financeCommandsPerFamilyDay * a.financeEventsPerCommand / a.childrenPerFamily;
  const daysUntilVisibleCapacity = perChildEvents * (1 - a.financeHiddenCommandFraction) > 0
    ? APP_FINANCE_CAPACITY.visibleEventsPerChild / (perChildEvents * (1 - a.financeHiddenCommandFraction)) : null;
  const daysUntilHiddenCapacity = perChildEvents * a.financeHiddenCommandFraction > 0
    ? APP_FINANCE_CAPACITY.hiddenEventsPerChild / (perChildEvents * a.financeHiddenCommandFraction) : null;
  return { kind: 'estimate' as const, families, assumptions: a, financeStorageMeasurement: FINANCE_STORAGE_MEASUREMENT, databaseComponents, backupEgressBytes, writesPerDay,
    applicationCapacity: { limits: APP_FINANCE_CAPACITY, historyMode: 'validated_checkpoint_archive' as const,
      hotTailRolloverDays: { visible: daysUntilVisibleCapacity, hidden: daysUntilHiddenCapacity },
      outstandingWorkCapacityProven: false, hostedRuntimeCapacityProven: false,
      settledHistoryRetained: true, actualEventsPerCommandMeasured: false, automaticDeletion: false },
    averageWritesPerSecond: writesPerDay / 86_400, estimates,
    limits: Object.entries(estimates).map(([name, used]) => ({ name, used, quota: FREE_QUOTAS[name as Metric], ratio: used / FREE_QUOTAS[name as Metric], band: band(used / FREE_QUOTAS[name as Metric]) })),
    burstCapacityProven: false, hostingCapacityProven: false };
}

/** Operator-only aggregate evaluation; no telemetry collection, persistence, RPC enforcement or client output. */
export function assessUsage(snapshot: unknown, nowMs: number) {
  const unavailable = (reason: 'invalid_input' | 'stale_input' | 'provider_unavailable') => ({
    state: 'unavailable' as Band, reason, allowMutations: false, allowBackgroundWork: false, allowNewFamilies: false,
    metrics: [] as { name: Metric; used: number; quota: number; ratio: number; band: Band }[],
  });
  if (!number(nowMs) || !object(snapshot) || !exact(snapshot, ['plan', 'projectAvailable', 'collectedAtMs', 'metrics'])
    || snapshot.plan !== 'free' || typeof snapshot.projectAvailable !== 'boolean' || !number(snapshot.collectedAtMs)
    || !object(snapshot.metrics) || !exact(snapshot.metrics, keys) || Object.values(snapshot.metrics).some(v => !number(v))) return unavailable('invalid_input');
  if (snapshot.collectedAtMs > nowMs || nowMs - snapshot.collectedAtMs > OPERATION_LIMITS.usageFreshnessMs) return unavailable('stale_input');
  if (!snapshot.projectAvailable) return unavailable('provider_unavailable');
  const metrics = keys.map(name => { const used = snapshot.metrics && (snapshot.metrics as Record<Metric, number>)[name];
    const ratio = Number(used) / FREE_QUOTAS[name]; return { name, used: Number(used), quota: FREE_QUOTAS[name], ratio, band: band(ratio) }; });
  const states: Band[] = ['normal', 'warning', 'restricted', 'unavailable'];
  const state = states[Math.max(...metrics.map(m => states.indexOf(m.band)))];
  return { state, reason: 'evaluated' as const, allowMutations: state !== 'unavailable',
    allowBackgroundWork: state === 'normal' || state === 'warning', allowNewFamilies: state === 'normal' || state === 'warning', metrics };
}
