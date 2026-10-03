import assert from 'node:assert/strict';
import test from 'node:test';
import { rankSearchResults, scoreSearchMatch } from './search';

test('prioritizes exact ticker over company name matches', () => {
  const rows = [
    { symbol: 'CRM', name: 'Salesforce' },
    { symbol: 'CRMT', name: 'America First Multifamily Investors' },
  ];
  assert.equal(rankSearchResults(rows, 'CRM')[0].symbol, 'CRM');
});

test('prioritizes exact company name over partial names', () => {
  const rows = [
    { symbol: 'AMD', name: 'Advanced Micro Devices' },
    { symbol: 'AMDL', name: 'Advanced Micro Devices Limited' },
  ];
  assert.equal(rankSearchResults(rows, 'Advanced Micro Devices')[0].symbol, 'AMD');
});

test('supports aliases and partial matches', () => {
  assert.equal(scoreSearchMatch({ symbol: 'CRM', name: 'Salesforce', aliases: ['SFDC'] }, 'SFDC'), 850);
  assert.ok(scoreSearchMatch({ symbol: 'AMD', name: 'Advanced Micro Devices' }, 'micro') > 0);
});
