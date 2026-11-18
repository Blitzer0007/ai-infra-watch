/**
 * Explicit offline verification of operator-provided evidence receipts.
 * No network, environment tokens, database access or remote writes.
 * Never print input filenames, hashes, sources, public keys or raw receipts.
 * Intended for separately approved, isolated CI with genuine independently
 * reviewed trust anchors; it is NOT triggered by normal PR workflows.
 */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { auditIndependentReceipts } from '../src/utils/independentReceiptAudit.js';
import { auditArtifactFiles } from '../src/utils/offlineArtifactIntegrity.js';

export async function verifyReceiptFiles(receiptsPath, anchorsPath, read = readFile) {
  if (typeof receiptsPath !== 'string' || !receiptsPath ||
      typeof anchorsPath !== 'string' || !anchorsPath) throw Error('Receipt and anchor files are required');
  const [receiptRaw, anchorRaw] = await Promise.all([read(receiptsPath,'utf8'),read(anchorsPath,'utf8')]);
  const manifest=JSON.parse(String(receiptRaw));
  const anchors=JSON.parse(String(anchorRaw));
  // Never trust anchors embedded in the same receipt file. Trust keys come
  // exclusively from a separately maintained operator-reviewed file.
  const result=auditIndependentReceipts({
    decisionAt: manifest?.decisionAt,
    receipts: manifest?.receipts,
    trustAnchors: anchors,
  });
  return result;
}

/** Verify detached signed receipts AND four independently supplied local artifacts.
 * The artifact manifest is a separate map of evidence kind -> existing local file.
 * Neither bundle may provide the approved trust anchors.
 */
export async function verifyReceiptArtifacts(receiptsPath, anchorsPath, artifactMapPath, read = readFile) {
  if (![receiptsPath,anchorsPath,artifactMapPath].every(p => typeof p === 'string' && p))
    throw Error('Separate receipt, trust anchor and artifact mapping files are required');
  const [rawReceipts,rawAnchors,rawFiles] = await Promise.all([
    read(receiptsPath,'utf8'),read(anchorsPath,'utf8'),read(artifactMapPath,'utf8'),
  ]);
  const manifest=JSON.parse(String(rawReceipts));
  return auditArtifactFiles({
    decisionAt:manifest?.decisionAt,
    receipts:manifest?.receipts,
    trustAnchors:JSON.parse(String(rawAnchors)),
    files:JSON.parse(String(rawFiles)),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode=process.argv[2];
  if (!((mode==='verify' && process.argv.length===5) ||
    (mode==='verify-artifacts' && process.argv.length===6))) {
    console.error('Usage: node scripts/verify-evidence-receipts.mjs verify-artifacts <receipts.json> <approved-trust-anchors.json> <artifact-map.json>');
    process.exitCode=2;
  } else {
    const action=mode==='verify'
      ? verifyReceiptFiles(process.argv[3],process.argv[4])
      : verifyReceiptArtifacts(process.argv[3],process.argv[4],process.argv[5]);
    action.then(result=>{
      console.log(JSON.stringify(result));
      if ((mode==='verify' && result.state!=='signatures-and-timing-observed') ||
          (mode==='verify-artifacts' && result.state!=='signed-digests-observed'))
        process.exitCode=1;
    }).catch(()=>{
      console.error('Offline evidence verification failed; inspect independently supplied files and trust policy.');
      process.exitCode=1;
    });
  }
}
