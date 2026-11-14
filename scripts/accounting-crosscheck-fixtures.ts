/** Stdout contains minimized fictional packets only. No environment/config imports. */
import {cases} from './fixtures/accounting-crosscheck.fictional';
import {buildAccountingCrosscheckPacket} from '../src/utils/reviewedPortfolioAccounting';
process.stdout.write(JSON.stringify(cases.map(test=>({name:test.name,packet:buildAccountingCrosscheckPacket(test.input)}))));
