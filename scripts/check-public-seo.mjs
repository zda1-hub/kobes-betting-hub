import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const attrs = tag => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map(m => [m[1].toLowerCase(), m[2]]));
export function checkSeoPage(html, canonical) {
  const errors = [], head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] || '';
  const meta = [...head.matchAll(/<meta\b[^>]*>/gi)].map(m => attrs(m[0]));
  const links = [...head.matchAll(/<link\b[^>]*>/gi)].map(m => attrs(m[0]));
  if (!/<title\b[^>]*>[^<\s][^<]*<\/title>/i.test(head)) errors.push('missing title');
  const descriptions = meta.filter(m => m.name?.toLowerCase() === 'description');
  if (descriptions.length !== 1 || !descriptions[0].content?.trim()) errors.push('needs one nonempty description');
  const canonicals = links.filter(l => l.rel?.toLowerCase() === 'canonical');
  if (canonicals.length !== 1 || canonicals[0].href !== canonical) errors.push('canonical differs from sitemap URL');
  if (meta.some(m => ['robots', 'googlebot'].includes(m.name?.toLowerCase()) && /\b(noindex|none)\b/i.test(m.content || ''))) errors.push('sitemap page is noindex');
  if (!/<h1\b/i.test(html)) errors.push('missing H1');
  for (const block of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { JSON.parse(block[1]); } catch { errors.push('invalid structured data JSON'); }
  }
  return errors;
}
export async function checkPublicSeo(directory = '.public-site') {
  const sitemap = await readFile(path.join(directory, 'sitemap.xml'), 'utf8');
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  const errors = [];
  if (!urls.length) errors.push('empty sitemap');
  if (new Set(urls).size !== urls.length) errors.push('duplicate sitemap URLs');
  for (const url of urls) {
    const parsed = new URL(url);
    if (parsed.origin !== 'https://kobesbettinghub.com' || parsed.search || parsed.hash) { errors.push(`unexpected sitemap URL: ${url}`); continue; }
    const slug = parsed.pathname.replace(/^\//, '');
    let html;
    try { html = await readFile(path.join(directory, slug ? `${slug}.html` : 'index.html'), 'utf8'); }
    catch { try { html = await readFile(path.join(directory, slug, 'index.html'), 'utf8'); } catch { errors.push(`${url}: missing public HTML`); continue; } }
    errors.push(...checkSeoPage(html, url).map(e => `${url}: ${e}`));
  }
  return { pages: urls.length, errors };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkPublicSeo();
  if (result.errors.length) { console.error(result.errors.join('\n')); process.exitCode = 1; }
  else console.log(`SEO release check passed for ${result.pages} sitemap pages.`);
}
