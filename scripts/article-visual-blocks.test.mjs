import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
registerHooks({ resolve(specifier, context, nextResolve) {
 if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
  const url = new URL(`${specifier}.ts`, context.parentURL);
  if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
 }
 return nextResolve(specifier, context);
}});
const { markdownToHtmlWithToc } = await import('../src/lib/markdown.ts');
const { splitAfterFirstSection } = await import('../src/lib/newsletter-inline.ts');
const render = (md,locale='nl') => markdownToHtmlWithToc(md,{editorialBlocks:true,editorialTables:true,locale});
test('day sections preserve text, order, links and independent h2 boundaries',async()=>{
 const {html,toc}=await render('## Aanreis\n\nBy train.\n\n## Dag 1: Reims\n\n**Reims.** Visit [guide](/streken/champagne/).\n\n## Dag 2: Épernay\n\nNext day.','en');
 assert.match(html,/article-practical-heading/);
 assert.match(html,/article-day-stop/);
 assert.match(html,/href="\/en\/streken\/champagne\/"/);
 assert.equal(toc.length,3);
 const halves=splitAfterFirstSection(html);
 assert.ok(halves.head.trim().endsWith('</div>'));
 assert.ok(halves.tail.startsWith('<h2'));
 assert.match(halves.tail,/Next day/);
});
test('tasting cards retain following image and credits, leave introduction and outro outside',async()=>{
 const {html}=await render('## Waar je proeft\n\nIntroduction.\n\n**Domaine A.** By appointment.\n\n<figure><img src="/images/a.jpg" alt="A"><figcaption>Credit</figcaption></figure>\n\n**Domaine B.** Open.\n\nClosing text.');
 assert.equal((html.match(/class="article-address-card"/g)||[]).length,2);
 assert.match(html,/<figcaption>Credit<\/figcaption><\/figure><\/div>/);
 assert.match(html,/Closing text/);
});
test('EN labels, day ranges, reservation panels, and sanitizer work together',async()=>{
 const {html}=await render('## Days 1–2: Villages\n\n**Stop.** Text.\n\n## Reservations\n\n<script>bad()</script>Book [here](/streken/loire/).','en');
 assert.match(html,/article-day-heading/);
 assert.match(html,/article-icon--ticket/);
 assert.doesNotMatch(html,/<script|bad\(\)/);
});
test('ordinary prose and single tasting paragraphs stay unchanged; non-article renderer opts out',async()=>{
 const {html}=await render('## Where to taste\n\n**One house.** Description.\n\n## History\n\n**Wine.** Text.');
 assert.doesNotMatch(html,/article-address-card|article-practical|article-day/);
 const normal=await markdownToHtmlWithToc('## Dag 1: Reims\n\nText.');
 assert.doesNotMatch(normal.html,/article-day/);
});
