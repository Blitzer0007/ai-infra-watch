/**
 * Offline, independent-receipt audit. No network, storage, secret, or trading side effects.
 * Receipts are externally signed; trust anchors must be independently reviewed and
 * explicitly supplied by the operator (never inferred from archive/receipt payloads).
 * This review records only receipt consistency, NOT historical-accuracy eligibility.
 */
import { createPublicKey, verify, createHash } from 'node:crypto';

const REQUIRED = Object.freeze([
  'source-publication', 'adjusted-outcome', 'universe-membership', 'prospective-holdout',
]);
const STRICT_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const sha256 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const utc = value => {
  if (typeof value !== 'string' || !STRICT_UTC.test(value)) return null;
  const ms = Date.parse(value);
  // Date.parse may normalize impossible dates (e.g. February 30).
  // Compare to the strictly formatted input rather than to a second parse.
  const normalized = value.replace(/(?:\.(\d{1,3}))?Z$/, (_match, fraction) =>
    '.' + (fraction ?? '').padEnd(3, '0') + 'Z');
  return Number.isFinite(ms) && new Date(ms).toISOString() === normalized ? ms : null;
};
const plain = value => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);
const fieldsExactly = (value, names) =>
  plain(value) && Object.keys(value).length === names.length &&
  names.every(name => Object.hasOwn(value, name));

/**
 * Signed payload schema v1:
 * { version, kind, decisionAt, observedAt, artifactSha256, publisherId, statement }
 * - statement is a controlled enum, not a raw provenance assertion in free text.
 * - canonical JSON property order is part of v1 to prevent signature ambiguities.
 */
const MESSAGE_FIELDS = ['version', 'kind', 'decisionAt', 'observedAt',
  'artifactSha256', 'publisherId', 'statement'];
const STATEMENTS = Object.freeze({
  'source-publication': 'source-published',
  'adjusted-outcome': 'corporate-actions-reconciled',
  'universe-membership': 'membership-at-decision',
  'prospective-holdout': 'holdout-committed-before-decision',
});
const canonical = value => JSON.stringify(Object.fromEntries(
  MESSAGE_FIELDS.map(k => [k, value[k]])
));

function validateReceipt(entry, anchors, decisionAt, nowMs) {
  if (!fieldsExactly(entry, ['payload', 'keyId', 'signature'])) return false;
  const { payload, keyId, signature } = entry;
  if (!fieldsExactly(payload, MESSAGE_FIELDS) || payload.version !== 'evidence-receipt-v1' ||
      !Object.hasOwn(STATEMENTS, payload.kind) || payload.statement !== STATEMENTS[payload.kind] ||
      !sha256(payload.artifactSha256) || typeof payload.publisherId !== 'string' ||
      !/^[a-z0-9][a-z0-9_.-]{1,63}$/.test(payload.publisherId) ||
      typeof keyId !== 'string' || !/^[A-Za-z0-9_.-]{2,64}$/.test(keyId) ||
      typeof signature !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(signature)) return false;

  const decided = utc(payload.decisionAt), observed = utc(payload.observedAt);
  if (decided === null || observed === null || decided !== decisionAt || observed > nowMs) return false;
  // Outcome observations happen at or after the decision. Publication, membership,
  // and holdout commitments must demonstrably predate it (strictly).
  if (payload.kind === 'adjusted-outcome' ? observed < decided : observed >= decided) return false;

  // A configured trust key must be explicitly scoped to a single kind and publisher,
  // preventing a publisher-signed source receipt from proving outcome/holdout.
  const anchor = anchors[keyId];
  if (!fieldsExactly(anchor, ['publicKeyPem', 'publisherId', 'kind']) ||
      anchor.kind !== payload.kind || anchor.publisherId !== payload.publisherId ||
      typeof anchor.publicKeyPem !== 'string' || !anchor.publicKeyPem) return false;
  try {
    const key = createPublicKey(anchor.publicKeyPem);
    if (key.asymmetricKeyType !== 'ed25519') return false;
    const sig = Buffer.from(signature, 'base64');
    if (sig.length !== 64 || sig.toString('base64') !== signature) return false;
    return verify(null, Buffer.from(canonical(payload), 'utf8'), key, sig);
  } catch { return false; }
}

/**
 * @param {object} input - Operator-provided detached receipts and controlled trust keys.
 * Signatures are checked only with separate operator-supplied trust anchors.
 * @returns {object} Aggregate fail-closed gate; no secret keys, paths, hashes or symbols.
 */
export function auditIndependentReceipts(input) {
  const empty = {
    version: 'independent-receipt-audit-v1',
    state: 'blocked',
    receiptCount: 0,
    verifiedTypes: [],
    invalidCount: 0,
    missingTypes: [...REQUIRED],
    historicalAccuracyEligible: false,
    investmentDecisionEligible: false,
    note: 'Detached signature checks do not establish complete independent data audit, unbiased holdout, investment accuracy or permission to trade.',
  };
  if (!plain(input) || !plain(input.trustAnchors) ||
      !Array.isArray(input.receipts) || input.receipts.length > 16 ||
      input.receipts.length === 0 || utc(input.decisionAt) === null) return empty;
  const nowMs = input.now === undefined ? Date.now() : utc(input.now);
  if (nowMs === null || nowMs < utc(input.decisionAt)) return empty;
  const accepted = new Set();
  let invalidCount = 0;
  for (const receipt of input.receipts) {
    const type = receipt?.payload?.kind;
    if (!validateReceipt(receipt, input.trustAnchors, utc(input.decisionAt), nowMs) ||
        accepted.has(type)) {
      invalidCount++;
      continue;
    }
    accepted.add(type);
  }
  return {
    ...empty,
    state: invalidCount ? 'invalid-or-conflicting-receipts' :
      accepted.size === REQUIRED.length ? 'signatures-and-timing-observed' : 'incomplete-receipts',
    receiptCount: input.receipts.length,
    verifiedTypes: REQUIRED.filter(type => accepted.has(type)),
    missingTypes: REQUIRED.filter(type => !accepted.has(type)),
    invalidCount,
  };
}
