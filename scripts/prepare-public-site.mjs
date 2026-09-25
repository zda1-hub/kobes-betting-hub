import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(projectRoot, '.public-site');
export const productionMembershipWorkerOrigin = 'https://kobes-betting-hub-checkout.kobedirwin.workers.dev';

const membershipConfigFiles = ['join.html', 'membership.html', 'cancel.html', 'welcome.html', 'admin-analytics.html', 'member.html', 'partner.html'];
const membershipConfigPattern = /window\.__KBH_MEMBERSHIP_CONFIG__ = Object\.freeze\(\{[^\n]*\}\);/g;

const guideFiles = [
  'guides/index.html',
  'guides/guide.css',
  'guides/how-to-choose-a-sports-betting-discord.html',
  'guides/sports-betting-arbitrage-explained.html',
  'guides/how-to-read-betting-odds-and-line-movement.html',
  'guides/bankroll-management-for-sports-betting.html',
  'guides/what-a-sports-betting-writeup-should-include.html'
];

const publicFiles = [
  '_redirects',
  'index.html',
  'exclusives.html',
  'exclusives.css',
  'exclusives.js',
  'join.html',
  'membership.html',
  'cancel.html',
  'cancel.js',
  'recaps.html',
  'recaps.js',
  'recaps-data.json',
  'results.html',
  'results.css',
  'results.js',
  'free-pick.html',
  'free-pick.js',
  'free-pick.css',
  'faq.html',
  'support.html',
  'terms.html',
  'privacy.html',
  'responsible-gambling.html',
  '404.html',
  'styles.css',
  'brand.css',
  'home.css',
  'home.js',
  'membership.css',
  'membership.js',
  'first-month-promo.js',
  'membership-theme.css',
  'analytics.js',
  'meta-pixel.js',
  'welcome.html',
  'welcome.js',
  'admin-analytics.html',
  'admin-analytics.css',
  'admin-analytics.js',
  'member.html',
  'member.js',
  'partner.html',
  'partner.css',
  'partner.js',
  'refer.html',
  'creator.html',
  'referral.css',
  'referral.js',
  'robots.txt',
  'sitemap.xml',
  'db1ee41902e983e26660d3cdd202f302.txt',
  'betting-hub-logo.png',
  'betting-hub-logo-v2.png',
  'betting-hub-logo-final.png',
  'app.js'
];

export function resolveMembershipConfig(env = process.env) {
  const environment = env.KBH_SITE_ENV || 'production';
  if (!['production', 'staging'].includes(environment)) {
    throw new Error('KBH_SITE_ENV must be either "production" or "staging".');
  }

  const configuredOrigin = env.KBH_MEMBERSHIP_WORKER_ORIGIN || '';
  if (environment === 'production' && configuredOrigin && configuredOrigin !== productionMembershipWorkerOrigin) {
    throw new Error('Production builds cannot override KBH_MEMBERSHIP_WORKER_ORIGIN.');
  }
  if (environment === 'staging' && !configuredOrigin) {
    throw new Error('Staging builds require KBH_MEMBERSHIP_WORKER_ORIGIN.');
  }

  const workerOrigin = configuredOrigin || productionMembershipWorkerOrigin;
  let parsedOrigin;
  try {
    parsedOrigin = new URL(workerOrigin);
  } catch {
    throw new Error('KBH_MEMBERSHIP_WORKER_ORIGIN must be a valid HTTPS origin.');
  }
  if (
    parsedOrigin.protocol !== 'https:'
    || parsedOrigin.origin !== workerOrigin
    || parsedOrigin.username
    || parsedOrigin.password
  ) {
    throw new Error('KBH_MEMBERSHIP_WORKER_ORIGIN must be a valid HTTPS origin without a path, query, or credentials.');
  }
  if (environment === 'staging' && workerOrigin === productionMembershipWorkerOrigin) {
    throw new Error('Staging builds cannot use the production membership Worker origin.');
  }

  return { environment, workerOrigin };
}

