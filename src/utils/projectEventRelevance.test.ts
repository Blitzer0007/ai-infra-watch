import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isProjectEventRelevant } from '../../server/utils/projectEventRelevance.js';

const dgxxProfile = {
  name: 'Digi Power X',
  aliases: ['DigiPower X', 'DGXX', 'Digihost Technology'],
  domains: ['digipowerx.com'],
};

describe('project event company matching', () => {
  it('rejects Nebius headlines from the DGXX tracker', () => {
    assert.equal(isProjectEventRelevant('DGXX', {
      title: 'Judge could order Nebius to halt data center construction',
      snippet: 'A Kansas City project connected to Nebius',
      url: 'https://www.fox4kc.com/news/nebius-project',
    }, dgxxProfile), false);
  });

  it('accepts a news story that names the tracked company', () => {
    assert.equal(isProjectEventRelevant('DGXX', {
      title: 'Digi Power X announces new data center capacity',
      url: 'https://news.example.com/digipowerx-capacity',
    }, dgxxProfile), true);
  });

  it('accepts an official company-domain update when the headline is generic', () => {
    assert.equal(isProjectEventRelevant('DGXX', {
      title: 'Project update',
      url: 'https://investors.digipowerx.com/news/update',
    }, dgxxProfile), true);
  });

  it('accepts uppercase ticker references but not lowercase word collisions', () => {
    assert.equal(isProjectEventRelevant('DGXX', {
      title: 'DGXX reports new power capacity',
      url: 'https://example.com/story',
    }, dgxxProfile), true);
    assert.equal(isProjectEventRelevant('NOW', {
      title: 'Now construction begins at data center',
      url: 'https://example.com/story',
    }, { name: 'ServiceNow', domains: ['servicenow.com'] }), false);
    assert.equal(isProjectEventRelevant('NOW', {
      title: 'Now construction begins at data center',
      url: 'https://example.com/story',
    }, { name: 'NOW', domains: [] }), false);
  });

  it('accepts Nebius headlines for NBIS', () => {
    assert.equal(isProjectEventRelevant('NBIS', {
      title: 'Judge could order Nebius to halt data center construction',
      url: 'https://www.fox4kc.com/news/nebius-project',
    }, { name: 'Nebius', aliases: ['Nebius Group', 'NBIS'], domains: ['nebius.com'] }), true);
  });
});
