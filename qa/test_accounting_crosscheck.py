"""Cross-language arithmetic on invented records only. No hosted/tool/model calls."""
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import sys

from decimal import Decimal
import pytest

ROOT=Path(__file__).resolve().parents[1]
MODULE=ROOT/'aitracker-upload/app/mcp_client/accounting_crosscheck.py'
spec=importlib.util.spec_from_file_location('offline_accounting_crosscheck',MODULE)
accounting=importlib.util.module_from_spec(spec)
spec.loader.exec_module(accounting)


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    def forbidden(*args,**kwargs):
        raise AssertionError('Accounting cross-check must not connect to a network')
    monkeypatch.setattr(socket.socket,'connect',forbidden)
    monkeypatch.setattr(socket,'create_connection',forbidden)


@pytest.fixture(scope='module')
def packets():
    result=subprocess.run([str(ROOT/'node_modules/.bin/tsx'),str(ROOT/'scripts/accounting-crosscheck-fixtures.ts')],cwd=ROOT,
                          env={'PATH':os.environ.get('PATH','')},check=True,capture_output=True,timeout=15)
    rows=json.loads(result.stdout)
    assert len(rows)==8 and all(row['packet'] is not None for row in rows)
    return rows


def encode(value):
    return json.dumps(value,separators=(',',':'),allow_nan=False).encode()


@pytest.mark.parametrize('index',range(8))
def test_independent_decimal_matches_original_input_js_calculations(packets,index):
    raw=encode(packets[index]['packet']);result=accounting.crosscheck(raw)
    assert result['status']=='matched-loaded-calculations',packets[index]['name']
    assert result['packetSha256']==hashlib.sha256(raw).hexdigest()
    assert result['accountingReconciled'] is False and result['grantsDecisionEligibility'] is False
    assert result['verifiesSourceRecords'] is False and result['restoresAgentPnl'] is False
    assert result['historyCoverage']==result['corporateActionCoverage']=='unverified'
    assert result['usage']=={'providerCalls':0,'modelCalls':0,'databaseCalls':0}
    assert isinstance(result['totals']['openCostBasis'],str)


def test_tiny_money_never_disappears_under_an_absolute_comparison_floor(packets):
    packet=copy.deepcopy(packets[4]['packet'])
    assert Decimal(accounting.crosscheck(encode(packet))['totals']['openCostBasis'])==Decimal('1e-10')
    packet['expected']['totals']['openCostBasis']=0
    result=accounting.crosscheck(encode(packet))
    assert result['status']=='calculation-mismatch' and result['totals'] is None and result['positions']==[]


def test_expected_result_cannot_substitute_for_recomputation(packets):
    packet=copy.deepcopy(packets[0]['packet'])
    packet['expected']['positions'][0]['openCostBasis']+=1
    assert accounting.crosscheck(encode(packet))['status']=='calculation-mismatch'
    packet=copy.deepcopy(packets[0]['packet']);packet['transactions'][0]['amount']+=10
    assert accounting.crosscheck(encode(packet))['status']=='calculation-mismatch'


def test_input_digest_binds_exact_bytes_but_does_not_certify_sources(packets):
    raw=encode(packets[0]['packet']);a=accounting.crosscheck(raw);b=accounting.crosscheck(raw+b'\n')
    assert a['status']==b['status']=='matched-loaded-calculations'
    assert a['packetSha256']!=b['packetSha256'] and b['verifiesSourceRecords'] is False


@pytest.mark.parametrize('key,value',[
    ('brokerage',None),('brokerage',True),('brokerage',-1),('currency',None),('currency','EUR'),
    ('quantity',0),('quantity',1e-9),('quantity',True),('quantity',1e9),('quantity',1.00000001),
    ('amount','100'),('amount',0),('amount',1e13),('tradeDate','2026-02-30'),('tradeDate','2027-01-01'),
    ('executedAt','2026-01-01T11:00:00'),('executedAt','2026-01-02T11:00:00Z'),('executedAt','2027-01-01T11:00:00Z'),
    ('transactionType','OTHER'),('symbol','fict'),('id','private name with spaces'),('notes','not permitted'),
])
def test_invalid_original_fields_cannot_receive_receipts(packets,key,value):
    packet=copy.deepcopy(packets[0]['packet']);packet['transactions'][0][key]=value
    with pytest.raises(ValueError):accounting.crosscheck(encode(packet))


def test_rejects_unknown_fields_versions_duplicates_and_false_authority(packets):
    for change in [{'privateNotes':'never echo'},{'accountingReconciled':True},{'contractVersion':'v-next'}]:
        packet={**copy.deepcopy(packets[0]['packet']),**change}
        with pytest.raises(ValueError):accounting.crosscheck(encode(packet))
    packet=copy.deepcopy(packets[0]['packet']);packet['holdings'].append(packet['holdings'][0])
    with pytest.raises(ValueError):accounting.crosscheck(encode(packet))
    packet=copy.deepcopy(packets[0]['packet']);packet['transactions'].append(packet['transactions'][0])
    with pytest.raises(ValueError):accounting.crosscheck(encode(packet))


def test_ambiguous_same_day_order_and_oversell_are_rejected(packets):
    packet=copy.deepcopy(packets[6]['packet'])
    for row in packet['transactions']:row['executedAt']=None
    with pytest.raises(ValueError,match='Ambiguous'):accounting.crosscheck(encode(packet))
    packet=copy.deepcopy(packets[6]['packet']);packet['transactions'][0]['executedAt']='2026-01-01T10:00:00Z'
    with pytest.raises(ValueError,match='sequence'):accounting.crosscheck(encode(packet))


@pytest.mark.parametrize('raw',[b'{"x":1,"x":2}',b'{"x":NaN}',b'{"x":Infinity}',b'{"x":-Infinity}',b'\xff',b'[]',b'{}'])
def test_invalid_json_and_duplicate_keys_are_rejected(raw):
    with pytest.raises((ValueError,UnicodeDecodeError)):accounting.crosscheck(raw)


def test_bounds_and_numeric_underflow_are_rejected(packets):
    with pytest.raises(ValueError):accounting.crosscheck(b' '*(accounting.MAX_BYTES+1))
    for field,count in [('holdings',151),('transactions',1001)]:
        packet=copy.deepcopy(packets[0]['packet']);packet[field]=[packet[field][0]]*count
        with pytest.raises(ValueError):accounting.crosscheck(encode(packet))
    raw=encode(packets[4]['packet']).replace(b'1e-10',b'1e-100000')
    with pytest.raises(ValueError):accounting.crosscheck(raw)


def test_cli_is_bounded_sanitized_and_has_no_application_configuration(packets):
    env={'PATH':os.environ.get('PATH','')}
    good=subprocess.run([sys.executable,str(MODULE)],input=encode(packets[0]['packet']),env=env,capture_output=True,timeout=5)
    assert good.returncode==0 and json.loads(good.stdout)['status']=='matched-loaded-calculations'
    bad=subprocess.run([sys.executable,str(MODULE)],input=b'{"private":"never echo this"}',env=env,capture_output=True,timeout=5)
    assert bad.returncode==2 and bad.stderr==b''
    assert json.loads(bad.stdout)=={'error':'Invalid or unsupported accounting packet'}