export function injectMembershipConfig(source, config, fileName = 'HTML file') {
  const replacement = `window.__KBH_MEMBERSHIP_CONFIG__ = Object.freeze(${JSON.stringify(config)});`;
  const matches = source.match(membershipConfigPattern) || [];
  if (matches.length !== 1) {
    throw new Error(`${fileName} must contain exactly one membership configuration block.`);
  }
  return source.replace(membershipConfigPattern, replacement);
}

export async function preparePublicSite({ env = process.env } = {}) {
  const membershipConfig = resolveMembershipConfig(env);

  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(path.join(outputRoot, 'guides'), { recursive: true });
  await mkdir(path.join(outputRoot, 'admin', 'analytics'), { recursive: true });
  await mkdir(path.join(outputRoot, 'data'), { recursive: true });

  await Promise.all(publicFiles.map((file) => cp(
    path.join(projectRoot, file),
    path.join(outputRoot, file)
  )));
  await Promise.all(guideFiles.map((file) => cp(
    path.join(projectRoot, file),
    path.join(outputRoot, file)
  )));

  await Promise.all(membershipConfigFiles.map(async (file) => {
    const outputPath = path.join(outputRoot, file);
    const source = await readFile(outputPath, 'utf8');
    await writeFile(outputPath, injectMembershipConfig(source, membershipConfig, file));
  }));

  // First-party page views are injected into every public HTML artifact so the
  // funnel has one consistent session identity without third-party trackers.
  const htmlFiles = [...publicFiles, ...guideFiles].filter(file => file.endsWith('.html'));
  await Promise.all(htmlFiles.map(async file => {
    const outputPath = path.join(outputRoot, file);
    const source = await readFile(outputPath, 'utf8');
    if (source.includes('src="analytics.js')) return;
    await writeFile(outputPath, source.replace('</body>', '  <script src="/analytics.js?v=20260920-attribution"></script>\n  </body>'));
  }));

  // Meta campaign measurement belongs only on public marketing and checkout
  // pages. Keep it out of private admin, member, creator and partner portals
  // so internal activity cannot contaminate ad results.
  const metaPixelFiles = new Set([
    'index.html', 'exclusives.html', 'join.html', 'membership.html',
    'cancel.html', 'welcome.html', 'recaps.html', 'results.html', 'free-pick.html',
    'faq.html', 'support.html', 'terms.html', 'privacy.html',
    'responsible-gambling.html', 'refer.html', '404.html',
    ...guideFiles.filter(file => file.endsWith('.html'))
  ]);
  await Promise.all([...metaPixelFiles].map(async file => {
    const outputPath = path.join(outputRoot, file);
    let source = await readFile(outputPath, 'utf8');
    if (!source.includes('src="/meta-pixel.js')) {
      source = source.replace('</head>', '  <script src="/meta-pixel.js?v=20260924" defer></script>\n</head>');
    }
    if (!source.includes('facebook.com/tr?id=4640857832799621')) {
      source = source.replace(/<body([^>]*)>/i, '<body$1>\n  <noscript><img height="1" width="1" style="display:none" alt="" src="https://www.facebook.com/tr?id=4640857832799621&amp;ev=PageView&amp;noscript=1"></noscript>');
    }
    await writeFile(outputPath, source);
  }));

  // One source of truth, including environment-specific secure portal config.
  await cp(path.join(outputRoot, 'cancel.html'), path.join(outputRoot, 'managemembership.html'));
  await cp(path.join(outputRoot, 'admin-analytics.html'), path.join(outputRoot, 'admin', 'analytics', 'index.html'));

  await cp(path.join(projectRoot, 'assets'), path.join(outputRoot, 'assets'), { recursive: true });
  await cp(
    path.join(projectRoot, 'data', 'exclusive-directory.json'),
    path.join(outputRoot, 'data', 'exclusive-directory.json')
  );

  console.log(`Prepared ${publicFiles.length + guideFiles.length + 2} public site entries in ${outputRoot} for ${membershipConfig.environment}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await preparePublicSite();
}
