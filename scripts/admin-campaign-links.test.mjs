import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);

test('admin dashboard includes a platform campaign link builder', async () => {
  const [html, js] = await Promise.all([
    readFile(new URL('admin-analytics.html', root), 'utf8'),
    readFile(new URL('admin-analytics.js', root), 'utf8'),
  ]);
  assert.match(html, /data-link-source/);
  assert.match(html, /data-link-campaign/);
  assert.match(html, /data-copy-tracking-link/);
  assert.match(js, /utm_source/);
  assert.match(js, /utm_medium/);
  assert.match(js, /utm_campaign/);
  assert.match(js, /utm_content/);
  assert.match(js, /navigator\.clipboard\.writeText/);
});


test('Meta ad link builder uses paid-social UTM tags instead of organic-social', async () => {
  const source = await readFile(new URL('admin-analytics.js', root), 'utf8');
  const builder=source.slice(source.indexOf('function setupCampaignLinks()'),source.indexOf('function setupCreatorInvite()'));
  const values={'[data-link-source]':'meta','[data-link-page]':'/join','[data-link-campaign]':'Oct 8 2026','[data-link-content]':'Video A'};
  const elements=new Map(Object.entries(values).map(([key,value])=>[key,{value,tagName:key.includes('campaign')||key.includes('content')?'INPUT':'SELECT',addEventListener(){}}]));
  for(const key of ['[data-tracking-link]','[data-copy-tracking-link]','[data-link-status]'])elements.set(key,{textContent:'',addEventListener(){}});
  vm.runInNewContext(builder+';setupCampaignLinks();',{URL,document:{querySelector:key=>elements.get(key)}});
  const url=new URL(elements.get('[data-tracking-link]').textContent);
  assert.equal(url.searchParams.get('utm_source'),'meta');
  assert.equal(url.searchParams.get('utm_medium'),'paid_social');
  assert.equal(url.searchParams.get('utm_campaign'),'oct_8_2026');
  assert.equal(url.searchParams.get('utm_content'),'video_a');
});
