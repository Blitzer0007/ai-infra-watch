import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isTrackerEventRelevantToTicker } from './tickerEventGuard';

describe('Progress Tracker client-side company relevance guard', () => {
  it('rejects Nebius news from the DGXX timeline even when the snippet mentions DGXX', () => {
    assert.equal(isTrackerEventRelevantToTicker({
      stockSymbol: 'DGXX',
      sourceType: 'secondary-news',
      title: 'Judge could order Nebius to halt data center construction',
      description: 'The article compares the region with DGXX infrastructure.',
    }, 'DGXX', 'Digi Power X Inc.'), false);
  });

  it('rejects Nebius news tagged with DGXX when the snippet does not mention DGXX', () => {
    assert.equal(isTrackerEventRelevantToTicker({
      stockSymbol: 'DGXX',
      sourceType: 'secondary-news',
      title: 'Hearing set on temporary restraining order for Nebius data center project',
      description: 'Kansas City news report.',
    }, 'DGXX', 'Digi Power X Inc.'), false);
  });

  it('rejects a legacy Nebius headline even when sourceType metadata is missing', () => {
    assert.equal(isTrackerEventRelevantToTicker({
      stockSymbol: 'DGXX',
      title: 'Managing applications with the Virtual machine deployment option - Nebius',
      description: 'Virtual machine deployment documentation.',
    }, 'DGXX', 'Digi Power X Inc.'), false);
  });

  it('keeps a story that clearly names Digi Power X in the headline', () => {
    assert.equal(isTrackerEventRelevantToTicker({
      stockSymbol: 'DGXX',
      sourceType: 'secondary-news',
      title: 'Digi Power X announces new data center capacity',
      description: 'Company update.',
    }, 'DGXX', 'Digi Power X Inc.'), true);
  });

  it('keeps a Nebius story on the NBIS timeline', () => {
    assert.equal(isTrackerEventRelevantToTicker({
      stockSymbol: 'NBIS',
      sourceType: 'secondary-news',
      title: 'Judge could order Nebius to halt data center construction',
      description: 'Kansas City news report.',
    }, 'NBIS', 'Nebius Group N.V.'), true);
  });

  it('does not count the ordinary word “now” as the NOW ticker', () => {
    assert.equal(isTrackerEventRelevantToTicker({
      stockSymbol: 'NOW',
      sourceType: 'secondary-news',
      title: 'Now construction begins at a data center',
      description: '',
    }, 'NOW', 'ServiceNow Inc.'), false);
  });

  it('does not match a lowercase ticker collision for an unknown company', () => {
    assert.equal(isTrackerEventRelevantToTicker({
      stockSymbol: 'XYZ',
      sourceType: 'secondary-news',
      title: 'The x y z construction process',
      description: 'A general construction story.',
    }, 'XYZ', 'XYZ'), false);
  });

  it('allows curated milestones assigned to the ticker when sourceType is absent', () => {
    assert.equal(isTrackerEventRelevantToTicker({
      stockSymbol: 'DGXX',
      title: 'SubQ AI contract signed',
      description: 'Curated milestone.',
    }, 'DGXX', 'Digi Power X Inc.'), true);
  });

  it('rejects an event whose stockSymbol does not match the selected ticker', () => {
    assert.equal(isTrackerEventRelevantToTicker({
      stockSymbol: 'NBIS',
      sourceType: 'secondary-news',
      title: 'Nebius connected capacity reaches 170 MW',
      description: '',
    }, 'DGXX', 'Digi Power X Inc.'), false);
  });
});
