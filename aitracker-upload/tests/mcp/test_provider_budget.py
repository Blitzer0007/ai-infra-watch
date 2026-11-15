"""Shared actual-client transport seams; fictional clocks, keys and HTTP only."""
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
import json
import math
from threading import Event

import httpx
import pytest

from mcp_servers.provider_budget import (BUDGET_CODES, BudgetDenied, Limits, ProviderBudget, budgeted_get, budgeted_json, retry_after_seconds)
from mcp_servers.stocks.providers import FinnhubProvider, QuoteError
from mcp_servers.stocks.research_sources import FinnhubResearchProvider
from mcp_servers.stocks.earnings import FinnhubEarningsProvider, EarningsService
from mcp_servers.stocks.candles import FinnhubCandleProvider
from mcp_servers.news.providers import FinnhubNewsProvider, NewsError
from mcp_servers.filings.edgar import LiveEdgarClient
from mcp_servers.filings.schemas import EdgarError


class Clock:
    now = 0.0
    def read(self):return self.now
    def sleep(self, seconds):self.now += seconds


def coordinator(**changes):
    clock = Clock()
    limits = replace(Limits(), **changes)
    return ProviderBudget({'finnhub': limits, 'sec': limits}, clock=clock.read, sleep=clock.sleep, wall_clock=lambda: 0), clock


def transport(monkeypatch, responses=None, on_get=None):
    calls = []
    responses = iter(responses or [200])
    class Client:
        def __init__(self, **kwargs):self.options = kwargs
        def __enter__(self):return self
        def __exit__(self, *args):return False
        def get(self, url, params=None):
            calls.append({'url':url, 'options':self.options, 'params':params})
            if on_get:on_get()
            response = next(responses)
            if isinstance(response, Exception):raise response
            if isinstance(response, httpx.Response):return response
            return httpx.Response(response, json={'c':100,'dp':0}, request=httpx.Request('GET',url))
    monkeypatch.setattr(httpx, 'Client', Client)
    return calls


def test_one_process_window_is_shared_between_quote_and_research_instances(monkeypatch):
    from mcp_servers import provider_budget
    budget, _ = coordinator(requests_per_window=1)
    monkeypatch.setattr(provider_budget, '_PROCESS_BUDGET', budget)
    calls = transport(monkeypatch)
    assert FinnhubProvider(api_key='fictional',max_retries=0).get_quote('FICT').price == 100
    with pytest.raises(QuoteError) as exc:FinnhubResearchProvider(api_key='fictional')._get('/stock/profile2',{})
    assert exc.value.code == 'BUDGET_WINDOW' and len(calls) == 1
    assert budget.snapshot()['providers']['finnhub']['admittedAttempts'] == 1


@pytest.mark.parametrize('client,invoke',[
    (lambda:FinnhubProvider(api_key='fictional'),lambda c:c.get_quote('FICT')),
    (lambda:FinnhubResearchProvider(api_key='fictional'),lambda c:c._get('/stock/profile2',{})),
    (lambda:FinnhubEarningsProvider(api_key='fictional'),lambda c:c._get('/stock/earnings',{})),
    (lambda:FinnhubCandleProvider(api_key='fictional'),lambda c:c.get_series('FICT')),
    (lambda:FinnhubNewsProvider(api_key='fictional'),lambda c:c._get('/news',{})),
])
def test_all_finnhub_transports_obey_same_denial_before_http(monkeypatch,client,invoke):
    from mcp_servers import provider_budget
    budget,_=coordinator(requests_per_window=1)
    monkeypatch.setattr(provider_budget,'_PROCESS_BUDGET',budget)
    with budget.operation('finnhub').attempt():pass
    calls=transport(monkeypatch)
    with pytest.raises((QuoteError,NewsError)) as exc:invoke(client())
    assert exc.value.code=='BUDGET_WINDOW' and calls==[]


def test_retry_attempts_spend_window_slots_and_pacing_is_shared(monkeypatch):
    budget,clock=coordinator()
    calls=transport(monkeypatch,[500,502,200])
    budgeted_get('finnhub','https://fictional.invalid',error_type=QuoteError,budget=budget,base_delay=0,max_retries=4)
    assert len(calls)==3 and clock.now==.5
    state=budget.snapshot()['providers']['finnhub']
    assert state['admittedAttempts']==state['attemptsInWindow']==3 and state['inFlight']==0
    assert all(c['options']['timeout']<=8 for c in calls)
    assert all(c['options']['follow_redirects'] is False for c in calls)


def test_local_attempt_cap_prevents_fourth_request_and_unnecessary_backoff(monkeypatch):
    budget,clock=coordinator()
    calls=transport(monkeypatch,[500]*5)
    with pytest.raises(QuoteError) as exc:budgeted_get('finnhub','https://fictional.invalid',error_type=QuoteError,budget=budget,max_retries=4)
    assert exc.value.code=='BUDGET_ATTEMPTS' and len(calls)==3 and clock.now==3
    assert budget.snapshot()['providers']['finnhub']['inFlight']==0


