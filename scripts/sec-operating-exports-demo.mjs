// Fixed invented native exports only. No external paths, acquisition or credentials.
import {readFileSync} from 'node:fs';
import {reviewRetainedSecOperatingExports} from '../server/services/secRetainedExports.js';
if(process.argv.length!==2){process.stderr.write('This fictional operating export demo accepts no arguments or external paths.\n');process.exit(2);}
// Kept outside the manifest: this reader cannot repin changed native bytes.
const PIN='00cd03b5dc35becea1629cea47b4ff798e879b66db7a84198f74c13046865f5d';
const root=new URL('./fixtures/sec-operating.fictional/',import.meta.url);
const result=reviewRetainedSecOperatingExports({request:{symbol:'FICT',expectedCik:'0000000001',expectedExchange:'Nasdaq',assessedAt:'2026-11-14T12:00:00Z',periods:[{start:'2025-01-01',end:'2025-12-31'},{start:'2024-01-01',end:'2024-12-31'}]},manifestBytes:readFileSync(new URL('manifest.json',root)),expectedManifestSha256:PIN,artifacts:new Map([['listings',readFileSync(new URL('../sec-exports.fictional/listings.json',root))],['companyfacts',readFileSync(new URL('companyfacts.json',root))]])});
process.stdout.write(JSON.stringify({fictional:true,mode:'offline-only',notice:'Invented annual declarations only. Revenue alternatives and context-unverified expense/adjustment tags are not combined; EBITDA, growth, financial completeness, source/issuer truth and valuation authority remain unsupported.',result},null,2)+'\n');
if(result.status!=='conditional'||result.snapshots.flatMap(s=>s.observations).length!==14)process.exitCode=1;
