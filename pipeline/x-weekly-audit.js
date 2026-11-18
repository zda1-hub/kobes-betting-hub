const { sportsbooks } = require('../data/x-audit-config.json');

const X_API = 'https://api.x.com/2';
const PHOENIX_OFFSET = 7 * 60 * 60 * 1000;
const MAX_X_READS = 200;

function phoenixDate(value) { return new Date(new Date(value).getTime() - PHOENIX_OFFSET).toISOString().slice(0, 10); }
function phoenixTime(value) { return new Date(new Date(value).getTime() - PHOENIX_OFFSET).toISOString().slice(11, 16) + ' MST'; }
function windowFor(now = new Date()) {
  const endDate = phoenixDate(now);
  const endMs = Date.parse(`${endDate}T07:00:00.000Z`);
  const startMs = endMs - 7 * 86400000;
  return { weekStart: phoenixDate(startMs + PHOENIX_OFFSET), start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString() };
}

function kind(post) {
  const refs = post.referenced_tweets || [];
  if (refs.some(ref => ref.type === 'retweeted')) return 'repost';
  if (refs.some(ref => ref.type === 'replied_to')) return 'reply';
  return 'standalone';
}

function formatTag(post, ownIds = new Set()) {
  const text = post.text || '';
  const hasMedia = Boolean(post.attachments?.media_keys?.length);
  if (/\b(?:cashed|missed|graded|final stat|final score|result)\b/i.test(text)) return 'result';
  if (/\b(?:free pick|free play|free card|today.s free)\b/i.test(text)) return 'free_pick';
  if (/\b(?:record|recap)\b/i.test(text) && /\b\d+\s*[-–]\s*\d+\b|\bweekly\b/i.test(text)) return 'record_recap';
  if (/\b(?:hit.?rate|historical hits|L5|L10|L20|\d+\/\d+ games)\b/i.test(text)) return 'hitrate_card';
  if (/\b(?:matchup|who wins|score prediction|vs\.?| at )\b/i.test(text) && /\?|\bwatch\b/i.test(text)) return 'matchup_watch';
  if (/(?:\b(?:meme|lol|let.s go|we going shopping|hype)\b|😂|🤣)/i.test(text) && (hasMedia || /😂|🤣/.test(text))) return 'meme_hype';
  if ((post.referenced_tweets || []).some(ref => ref.type === 'replied_to' && ownIds.has(ref.id))) return 'thread';
  if (/https?:\/\/\S+/i.test(text) || /\b(?:discord\.gg|kobesbettinghub\.com)\//i.test(text)) return 'link_post';
  return 'other';
}

function complianceFlags(post, { allPosts = [], bookNames = sportsbooks } = {}) {
  const text = post.text || '';
  const flags = [];
  if (/\b(?:lock|guaranteed)\b/i.test(text)) flags.push('lock_or_guaranteed');
  if (/(?:\$[\d,.]+\s*(?:k|thousand|million)?\s*(?:profit|won|made|up)|(?:profit|won|made|up)\s*\$[\d,.]+)/i.test(text)) flags.push('dollar_profit_claim');
  if (bookNames.some(name => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')}\\b`, 'i').test(text))) flags.push('sportsbook_name');
  if (/\bparlay\b/i.test(text) && /\b(?:tail|bet|play|join|take|place|promo|boost)\b/i.test(text)) flags.push('parlay_promo');
  if (!/21\s*\+/i.test(text)) flags.push('missing_21_plus');
  if (/discord\.gg\//i.test(text)) {
    const parent = (post.referenced_tweets || []).find(ref => ref.type === 'replied_to')?.id;
    const siblings = allPosts.filter(p => (p.referenced_tweets || []).some(ref => ref.type === 'replied_to' && ref.id === parent))
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    if (!parent || !siblings.length || siblings[0].id !== post.id) flags.push('discord_link_outside_first_reply');
  }
  return flags;
}

function avg(values) { const found = values.filter(Number.isFinite); return found.length ? Math.round(found.reduce((a, b) => a + b, 0) / found.length * 10) / 10 : null; }
function metric(post, name) { const value = post.public_metrics?.[name]; return Number.isFinite(value) ? value : null; }
function aggregate(posts, handle, range, previous = null, now = new Date()) {
  const ownIds = new Set(posts.map(post => post.id));
  const sorted = [...posts].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const rows = sorted.map(post => ({ id: post.id, url: `https://x.com/${handle}/status/${post.id}`,
    at: post.created_at, mst: `${phoenixDate(post.created_at)} ${phoenixTime(post.created_at)}`,
    type: kind(post), format: formatTag(post, ownIds), text: post.text || '',
    media: Boolean(post.attachments?.media_keys?.length),
    views: metric(post, 'impression_count'), likes: metric(post, 'like_count'),
    replies: metric(post, 'reply_count'), reposts: metric(post, 'retweet_count'),
    bookmarks: metric(post, 'bookmark_count'), flags: complianceFlags(post, { allPosts: sorted }) }));
  const days = Array.from({ length: 7 }, (_, n) => phoenixDate(Date.parse(range.start) + n * 86400000 + PHOENIX_OFFSET));
  const perDay = days.map(date => { const day = rows.filter(row => row.mst.startsWith(date)); return { date, total: day.length,
    standalone: day.filter(row => row.type === 'standalone').length,
    replies: day.filter(row => row.type === 'reply').length,
    reposts: day.filter(row => row.type === 'repost').length } });
  const formats = Object.fromEntries([...new Set(rows.map(row => row.format))].sort().map(tag => { const group = rows.filter(row => row.format === tag); return [tag, {
    count: group.length, views: avg(group.map(row => row.views)), likes: avg(group.map(row => row.likes)),
    replies: avg(group.map(row => row.replies)), reposts: avg(group.map(row => row.reposts)),
    bookmarks: avg(group.map(row => row.bookmarks)) }]; }));
  const basis = rows.some(row => row.views !== null) ? 'views (posts without views rank by engagement)' : 'engagement (views unavailable)';
  const score = row => row.views ?? [row.likes, row.replies, row.reposts, row.bookmarks].reduce((n, x) => n + (x ?? 0), 0);
  const ranked = [...rows].sort((a, b) => score(b) - score(a));
  const standalone = perDay.reduce((n, day) => n + day.standalone, 0);
  const byViews = Object.entries(formats).filter(([, values]) => values.views !== null).sort((a, b) => b[1].views - a[1].views);
  const byEngagement = Object.entries(formats).sort((a, b) => (b[1].likes ?? 0) - (a[1].likes ?? 0));
  const order = byViews.length ? byViews : byEngagement;
  const suggestions = [
    order.length ? `Keep ${order[0][0]} in the mix: ${order[0][1].count} posts, average ${byViews.length ? order[0][1].views + ' views' : order[0][1].likes + ' likes'}.` : 'Keep measuring; no posts were available this week.',
    order.length > 1 ? `Cut or revise ${order.at(-1)[0]} until it improves: ${order.at(-1)[1].count} posts, lowest observed ${byViews.length ? 'views' : 'likes'} average.` : 'Cut no format yet; there is too little format comparison data.',
    standalone < 21 ? `Change volume: ${standalone} standalone posts versus the 21–28 weekly target (3–4 per day).` : standalone > 28 ? `Change volume: ${standalone} standalone posts exceeded the 21–28 weekly target.` : `Keep volume: ${standalone} standalone posts meet the 21–28 weekly target.`
  ];
  const previousTotal = previous?.summary?.total ?? null;
  return { id: `x-week-${range.weekStart}`, week_start: range.weekStart, generated_at: now.toISOString(),
    range, handle, summary: { total: rows.length, standalone, replies: rows.filter(r => r.type === 'reply').length,
      reposts: rows.filter(r => r.type === 'repost').length, zeroDays: perDay.filter(day => !day.total).map(day => day.date) },
    perDay, formats, posts: rows, rankingBasis: basis, top: ranked.slice(0, 5), bottom: ranked.slice(-5).reverse(),
    weekOverWeek: previousTotal === null ? null : { priorTotal: previousTotal, totalChange: rows.length - previousTotal,
      priorStandalone: previous.summary.standalone ?? null, standaloneChange: previous.summary.standalone == null ? null : standalone - previous.summary.standalone },
    suggestions };
}

function n(value) { return value === null || value === undefined ? 'N/A' : String(value); }
function markdown(report) {
  const lines = [`# KBH weekly X audit — ${report.week_start}`, '',
    `Account: @${report.handle} | Window: ${report.range.start} to ${report.range.end} (seven complete MST days)`,
    `Observed: ${report.generated_at} | Ranking: ${report.rankingBasis}`, '',
    `Total ${report.summary.total}; standalone ${report.summary.standalone}; replies ${report.summary.replies}; reposts ${report.summary.reposts}.`,
    `Zero-post days: ${report.summary.zeroDays.join(', ') || 'none'}.`, '',
    '## Daily volume', '| MST day | Total | Standalone | Replies | Reposts |', '|---|---:|---:|---:|---:|',
    ...report.perDay.map(day => `| ${day.date} | ${day.total} | ${day.standalone} | ${day.replies} | ${day.reposts} |`), '',
    '## Post times and formats',
    ...report.posts.map(row => `- [${row.mst} · ${row.type} · ${row.format}](${row.url})`), '',
    '## Performance by format', '| Format | Posts | Avg views | Likes | Replies | Reposts | Bookmarks |', '|---|---:|---:|---:|---:|---:|---:|',
    ...Object.entries(report.formats).map(([tag, value]) => `| ${tag} | ${value.count} | ${n(value.views)} | ${n(value.likes)} | ${n(value.replies)} | ${n(value.reposts)} | ${n(value.bookmarks)} |`), '',
    '## Top 5', ...report.top.map(row => `- [${row.mst} · ${row.format}](${row.url}) — views ${n(row.views)}, likes ${n(row.likes)}`), '',
    '## Bottom 5', ...report.bottom.map(row => `- [${row.mst} · ${row.format}](${row.url}) — views ${n(row.views)}, likes ${n(row.likes)}`), '',
    '## Compliance flags', ...((() => { const flagged = report.posts.flatMap(row => row.flags.length ? [`- [${row.mst}](${row.url}): ${row.flags.join(', ')}`] : []); return flagged.length ? flagged : ['None detected.']; })()), '',
    '## Week over week', report.weekOverWeek ? `Total ${report.weekOverWeek.totalChange >= 0 ? '+' : ''}${report.weekOverWeek.totalChange} vs prior ${report.weekOverWeek.priorTotal}; standalone ${n(report.weekOverWeek.standaloneChange)} change.` : 'Previous saved report unavailable.', '',
    '## Keep / cut / change', ...report.suggestions.map(s => `- ${s}`), '', 'Read-only audit; no X engagement or spend.'];
  return lines.join('\n');
}

async function readX(url, { token, fetchImpl = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), state = { reads: 0 } }) {
  if (!url.startsWith(X_API + '/')) throw new Error('Only X API v2 read endpoints are permitted.');
  for (let attempt = 0; attempt <= 2; attempt++) {
    if (state.reads >= MAX_X_READS) throw new Error('X read cap of 200 reached.');
    state.reads++;
    const response = await fetchImpl(url, { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 429 && attempt < 2) {
      const retryAfter = Number(response.headers.get('retry-after'));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 60000) : 1000 * 2 ** attempt);
      continue;
    }
    if (!response.ok) throw new Error(`X read failed: HTTP ${response.status}`);
    return response.json();
  }
  throw new Error('X rate limit retries exhausted.');
}

async function fetchOwnPosts({ handle, token, range, fetchImpl = fetch, sleep, state = { reads: 0 } }) {
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) throw new Error('Invalid KBH_X_HANDLE.');
  const options = { token, fetchImpl, sleep, state };
  const user = await readX(`${X_API}/users/by/username/${handle}`, options);
  if (!user.data?.id || user.data.username?.toLowerCase() !== handle.toLowerCase()) throw new Error('X account lookup did not match KBH_X_HANDLE.');
  const posts = []; let next;
  do {
    const url = new URL(`${X_API}/users/${user.data.id}/tweets`);
    url.searchParams.set('max_results', '100');
    url.searchParams.set('start_time', range.start);
    url.searchParams.set('end_time', range.end);
    url.searchParams.set('tweet.fields', 'created_at,public_metrics,referenced_tweets,conversation_id,attachments');
    url.searchParams.set('expansions', 'attachments.media_keys');
    url.searchParams.set('media.fields', 'type');
    if (next) url.searchParams.set('pagination_token', next);
    const page = await readX(url.toString(), options);
    posts.push(...(page.data || []));
    next = page.meta?.next_token;
  } while (next);
  return { posts, reads: state.reads };
}

module.exports = { phoenixDate, phoenixTime, windowFor, kind, formatTag, complianceFlags,
  aggregate, markdown, readX, fetchOwnPosts, MAX_X_READS };
