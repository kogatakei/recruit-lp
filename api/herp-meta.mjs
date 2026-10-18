import { createHash } from 'node:crypto';

const HERP_API_URL = 'https://public-api.herp.cloud/hire/v1/candidacies';
const META_API_VERSION = 'v25.0';
const MAX_HERP_PAGES = 20;

export function jstDate(value) {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function previousJstDate(now = new Date()) {
  const today = jstDate(now);
  const previous = new Date(`${today}T00:00:00Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous.toISOString().slice(0, 10);
}

export function syncJstDate(now = new Date(), override) {
  if (!override) return previousJstDate(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(override) ||
      new Date(`${override}T00:00:00Z`).toISOString().slice(0, 10) !== override) {
    throw new Error('Invalid HERP_SYNC_DATE');
  }
  const daysAgo = (Date.parse(`${jstDate(now)}T00:00:00Z`) -
    Date.parse(`${override}T00:00:00Z`)) / 86400000;
  if (daysAgo < 1 || daysAgo > 6) throw new Error('HERP_SYNC_DATE must be within the last 6 days');
  return override;
}

export function makeMetaEvent(candidacy, { requisitionId, channelType, sourceUrl, targetDate }) {
  if (candidacy.requisitionId !== requisitionId) return null;
  if (candidacy.channel?.type !== channelType) return null;
  if (jstDate(candidacy.appliedAt) !== targetDate) return null;
  if (!candidacy.id || !candidacy.email) return null;

  const email = candidacy.email.trim().toLowerCase();
  if (!email.includes('@')) return null;
  const eventTime = Math.floor(Date.parse(candidacy.appliedAt) / 1000);
  if (!Number.isFinite(eventTime)) return null;

  return {
    event_name: 'CompleteRegistration',
    event_time: eventTime,
    event_id: `herp:${candidacy.id}`,
    action_source: 'website',
    event_source_url: sourceUrl,
    user_data: {
      em: [createHash('sha256').update(email).digest('hex')],
    },
  };
}

async function readHerpCandidacies({ apiKey, requisitionId, fromDate, toDate }) {
  const candidacies = [];
  for (let page = 1; page <= MAX_HERP_PAGES; page++) {
    const url = new URL(HERP_API_URL);
    url.searchParams.set('requisitionId', requisitionId);
    url.searchParams.set('appliedAtFrom', fromDate);
    url.searchParams.set('appliedAtTo', toDate);
    url.searchParams.set('page', String(page));

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`HERP API returned ${response.status}`);
    const body = await response.json();
    if (!Array.isArray(body.candidacies) || typeof body.hasNextPage !== 'boolean') {
      throw new Error('HERP API response shape changed');
    }
    candidacies.push(...body.candidacies);
    if (!body.hasNextPage) return candidacies;
  }
  throw new Error(`HERP API exceeded ${MAX_HERP_PAGES} pages`);
}

async function sendMetaEvents({ events, pixelId, accessToken }) {
  let received = 0;
  for (let start = 0; start < events.length; start += 100) {
    const batch = events.slice(start, start + 100);
    const response = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${pixelId}/events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: batch }),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Meta CAPI returned ${response.status}`);
    const body = await response.json();
    if (body.events_received !== batch.length) throw new Error('Meta CAPI accepted fewer events than sent');
    received += body.events_received;
  }
  return received;
}

export default {
  async fetch(request) {
    if (request.method !== 'GET') return Response.json({ error: 'Method not allowed' }, { status: 405 });
    if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (new URL(request.url).searchParams.get('inspect') === 'channels') {
      const { HERP_API_KEY, HERP_REQUISITION_ID } = process.env;
      if (!HERP_API_KEY || !HERP_REQUISITION_ID) {
        return Response.json({ error: 'Missing configuration' }, { status: 503 });
      }
      const toDate = jstDate(new Date());
      const from = new Date(`${toDate}T00:00:00Z`);
      from.setUTCDate(from.getUTCDate() - 30);
      const fromDate = from.toISOString().slice(0, 10);
      try {
        const candidacies = await readHerpCandidacies({
          apiKey: HERP_API_KEY, requisitionId: HERP_REQUISITION_ID, fromDate, toDate,
        });
        const counts = new Map();
        for (const candidacy of candidacies) {
          if (candidacy.requisitionId !== HERP_REQUISITION_ID) continue;
          const type = candidacy.channel?.type ?? 'unknown';
          counts.set(type, (counts.get(type) ?? 0) + 1);
        }
        return Response.json({ fromDate, toDate, channels: Object.fromEntries(counts) });
      } catch (error) {
        console.error('HERP channel inspection failed:', error.message);
        return Response.json({ error: 'Inspection failed' }, { status: 502 });
      }
    }
    if (process.env.HERP_META_ENABLED !== 'true') {
      return Response.json({ status: 'disabled' });
    }

    const { HERP_API_KEY, HERP_REQUISITION_ID, HERP_CHANNEL_TYPE, HERP_EVENT_SOURCE_URL,
      META_CAPI_TOKEN, META_PIXEL_ID } = process.env;
    if (![HERP_API_KEY, HERP_REQUISITION_ID, HERP_CHANNEL_TYPE, HERP_EVENT_SOURCE_URL,
      META_CAPI_TOKEN, META_PIXEL_ID].every(Boolean)) {
      return Response.json({ error: 'Missing configuration' }, { status: 503 });
    }
    const sourceUrl = new URL(HERP_EVENT_SOURCE_URL);
    if (sourceUrl.origin !== 'https://herp.careers' || sourceUrl.search) {
      return Response.json({ error: 'Invalid HERP source URL' }, { status: 503 });
    }

    let targetDate;
    try {
      targetDate = syncJstDate(new Date(), process.env.HERP_SYNC_DATE);
      const candidacies = await readHerpCandidacies({
        apiKey: HERP_API_KEY, requisitionId: HERP_REQUISITION_ID,
        fromDate: targetDate, toDate: targetDate,
      });
      const events = candidacies.map((candidacy) => makeMetaEvent(candidacy, {
        requisitionId: HERP_REQUISITION_ID,
        channelType: HERP_CHANNEL_TYPE,
        sourceUrl: sourceUrl.href,
        targetDate,
      })).filter(Boolean);
      if (process.env.HERP_META_DRY_RUN === 'true') {
        console.info('HERP_META_SUMMARY', JSON.stringify({ date: targetDate, candidates: candidacies.length, events: events.length, mode: 'dry-run' }));
        return Response.json({ date: targetDate, candidates: candidacies.length, events: events.length, status: 'dry-run' });
      }
      const received = await sendMetaEvents({ events, pixelId: META_PIXEL_ID, accessToken: META_CAPI_TOKEN });
      console.info('HERP_META_SUMMARY', JSON.stringify({ date: targetDate, candidates: candidacies.length, events: events.length, received }));
      return Response.json({ date: targetDate, candidates: candidacies.length, events: events.length, received });
    } catch (error) {
      console.error('HERP to Meta sync failed:', error.message);
      return Response.json({ error: 'Sync failed', date: targetDate ?? null }, { status: 502 });
    }
  },
};
