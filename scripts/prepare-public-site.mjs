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
  'proof.html',
  'approach.html',
  'site.css',
  'site.js',
  'extras.css',
  'gallery.css',
  'membership-design.css',
  'join-pricing-hierarchy.css',
  'mobile-polish.css',
  'subsite-bento.css',
  'lineup-bento.css',
  'arbitrage-guide.css',
  'referral-preview.js',
  'referral-production.js',

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
  'social-links.css',
  'brand.css',
  'home.css',
  'home.js',
  'home-results.js',
  'email-signup.css',
  'email-signup.js',
  'membership.css',
  'membership.js',
  'first-month-promo.js',
  'membership-theme.css',
  'analytics.js',
  'consent.js',
  'analytics-integrations.js',
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

export function useCanonicalPageLinks(source, fileName) {
  const pageDirectory = path.posix.dirname(`/${fileName}`);
  return source.replace(/\bhref="([^"\s]+\.html(?:[?#][^"\s]*)?)"/g, (full, href) => {
    if (/^[a-z]+:/i.test(href) || href.startsWith('//')) return full;
    const match = href.match(/^([^?#]+\.html)([?#].*)?$/);
    if (!match) return full;
    const absolute = path.posix.resolve(pageDirectory, match[1]);
    const route = absolute === '/index.html'
      ? '/'
      : absolute.endsWith('/index.html')
        ? absolute.slice(0, -'/index.html'.length)
        : absolute === '/cancel.html'
          ? '/managemembership'
          : absolute.slice(0, -'.html'.length);
    return `href="${route}${match[2] || ''}"`;
  });
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
  const trackingConfig = membershipConfig.environment === 'production' ? {
    gtm: /^GTM-[A-Z0-9]+$/.test(env.KBH_GTM_ID || '') ? env.KBH_GTM_ID : '',
    ga4: /^G-[A-Z0-9]+$/.test(env.KBH_GA4_ID || '') ? env.KBH_GA4_ID : '',
    googleAds: /^AW-[0-9]+$/.test(env.KBH_GOOGLE_ADS_ID || '') ? env.KBH_GOOGLE_ADS_ID : '',
    leadLabel: /^[A-Za-z0-9_-]+$/.test(env.KBH_GOOGLE_ADS_LEAD_LABEL || '') ? env.KBH_GOOGLE_ADS_LEAD_LABEL : '',
    purchaseLabel: /^[A-Za-z0-9_-]+$/.test(env.KBH_GOOGLE_ADS_PURCHASE_LABEL || '') ? env.KBH_GOOGLE_ADS_PURCHASE_LABEL : '',
  } : { gtm: '', ga4: '', googleAds: '', leadLabel: '', purchaseLabel: '' };
  const htmlFiles = [...publicFiles, ...guideFiles].filter(file => file.endsWith('.html') && !/^(?:admin|member|partner|creator)(?:-analytics)?\.html$/.test(file));
  await Promise.all(htmlFiles.map(async file => {
    const outputPath = path.join(outputRoot, file);
    const source = await readFile(outputPath, 'utf8');
    const withConsent = source.includes('src="/consent.js') ? source : source.replace('</head>', '  <script src="/consent.js?v=20261008"></script>\n</head>');
    const withGoogle = withConsent.includes('src="/analytics-integrations.js') ? withConsent : withConsent.replace('</head>', `  <script>window.__KBH_TRACKING_CONFIG__=${JSON.stringify(trackingConfig)}</script>\n  <script src="/analytics-integrations.js?v=20261009-consent-bootstrap"></script>\n</head>`);
    const withAnalytics = withGoogle.includes('src="analytics.js')
      ? withGoogle
      : withGoogle.replace('</body>', '  <script src="/analytics.js?v=20261009-standard-pageview"></script>\n  </body>');
    await writeFile(outputPath, useCanonicalPageLinks(withAnalytics, file));
  }));

  // Meta campaign measurement belongs only on public marketing and checkout
  // pages. Keep it out of private admin, member, creator and partner portals
  // so internal activity cannot contaminate ad results.
  const metaPixelFiles = new Set([
    'proof.html', 'approach.html',
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
      source = source.replace('</head>', '  <script src="/meta-pixel.js?v=20261004-purchase" defer></script>\n</head>');
    }
    // A noscript pixel would bypass the visitor's tracking choice.
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
