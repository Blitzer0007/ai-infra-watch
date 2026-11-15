// Fixed invented exports only; no arguments, external paths, acquisition or credentials.
import {readFileSync} from 'node:fs';
import {reviewRetainedSecExports} from '../server/services/secRetainedExports.js';
if(process.argv.length!==2){process.stderr.write('This fictional SEC export demo accepts no arguments or external paths.\n');process.exit(2);}
// Reviewed outside the manifest; this reader cannot repin modified artifacts.
const PIN='823645db0cb3ba28215f00e1462be0bc8d027727376d1840f957709f9c7b2710';
const root=new URL('./fixtures/sec-exports.fictional/',import.meta.url);
const result=reviewRetainedSecExports({request:{symbol:'FICT',expectedCik:'0000000001',expectedExchange:'Nasdaq',assessedAt:'2026-11-14T12:00:00Z',periods:[{start:null,end:'2025-12-31'},{start:'2025-01-01',end:'2025-12-31'},{start:null,end:'2026-02-10'}]},manifestBytes:readFileSync(new URL('manifest.json',root)),expectedManifestSha256:PIN,artifacts:new Map(['listings','companyfacts'].map(role=>[role,readFileSync(new URL(role+'.json',root))]))});
process.stdout.write(JSON.stringify({fictional:true,mode:'offline-only',notice:'Invented inputs. Integrity and supplied-listing consistency only; publisher, issuer identity, historical availability and financial completeness remain unverified.',result},null,2)+'\n');
if(result.status!=='conditional'||result.snapshots.flatMap(s=>s.observations).length!==10)process.exitCode=1;
