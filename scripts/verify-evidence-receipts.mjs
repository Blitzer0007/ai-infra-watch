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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 5 || process.argv[2] !== 'verify') {
    console.error('Usage: node scripts/verify-evidence-receipts.mjs verify <receipts.json> <approved-trust-anchors.json>');
    process.exitCode=2;
  } else {
    verifyReceiptFiles(process.argv[3],process.argv[4])
      .then(result=>{
        console.log(JSON.stringify(result));
        // Success means the detached receipts passed structural/signature checks
        // only; historicalAccuracyEligible deliberately remains false.
        if (result.state!=='signatures-and-timing-observed') process.exitCode=1;
      })
      .catch(()=>{
        console.error('Receipt verification failed: malformed, inaccessible or untrusted evidence.');
        process.exitCode=1;
      });
  }
}
