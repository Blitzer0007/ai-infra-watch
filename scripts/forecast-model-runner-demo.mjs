// Fixed Cloud-only fictional replay; no external paths, credentials or providers.
import {fictionalModelRunInput} from './fixtures/forecast-model-runner.fictional.mjs';
import {generateForecastRun,evaluateGeneratedForecastRun} from '../server/utils/forecastModelRunner.js';
if(process.argv.length!==2){process.stderr.write('This fictional runner accepts no arguments.\n');process.exit(2);}
// Reviewed literal, separate from the returned artifact's self-reported digest.
const SELECTED_RUN_SHA256='6d7633f99ed9bd01dcf11f357fe4f715dc36504cefee7e71dfab4ec0cc691712';
const input=fictionalModelRunInput(),generated=generateForecastRun(input);
const result=evaluateGeneratedForecastRun({input,runBytes:generated.runBytes,expectedRunSha256:SELECTED_RUN_SHA256});
process.stdout.write(JSON.stringify({fictional:true,modelRole:'reference-baseline',result},null,2)+'\n');
if(result.status!=='reproduced-evaluation')process.exitCode=1;
