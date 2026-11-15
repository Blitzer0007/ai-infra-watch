"""Offline, model-free cross-check of an untrusted minimized loaded-ledger packet.

The digest binds bytes, not publisher identity, completeness or broker semantics.
No application source, configuration, database, provider or tool imports.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal, localcontext
import hashlib
import json
import math
import re
import sys

MAX_BYTES = 512 * 1024
LIMIT = Decimal('1e12')
MAX_UNITS = 9007199254740991
EPSILON = Decimal(2) ** -52
SYMBOL = re.compile(r'[A-Z0-9.^=-]{1,20}')
ID = re.compile(r'[A-Za-z0-9_.:-]{1,80}')
TOTALS = {'openCostBasis', 'recordedTradeResult', 'grossPurchaseCost', 'netSaleProceeds'}


def exact(value, fields):
    if not isinstance(value, dict) or set(value) != set(fields):
        raise ValueError('Invalid packet')
    return value


def number(value, *, positive=False):
    if isinstance(value, bool) or not isinstance(value, (int, Decimal)):
        raise ValueError('Invalid number')
    value = Decimal(value)
    if not value.is_finite() or abs(value) > LIMIT or (positive and value <= 0):
        raise ValueError('Invalid number')
    # Reject JSON numbers that cannot be represented as nonzero binary64 values.
    if value and (not math.isfinite(float(value)) or float(value) == 0):
        raise ValueError('Invalid number')
    return value


def units(value):
    value = number(value)
    scaled = value * 100000000
    if value < 0 or scaled != scaled.to_integral_value() or scaled > MAX_UNITS:
        raise ValueError('Invalid quantity')
    return int(scaled)


def day(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
        raise ValueError('Invalid date')
    return date.fromisoformat(value)


def instant(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})', value):
        raise ValueError('Invalid time')
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def unique(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('Duplicate key')
        result[key] = value
    return result


def decode(raw):
    if not isinstance(raw, bytes) or len(raw) > MAX_BYTES:
        raise ValueError('Packet too large')
    return json.loads(raw.decode('utf-8'), parse_float=Decimal, object_pairs_hook=unique,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError('Nonfinite number')))


def crosscheck(raw: bytes):
    # A fixed precision large enough for bounded eight-decimal quantities and
    # binary64 money, independent of caller Decimal settings.
    with localcontext() as context:
        context.prec = 50
        return _crosscheck(raw)


def _crosscheck(raw):
    packet = exact(decode(raw), {'contractVersion', 'assessedAt', 'holdings', 'transactions', 'expected'})
    if packet['contractVersion'] != 'loaded-accounting-crosscheck-v1':
        raise ValueError('Invalid version')
    assessed = instant(packet['assessedAt'])
    holdings, trades = packet['holdings'], packet['transactions']
    if not isinstance(holdings, list) or len(holdings) > 150 or not isinstance(trades, list) or not 1 <= len(trades) <= 1000:
        raise ValueError('Invalid scope')
    held = {}
    for row in holdings:
        exact(row, {'symbol', 'quantity'})
        symbol = row['symbol']
        if not isinstance(symbol, str) or not SYMBOL.fullmatch(symbol) or symbol in held:
            raise ValueError('Invalid holding')
        held[symbol] = units(row['quantity'])
    ids, groups, parsed = set(), defaultdict(list), []
    for row in trades:
        exact(row, {'id', 'symbol', 'transactionType', 'quantity', 'amount', 'brokerage', 'currency', 'tradeDate', 'executedAt'})
        symbol, record_id = row['symbol'], row['id']
        if not isinstance(symbol, str) or not SYMBOL.fullmatch(symbol) or not isinstance(record_id, str) or not ID.fullmatch(record_id) or record_id in ids:
            raise ValueError('Invalid transaction')
        ids.add(record_id)
        quantity = units(row['quantity'])
        if quantity <= 0 or row['transactionType'] not in ('BUY', 'SELL') or row['currency'] != 'USD':
            raise ValueError('Invalid transaction')
        amount, fee = number(row['amount'], positive=True), number(row['brokerage'])
        if fee < 0 or day(row['tradeDate']) > day(packet['assessedAt'][:10]):
            raise ValueError('Invalid transaction')
        execution = instant(row['executedAt']) if row['executedAt'] is not None else None
        if execution is not None and (execution > assessed or row['executedAt'][:10] != row['tradeDate']):
            raise ValueError('Invalid execution time')
        parsed.append((row, quantity, amount, fee, execution))
        groups[(symbol, row['tradeDate'])].append(parsed[-1])
    for group in groups.values():
        if len({r[0]['transactionType'] for r in group}) > 1 and (any(r[4] is None for r in group) or len({r[4] for r in group}) != len(group)):
            raise ValueError('Ambiguous order')
    parsed.sort(key=lambda r: (r[0]['tradeDate'], r[0]['symbol'], r[4].timestamp() if r[4] else 0, r[0]['id']))
    symbols = sorted(set(held) | {r[0]['symbol'] for r in parsed})
    if len(symbols) > 150:
        raise ValueError('Invalid scope')
    balance, cost, realized = defaultdict(int), defaultdict(Decimal), defaultdict(Decimal)
    gross, net = Decimal(0), Decimal(0)
    for row, quantity, amount, fee, _ in parsed:
        symbol = row['symbol']
        if row['transactionType'] == 'BUY':
            balance[symbol] += quantity
            cost[symbol] += amount + fee
            gross += amount + fee
            if balance[symbol] > MAX_UNITS:
                raise ValueError('Quantity limit')
        else:
            if balance[symbol] < quantity:
                raise ValueError('Invalid sequence')
            sold_cost = cost[symbol] * quantity / balance[symbol]
            realized[symbol] += amount - fee - sold_cost
            cost[symbol] -= sold_cost
            balance[symbol] -= quantity
            if balance[symbol] == 0:
                cost[symbol] = Decimal(0)
            net += amount - fee
    if any(balance[s] != held.get(s, 0) for s in symbols):
        raise ValueError('Quantity mismatch')
    totals = dict(openCostBasis=sum(cost.values()), recordedTradeResult=sum(realized.values()), grossPurchaseCost=gross, netSaleProceeds=net)
    positions = [dict(symbol=s, quantity=Decimal(balance[s])/100000000, openCostBasis=cost[s], recordedTradeResult=realized[s]) for s in symbols]
    if any(abs(value) > LIMIT for value in totals.values()) or any(abs(p[k]) > LIMIT for p in positions for k in ('openCostBasis', 'recordedTradeResult')):
        raise ValueError('Numeric limit')
    expected = exact(packet['expected'], {'positions', 'totals'})
    exact(expected['totals'], TOTALS)
    if not isinstance(expected['positions'], list) or len(expected['positions']) != len(positions):
        raise ValueError('Invalid expected positions')

    def matches(actual, declared):
        declared = number(declared)
        # No financial discrepancy threshold or absolute floor: small results
        # remain small; zero may not hide a nonzero result. Cancellation can
        # conservatively fail the comparison and never upgrades authority.
        if actual == 0 or declared == 0:
            return actual == declared
        return abs(actual-declared) <= max(abs(actual), abs(declared)) * EPSILON * 64 * len(trades)

    matched = all(matches(value, expected['totals'][key]) for key, value in totals.items())
    for position, declared in zip(positions, expected['positions']):
        exact(declared, {'symbol', 'quantity', 'openCostBasis', 'recordedTradeResult'})
        if declared['symbol'] != position['symbol'] or units(declared['quantity']) != balance[position['symbol']]:
            matched = False
        matched = all(matches(position[key], declared[key]) for key in ('openCostBasis', 'recordedTradeResult')) and matched
    return {'contractVersion':'loaded-accounting-crosscheck-result-v1', 'status':'matched-loaded-calculations' if matched else 'calculation-mismatch',
            'packetSha256':hashlib.sha256(raw).hexdigest(), 'assessedAt':packet['assessedAt'], 'holdingCount':len(holdings), 'transactionCount':len(trades),
            'method':'weighted-average-with-explicit-fees', 'numericComparison':'binary64-relative-64eps-per-trade-no-absolute-floor',
            'totals':{k:str(v) for k,v in totals.items()} if matched else None,
            'positions':[{k:str(v) if isinstance(v, Decimal) else v for k,v in p.items()} for p in positions] if matched else [],
            'historyCoverage':'unverified', 'corporateActionCoverage':'unverified', 'verifiesSourceRecords':False,
            'accountingReconciled':False, 'grantsDecisionEligibility':False, 'restoresAgentPnl':False,
            'usage':{'providerCalls':0, 'modelCalls':0, 'databaseCalls':0}}


def main():
    try:
        result = crosscheck(sys.stdin.buffer.read(MAX_BYTES+1))
    except Exception:
        print(json.dumps({'error':'Invalid or unsupported accounting packet'}))
        return 2
    print(json.dumps(result, allow_nan=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
