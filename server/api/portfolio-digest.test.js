import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// A fresh process receives fictional credentials only. Every fetch is intercepted;
// unknown URLs/methods throw, so no database, provider or Telegram service is used.
function exercise(method, decisionAvailable = true) {
  const script = `
    import assert from 'node:assert/strict';
    const calls=[]; let telegramPayload=null;
    globalThis.fetch=async (input, options={})=>{
      const url=String(input); const method=options.method||'GET'; calls.push({url,method});
      if(url.startsWith('https://digest-fixture.invalid/rest/v1/') && method==='GET') return new Response('[]');
      if(url==='https://ai-infra-watch-theta.vercel.app/api/market?route=decision-center' && method==='GET') {
        return new Response(JSON.stringify(${decisionAvailable} ? {
          ok:true, checkedAt:'2026-11-08T10:00:00Z', actionItems:[{symbol:'NVDA',severity:'ACT',title:'Rule reached',detail:'Fictional rule evidence.'}],
          actionSummary:{version:1,total:1,act:1,watch:0,shown:1,omitted:0},
          portfolio:{holdings:1,accountingStatus:'complete',quoteCoverage:{status:'complete'}}, rules:{total:1,noRule:0}, earningsStatus:'ok',earnings:[]
        } : {ok:false}),{status:${decisionAvailable ? 200 : 503}});
      }
      if(url==='https://api.telegram.org/botfictional-test-bot/sendMessage' && method==='POST') {
        telegramPayload=JSON.parse(options.body);
        return new Response(JSON.stringify({ok:true,result:{message_id:42}}));
      }
      throw new Error('Unexpected fixture transport: '+method+' '+url);
    };
    const {default:handler}=await import('./server/api/portfolio-digest.js');
    let status=200,body; const res={setHeader(){},status(code){status=code;return this;},json(value){body=value;return this;}};
    await handler({method:${JSON.stringify(method)},headers:{authorization:'Bearer fixture-access'},query:{},body:{channels:'telegram'}},res);
    assert.equal(status,200,JSON.stringify(body));
    assert.ok(body.telegramBrief.text.length<=3600);
    assert.equal(calls.filter(item=>item.method!=='GET').length,${method === 'GET' ? 0 : 1});
    ${method === 'GET' ? `assert.equal(body.delivery.previewOnly,true); assert.equal(telegramPayload,null);` : `
      assert.equal(body.delivery.telegram.accepted,true); assert.equal(body.delivery.telegram.message_id,42);
      assert.equal(telegramPayload.text,body.telegramBrief.text);
      assert.match(telegramPayload.reply_markup.inline_keyboard[0][0].url,/portfolio_detail=NVDA/);
      assert.equal(body.returnAlerts.evaluated,false); assert.equal(body.holdingReturnAlerts.evaluated,false);
    `}
    console.log(JSON.stringify({text:body.telegramBrief.text,calls:calls.length}));
  `;
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: process.cwd(), timeout: 15000, encoding: 'utf8',
    env: { PATH: process.env.PATH, AIW_ACCESS_TOKEN: 'fixture-access', SUPABASE_URL: 'https://digest-fixture.invalid',
      SUPABASE_SERVICE_ROLE_KEY: 'fictional-test-service', TELEGRAM_BOT_TOKEN: 'fictional-test-bot', TELEGRAM_CHAT_ID: 'fictional-chat',
      PORTFOLIO_DIGEST_TIMEZONE: 'Asia/Kolkata' },
  }).trim());
}

test('authenticated digest preview exposes compact Telegram text and makes no write or sender call', () => {
  const result = exercise('GET'); assert.match(result.text, /TODAY’S REVIEW/); assert.match(result.text, /Why: Fictional rule evidence/);
});

test('mocked existing Telegram transport uses compact text, accepted-ID semantics and holding links', () => {
  const result = exercise('POST'); assert.match(result.text, /URGENT REVIEW/);
});

test('failed decision layer creates a warning preview rather than an all-clear fallback', () => {
  const result = exercise('GET', false); assert.match(result.text, /DECISION LAYER UNAVAILABLE/);
  assert.doesNotMatch(result.text, /0 urgent|0 watch|all holdings/);
});
