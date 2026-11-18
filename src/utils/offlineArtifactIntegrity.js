/**
 * Offline artifact-integrity review for independently signed receipt bundles.
 *
 * The manifest is a separate, operator-provided map of four distinct local files.
 * We hash bytes, never filenames or archive-stored SHA strings. This establishes
 * only the supplied bytes' agreement with signed claims, not publisher identity,
 * their actual historical availability, or forecast accuracy.
 *
 * This is deliberately NOT wired to background jobs, APIs or production storage.
 */
import { createHash } from 'node:crypto';
import { open, lstat, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { auditIndependentReceipts } from './independentReceiptAudit.js';

const KINDS = Object.freeze([
  'source-publication', 'adjusted-outcome', 'universe-membership', 'prospective-holdout',
]);
const FILE_LIMIT = 32 * 1024 * 1024;
const fileMapValid = value => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype &&
  Object.keys(value).length === KINDS.length &&
  KINDS.every(kind => Object.hasOwn(value,kind) &&
    typeof value[kind] === 'string' && value[kind].length > 0);
const blocked = (state, details = {}) => ({
  version:'offline-artifact-integrity-v1',state,
  filesVerified:0,verifiedKinds:[],...details,
  historicalAccuracyEligible:false,investmentDecisionEligible:false,
  note:'Matching signed hashes verifies supplied bytes, not publication time, independent publisher identity, adjusted outcome correctness, point-in-time membership, or a clean prospective holdout.',
});

async function digestFile(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > FILE_LIMIT)
    throw Error('Invalid or oversized evidence artifact');
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size !== info.size || stat.size > FILE_LIMIT) throw Error('Artifact changed during open');
    const hasher = createHash('sha256');
    const buffer = Buffer.allocUnsafe(65536);
    let offset = 0;
    while (offset < stat.size) {
      const { bytesRead } = await file.read(buffer, 0, Math.min(buffer.length,stat.size-offset),offset);
      if (bytesRead <= 0) throw Error('Artifact truncated during read');
      hasher.update(buffer.subarray(0,bytesRead));
      offset += bytesRead;
    }
    const after = await file.stat();
    if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ino !== stat.ino)
      throw Error('Artifact changed during read');
    return hasher.digest('hex');
  } finally { await file.close(); }
}

export async function auditArtifactFiles({ decisionAt, receipts, trustAnchors, files, now } = {}) {
  const signatureReview = auditIndependentReceipts({decisionAt,receipts,trustAnchors,now});
  if (signatureReview.state !== 'signatures-and-timing-observed')
    return blocked('receipt-verification-blocked',{receiptState:signatureReview.state});
  if (!fileMapValid(files)) return blocked('artifact-manifest-incomplete');
  if (!Array.isArray(receipts) || receipts.length !== KINDS.length)
    return blocked('receipt-verification-blocked');
  // Different evidence types need different physical source artifacts; a single
  // copied file cannot serve as independent source, outcome and holdout evidence.
  const paths = new Set();
  for (const kind of KINDS) {
    try {
      const resolved = await realpath(files[kind]);
      if (paths.has(resolved)) return blocked('artifact-path-reused');
      paths.add(resolved);
    } catch { return blocked('artifact-unavailable'); }
  }
  const verifiedKinds = [];
  for (const kind of KINDS) {
    const receipt = receipts.find(value => value?.payload?.kind === kind);
    try {
      const actual = await digestFile(files[kind]);
      if (!receipt || actual !== receipt.payload.artifactSha256)
        return blocked('digest-mismatch',{filesVerified:verifiedKinds.length,verifiedKinds});
    } catch {
      return blocked('artifact-unavailable',{filesVerified:verifiedKinds.length,verifiedKinds});
    }
    verifiedKinds.push(kind);
  }
  return blocked('signed-digests-observed',{filesVerified:verifiedKinds.length,verifiedKinds});
}