def test_transport_retry_is_counted_and_raw_credentials_are_redacted(monkeypatch):
    budget,_=coordinator()
    failure=httpx.ConnectError('https://fictional.invalid?token=private-marker')
    calls=transport(monkeypatch,[failure,failure])
    with pytest.raises(QuoteError) as exc:budgeted_get('finnhub','https://fictional.invalid',error_type=QuoteError,budget=budget,max_retries=1,base_delay=0)
    assert exc.value.code=='HTTP_ERROR' and 'private-marker' not in str(exc.value) and len(calls)==2


def test_window_reopens_at_exact_expiry_without_resetting_total_receipt():
    budget,clock=coordinator(requests_per_window=1)
    with budget.operation('finnhub').attempt():pass
    clock.now=59.999
    with pytest.raises(BudgetDenied) as exc:
        with budget.operation('finnhub').attempt():pass
    assert exc.value.code=='BUDGET_WINDOW'
    clock.now=60
    with budget.operation('finnhub').attempt():pass
    assert budget.snapshot()['providers']['finnhub']['admittedAttempts']==2
    assert budget.snapshot()['providers']['finnhub']['attemptsInWindow']==1


def test_real_threads_share_concurrency_slot_and_release_after_exception():
    budget,_=coordinator();entered=Event();release=Event()
    def first():
        with budget.operation('sec').attempt():entered.set();assert release.wait(2)
    with ThreadPoolExecutor(max_workers=2) as executor:
        job=executor.submit(first);assert entered.wait(2)
        try:
            with pytest.raises(BudgetDenied) as exc:
                with budget.operation('sec').attempt():pass
            assert exc.value.code=='BUDGET_BUSY'
        finally:release.set()
        job.result(timeout=2)
    with pytest.raises(RuntimeError):
        with budget.operation('sec').attempt():raise RuntimeError('fictional')
    assert budget.snapshot()['providers']['sec']['inFlight']==0


def test_late_success_and_oversized_backoff_fail_closed(monkeypatch):
    budget,clock=coordinator()
    transport(monkeypatch,on_get=lambda:clock.sleep(9))
    with pytest.raises(QuoteError) as exc:budgeted_get('finnhub','https://fictional.invalid',error_type=QuoteError,budget=budget)
    assert exc.value.code=='BUDGET_TIME' and budget.snapshot()['providers']['finnhub']['inFlight']==0
    operation=budget.operation('finnhub');before=clock.now
    with pytest.raises(BudgetDenied):operation.pause(8)
    assert clock.now==before


def test_rate_limit_stops_retry_and_sets_shared_cooldown(monkeypatch):
    budget,clock=coordinator()
    response=httpx.Response(429,headers={'Retry-After':'120'},text='private-upstream-body')
    calls=transport(monkeypatch,[response])
    with pytest.raises(QuoteError) as exc:budgeted_get('finnhub','https://fictional.invalid',error_type=QuoteError,budget=budget,max_retries=4)
    assert exc.value.code=='RATE_LIMIT' and len(calls)==1 and 'private-upstream' not in str(exc.value)
    with pytest.raises(QuoteError) as blocked:budgeted_get('finnhub','https://fictional.invalid',error_type=QuoteError,budget=budget)
    assert blocked.value.code=='BUDGET_COOLDOWN' and len(calls)==1
    assert budget.snapshot()['providers']['finnhub']['cooldownSecondsRemaining']==120
    clock.sleep(120)
    with budget.operation('finnhub').attempt():pass


@pytest.mark.parametrize('value,expected',[(None,30),('',30),('bad',30),('-1',30),('0',1),('12',12),('Thu, 01 Jan 1970 00:02:00 GMT',120),('Thu, 01 Jan 1970 00:00:00 GMT',1)])
def test_retry_after_parsing_never_exposes_header(value,expected):assert retry_after_seconds(value,lambda:0)==expected


def test_huge_retry_after_remains_blocked_with_json_safe_receipt():
    budget,_=coordinator();budget.cooldown('sec',retry_after_seconds('9'*101))
    state=budget.snapshot();assert state['providers']['sec']['cooldownActive'] is True
    assert state['providers']['sec']['cooldownSecondsRemaining'] is None
    json.dumps(state,allow_nan=False)


def test_sec_gateway_and_direct_clients_share_admission(monkeypatch):
    from mcp_servers import provider_budget
    budget,_=coordinator(requests_per_window=1);monkeypatch.setattr(provider_budget,'_PROCESS_BUDGET',budget)
    monkeypatch.delenv('EDGAR_GATEWAY_URL',raising=False);monkeypatch.delenv('EDGAR_GATEWAY_TOKEN',raising=False)
    calls=transport(monkeypatch)
    first=LiveEdgarClient(user_agent='fictional-test');first.gateway_url='https://fictional-gateway.invalid/api/sec';first.gateway_token='fictional-only'
    first._get(first.TICKERS_URL)
    assert calls[0]['url'].startswith(first.gateway_url) and calls[0]['options']['headers']['Authorization']=='Bearer fictional-only'
    with pytest.raises(EdgarError) as exc:LiveEdgarClient(user_agent='fictional-test')._get(first.TICKERS_URL)
    assert exc.value.code=='BUDGET_WINDOW' and len(calls)==1
    assert 'fictional-only' not in json.dumps(budget.snapshot()) and 'invalid' not in json.dumps(budget.snapshot())


