#!/usr/bin/env node
// Private research export. This does not post to Discord or call OpenAI.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import freeLeagues from '../bot/trends/free-leagues.js';

function options(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i]?.startsWith('--') || !argv[i + 1]) throw new Error('Use --sport --player --stat --side --line [--team] [--season] [--output]');
    out[argv[i].slice(2)] = argv[i + 1];
  }
  return out;
}

async function main() {
  const o = options(process.argv.slice(2));
  const sport = String(o.sport || '').toUpperCase();
  const name = o.player;
  const line = Number(o.line);
  if (!name || !Number.isFinite(line)) throw new Error('Player and numeric line required');
  const fetchImpl = o['source-file'] ? async url => ({
    ok: true,
    arrayBuffer: async () => readFile(url.includes('/mlb_schedules/') ? o['schedule-file'] : o['source-file'])
  }) : fetch;
  if (o['source-file'] && sport === 'MLB' && !o['schedule-file']) throw new Error('MLB local export needs --schedule-file');
  const result = await freeLeagues.research({ sport, name, team: o.team, stat: o.stat,
    side: o.side || 'over', line, season: o.season ? Number(o.season) : undefined, fetchImpl });
  const dir = o.output ? path.resolve(o.output) : path.resolve('data/trends/private');
  await mkdir(dir, { recursive: true });
  const slug = `${sport.toLowerCase()}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${o.stat}`;
  const csvPath = path.join(dir, `${slug}-games.csv`);
  const summaryPath = path.join(dir, `${slug}-summary.json`);
  await writeFile(csvPath, freeLeagues.toCsv(result), { mode: 0o600 });
  await writeFile(summaryPath, JSON.stringify({
    sport: result.sport, player: result.name, stat: result.stat, line: result.line,
    side: result.side, season: result.season, checkedAt: result.checkedAt,
    sourceUrl: result.sourceUrl, scheduleUrl: result.scheduleUrl,
    seasonCount: result.analysis.season, last5: result.analysis.l5,
    last10: result.analysis.l10, last20: result.analysis.l20,
    note: 'Historical participated games only. Not a prediction or verified current sportsbook market.'
  }, null, 2) + '\n', { mode: 0o600 });
  process.stdout.write(JSON.stringify({ csvPath, summaryPath, last20: result.analysis.l20 }) + '\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
