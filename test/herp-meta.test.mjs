import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { jstDate, makeMetaEvent, previousJstDate, syncJstDate } from '../api/herp-meta.mjs';

test('daily window follows JST, including UTC date boundary', () => {
  assert.equal(previousJstDate(new Date('2026-10-15T00:00:00Z')), '2026-10-14');
  assert.equal(jstDate('2026-10-14T15:00:00Z'), '2026-10-15');
});

test('one-time sync date accepts only the prior six JST dates', () => {
  const now = new Date('2026-10-18T00:00:00Z');
  assert.equal(syncJstDate(now), '2026-10-17');
  assert.equal(syncJstDate(now, '2026-10-14'), '2026-10-14');
  assert.throws(() => syncJstDate(now, '2026-10-11'));
  assert.throws(() => syncJstDate(now, '2026-10-18'));
  assert.throws(() => syncJstDate(now, '2026-02-30'));
});

test('only the configured job and channel become CompleteRegistration', () => {
  const options = {
    requisitionId: 'job-99', channelType: 'careerPage',
    sourceUrl: 'https://herp.careers/v1/crazy/job99', targetDate: '2026-10-14',
  };
  const candidacy = {
    id: 'app-1', requisitionId: 'job-99', channel: { type: 'careerPage' },
    appliedAt: '2026-10-14T12:00:00+09:00', email: ' Person@Example.COM ',
  };
  const event = makeMetaEvent(candidacy, options);
  assert.equal(event.event_name, 'CompleteRegistration');
  assert.equal(event.event_id, 'herp:app-1');
  assert.equal(event.user_data.em[0], createHash('sha256').update('person@example.com').digest('hex'));
  assert.equal(makeMetaEvent({ ...candidacy, requisitionId: 'another-job' }, options), null);
  assert.equal(makeMetaEvent({ ...candidacy, channel: { type: 'manual' } }, options), null);
  assert.equal(makeMetaEvent({ ...candidacy, appliedAt: '2026-10-15T00:00:00+09:00' }, options), null);
});

test('endpoint fails closed without a cron secret', async () => {
  const { default: handler } = await import('../api/herp-meta.mjs');
  const response = await handler.fetch(new Request('https://example.com/api/herp-meta'));
  assert.equal(response.status, 401);
});

test('authenticated channel inspection returns counts without applicant data or Meta delivery', async (t) => {
  const { default: handler } = await import('../api/herp-meta.mjs');
  const keys = ['CRON_SECRET', 'HERP_API_KEY', 'HERP_REQUISITION_ID', 'HERP_META_ENABLED'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
  Object.assign(process.env, {
    CRON_SECRET: 'local-test-secret', HERP_API_KEY: 'herp-test', HERP_REQUISITION_ID: 'job-99',
  });
  delete process.env.HERP_META_ENABLED;
  globalThis.fetch = async (url) => {
    assert.equal(new URL(url).origin, 'https://public-api.herp.cloud');
    return Response.json({ candidacies: [
      { requisitionId: 'job-99', channel: { type: 'careerPage' }, email: 'private@example.com' },
      { requisitionId: 'job-99', channel: { type: 'careerPage' }, name: 'Private Candidate' },
      { requisitionId: 'other-job', channel: { type: 'manual' } },
    ], hasNextPage: false });
  };
  const response = await handler.fetch(new Request('https://example.com/api/herp-meta?inspect=channels', {
    headers: { Authorization: 'Bearer local-test-secret' },
  }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.channels, { 'careerPage': 2 });
  assert.equal(JSON.stringify(result).includes('private@example.com'), false);
  assert.equal(JSON.stringify(result).includes('Private Candidate'), false);
});

test('sync sends only a hashed email and a HERP CompleteRegistration', async (t) => {
  const { default: handler } = await import('../api/herp-meta.mjs');
  const keys = ['CRON_SECRET', 'HERP_META_ENABLED', 'HERP_API_KEY', 'HERP_REQUISITION_ID',
    'HERP_CHANNEL_TYPE', 'HERP_EVENT_SOURCE_URL', 'META_CAPI_TOKEN', 'META_PIXEL_ID'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
  Object.assign(process.env, {
    CRON_SECRET: 'local-test-secret', HERP_META_ENABLED: 'true', HERP_API_KEY: 'herp-test',
    HERP_REQUISITION_ID: 'job-99', HERP_CHANNEL_TYPE: 'careerPage',
    HERP_EVENT_SOURCE_URL: 'https://herp.careers/v1/crazy/job99',
    META_CAPI_TOKEN: 'meta-test', META_PIXEL_ID: '1234',
  });
  const targetDate = previousJstDate();
  let metaPayload;
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith('https://public-api.herp.cloud/')) {
      const query = new URL(url);
      assert.equal(query.searchParams.get('requisitionId'), 'job-99');
      assert.equal(query.searchParams.get('appliedAtFrom'), targetDate);
      return Response.json({ candidacies: [{ id: 'app-1', requisitionId: 'job-99',
        channel: { type: 'careerPage' }, appliedAt: `${targetDate}T12:00:00+09:00`,
        email: 'Person@Example.com', name: 'Private Candidate' }], hasNextPage: false });
    }
    assert.equal(String(url), 'https://graph.facebook.com/v25.0/1234/events');
    metaPayload = JSON.parse(options.body);
    return Response.json({ events_received: 1 });
  };
  const response = await handler.fetch(new Request('https://example.com/api/herp-meta', {
    headers: { Authorization: 'Bearer local-test-secret' },
  }));
  assert.equal(response.status, 200);
  assert.equal(metaPayload.data[0].event_name, 'CompleteRegistration');
  assert.equal(JSON.stringify(metaPayload).includes('Person@Example.com'), false);
  assert.equal(JSON.stringify(metaPayload).includes('Private Candidate'), false);
});