@pytest.mark.parametrize('status',[301,302,400,401,403])
def test_terminal_http_and_redirects_are_not_retried_or_echoed(monkeypatch,status):
    budget,_=coordinator();calls=transport(monkeypatch,[httpx.Response(status,text='private-body')])
    with pytest.raises(EdgarError) as exc:budgeted_get('sec','https://fictional.invalid',error_type=EdgarError,budget=budget)
    assert exc.value.code=='HTTP_ERROR' and 'private-body' not in str(exc.value) and len(calls)==1


def test_malformed_json_is_redacted_after_consuming_attempt(monkeypatch):
    budget,_=coordinator();transport(monkeypatch,[httpx.Response(200,text='not-json-private-body')])
    with pytest.raises(QuoteError) as exc:budgeted_json('finnhub','https://fictional.invalid',error_type=QuoteError,budget=budget)
    assert exc.value.code=='NO_DATA' and 'private' not in str(exc.value)
    assert budget.snapshot()['providers']['finnhub']['admittedAttempts']==1


@pytest.mark.parametrize('changes',[{'requests_per_window':0},{'max_in_flight':True},{'operation_seconds':math.inf},{'operation_seconds':61},{'min_interval_seconds':-1}])
def test_invalid_policy_rejected(changes):
    with pytest.raises(ValueError):Limits(**changes)


@pytest.mark.parametrize('changes',[{'timeout':True},{'timeout':math.nan},{'timeout':0},{'max_retries':100},{'base_delay':-1},{'min_interval':math.inf}])
def test_invalid_request_settings_never_reach_http(monkeypatch,changes):
    calls=transport(monkeypatch)
    with pytest.raises(QuoteError) as exc:budgeted_get('finnhub','https://fictional.invalid',error_type=QuoteError,**changes)
    assert exc.value.code=='CONFIG' and calls==[]


@pytest.mark.parametrize('denial',['BUDGET_WINDOW','RATE_LIMIT'])
def test_provider_denial_cannot_trigger_other_vendor_fallback(denial):
    class Primary:
        def get_earnings(self,symbol):raise QuoteError(denial,'fictional')
    class Secondary:
        def get_earnings(self,symbol):raise AssertionError('Fallback bypassed local budget')
    with pytest.raises(QuoteError) as exc:EarningsService(provider=Primary(),fallback_provider=Secondary()).get_earnings('FICT')
    assert exc.value.code==denial


def test_provider_keys_are_separate_and_snapshot_mutation_cannot_change_limits():
    budget,_=coordinator(requests_per_window=1)
    with budget.operation('finnhub').attempt():pass
    with budget.operation('sec').attempt():pass
    snapshot=budget.snapshot();snapshot['providers']['finnhub']['policy']['requests_per_window']=100
    with pytest.raises(BudgetDenied):
        with budget.operation('finnhub').attempt():pass
    with pytest.raises(TypeError):budget.limits['finnhub']=Limits()


def test_clock_rollback_fails_closed_and_early_sleep_does_not_bypass_pacing():
    budget,clock=coordinator()
    with budget.operation('sec').attempt():pass
    budget.sleep=lambda seconds:None
    with pytest.raises(BudgetDenied):
        with budget.operation('sec').attempt():pass
    assert budget.snapshot()['providers']['sec']['inFlight']==0
    clock.now=-1
    with pytest.raises(BudgetDenied):budget.operation('sec')


def test_batch_quote_errors_retain_local_budget_category():
    from mcp_servers.stocks.service import StockService
    from mcp_servers.stocks.schemas import Quote
    class Loaded:
        source='finnhub'
        def get_quote(self,symbol):
            if symbol=='FICT':return Quote(symbol=symbol,price=100)
            raise QuoteError('BUDGET_WINDOW','fictional')
    result=StockService(provider=Loaded()).get_quotes(['FICT','OTHER'])
    assert result.errors=={'OTHER':'BUDGET_WINDOW'} and result.as_of is None


def test_clock_failure_at_operation_start_is_shaped_at_provider_boundary(monkeypatch):
    budget,clock=coordinator()
    budget.operation('sec');clock.now=-1
    calls=transport(monkeypatch)
    with pytest.raises(EdgarError) as exc:budgeted_get('sec','https://fictional.invalid',error_type=EdgarError,budget=budget)
    assert exc.value.code=='BUDGET_TIME' and calls==[]
