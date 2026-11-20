#!/usr/bin/env node
/*
 * Static site builder. No dependencies. Run:  node build.js
 *
 * Reads:   site.json, articles/*.md, pages/*.md
 * Writes:  index.html, article/<slug>/index.html, tag/<tag>/index.html,
 *          tags/, archive/, one folder per page in pages/, 404.html,
 *          articles.json (the article index)
 *
 * Every page is written as <folder>/index.html, so the URLs have no ".html".
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.json'), 'utf8'));
const CFG_BASE = (cfg.basePath || '').replace(/\/+$/, '');
let BASE = ''; // links are written root-relative, then made relative per page in write()

/* ---------- helpers ---------- */
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const isExternal = p => /^(https?:)?\/\//.test(p) || /^(mailto:|tel:|#)/.test(p);
const asset = p => isExternal(p) ? p : BASE + '/' + String(p).replace(/^\/+/, '');
const href = p => (isExternal(p) ? p : BASE + p);
const slugify = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const fmtDate = d => {
  const dt = new Date(d + 'T12:00:00');
  return isNaN(dt) ? d : dt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};
const shortDate = d => {
  const dt = new Date(d + 'T12:00:00');
  return isNaN(dt) ? d : dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

function write(rel, html) {
  // Make every root-relative link relative to this page's depth, so the site
  // works at a domain root, under /repo-name, or from any folder.
  if (rel.endsWith('.html') && rel !== '404.html') {
    const depth = rel.split('/').length - 1;
    const prefix = depth ? '../'.repeat(depth) : './';
    html = html.replace(/(href|src)="\/(?!\/)/g, '$1="' + prefix);
  }
  const full = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, html);
}

/* ---------- front matter + markdown ---------- */
function parseFile(raw) {
  raw = raw.replace(/\r\n/g, '\n');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const meta = {};
  m[1].split('\n').forEach(line => {
    const i = line.indexOf(':');
    if (i < 1) return;
    const key = line.slice(0, i).trim();
    const val = line.slice(i + 1).trim().replace(/^["'](.*)["']$/, '$1');
    meta[key] = val;
  });
  return { meta, body: m[2] };
}

function parseTags(v) {
  if (!v) return [];
  return v.replace(/^\[|\]$/g, '').split(',').map(t => t.trim()).filter(Boolean);
}

function linkUrl(u) {
  u = u.replace(/&amp;/g, '&');
  return esc(u.startsWith('/') ? BASE + u : u);
}

function inline(s) {
  s = esc(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, u) =>
    `<img src="${esc(asset(u.replace(/&amp;/g, '&')))}" alt="${alt}">`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => `<a href="${linkUrl(u)}">${t}</a>`);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  return s;
}

function markdown(src) {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  const startsBlock = l => /^(#{1,4}\s|>|[-*]\s|\d+\.\s|-{3,}$|\*{3,}$)/.test(l);
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = l.match(/^(#{1,4})\s+(.*)$/))) {
      const n = Math.min(m[1].length + 1, 5);
      out.push(`<h${n}>${inline(m[2])}</h${n}>`); i++; continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(l.trim())) { out.push('<hr>'); i++; continue; }
    if (/^>/.test(l)) {
      const buf = [];
      while (i < lines.length && /^>/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      out.push(`<blockquote>${markdown(buf.join('\n'))}</blockquote>`); continue;
    }
    if (/^[-*]\s+/.test(l)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^[-*]\s+/, '')); i++; }
      out.push('<ul>' + items.map(t => `<li>${inline(t)}</li>`).join('') + '</ul>'); continue;
    }
    if (/^\d+\.\s+/.test(l)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) { items.push(lines[i].replace(/^\d+\.\s+/, '')); i++; }
      out.push('<ol>' + items.map(t => `<li>${inline(t)}</li>`).join('') + '</ol>'); continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !(buf.length && startsBlock(lines[i]))) { buf.push(lines[i]); i++; }
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  return out.join('\n');
}

/* ---------- load content ---------- */
const articlesDir = path.join(ROOT, 'articles');
const articles = fs.readdirSync(articlesDir)
  .filter(f => f.endsWith('.md') && !f.startsWith('_'))
  .map(f => {
    const { meta, body } = parseFile(fs.readFileSync(path.join(articlesDir, f), 'utf8'));
    const slug = slugify(meta.slug || f.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, ''));
    return {
      file: f,
      slug,
      title: meta.title || slug,
      date: (meta.date || '').slice(0, 10),
      author: meta.author || '',
      tags: parseTags(meta.tags),
      summary: meta.summary || '',
      image: meta.image || '',
      imageAlt: meta.imageAlt || meta.title || '',
      draft: String(meta.draft).toLowerCase() === 'true',
      html: markdown(body)
    };
  })
  .filter(a => !a.draft);

// newest first; ties broken by filename so the order is stable
articles.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.file < b.file ? 1 : -1));

const pagesDir = path.join(ROOT, 'pages');
const pages = fs.existsSync(pagesDir)
  ? fs.readdirSync(pagesDir).filter(f => f.endsWith('.md')).map(f => {
      const { meta, body } = parseFile(fs.readFileSync(path.join(pagesDir, f), 'utf8'));
      const slug = slugify(f.replace(/\.md$/, ''));
      return { slug, title: meta.title || slug, nav: meta.nav !== 'false', order: Number(meta.order || 50), html: markdown(body) };
    }).sort((a, b) => a.order - b.order)
  : [];

const tagMap = {};
articles.forEach(a => a.tags.forEach(t => { (tagMap[slugify(t)] = tagMap[slugify(t)] || { name: t, list: [] }).list.push(a); }));

/* ---------- template pieces ---------- */
const articleUrl = a => `/article/${a.slug}/`;

function squares() {
  let s = '<svg class="sq" viewBox="0 0 220 78" aria-hidden="true" focusable="false">';
  for (let r = 0; r < 4; r++) for (let c = 0; c < 11; c++) {
    const v = (c * 7 + r * 5 + c * r) % 6;
    const cls = v < 2 ? 'f' : v === 2 ? 'h' : 'o';
    const x = c * 20 + 2, y = r * 19 + 2;
    if (cls === 'h') s += `<rect class="o" x="${x}" y="${y}" width="16" height="16" rx="4"/><rect class="f" x="${x + 1}" y="${y + 8}" width="14" height="7" rx="3"/>`;
    else s += `<rect class="${cls}" x="${x}" y="${y}" width="16" height="16" rx="4"/>`;
  }
  return s + '</svg>';
}

const adLeft = `<div class="ad ad-left"><span class="ad-label">Advertisement</span><b>Advertise Here</b></div>`;
const adRight = `<div class="ad ad-right"><span class="ad-label">Advertisement</span><b>Advertise Here</b></div>`;

function navLinks(section) {
  const items = [
    { id: 'home', label: 'Home', url: '/' },
    { id: 'archive', label: 'Archive', url: '/archive/' },
    { id: 'tags', label: 'Topics', url: '/tags/' },
    ...pages.filter(p => p.nav).map(p => ({ id: p.slug, label: p.title, url: `/${p.slug}/` }))
  ];
  return items.map(i => `<a href="${href(i.url)}"${i.id === section ? ' class="on" aria-current="page"' : ''}>${esc(i.label)}</a>`).join(' <span class="sep">|</span> ');
}

function recentList(list) {
  return '<ul class="plist">' + list.map(a =>
    `<li><a href="${href(articleUrl(a))}">${esc(a.title)}</a><span class="pdate">${esc(shortDate(a.date))}</span></li>`
  ).join('') + '</ul>';
}

function sidebar({ recent, extra = '' }) {
  return `<aside class="side">
  <div class="p-head">Latest Articles</div>
  ${recentList(recent)}
  ${extra}
  <div class="p-head">See also:</div>
  <ul class="plist plain">
    <li><a href="${href('/archive/')}">Full archive</a></li>
    <li><a href="${href('/tags/')}">Browse by topic</a></li>
    ${pages.filter(p => p.nav).map(p => `<li><a href="${href('/' + p.slug + '/')}">${esc(p.title)}</a></li>`).join('')}
  </ul>
  ${adRight}
  <div class="squares">${squares()}</div>
</aside>`;
}

function layout({ title, desc, section, crumbs, center, side, ogImage, isHome }) {
  const fullTitle = isHome ? `${cfg.name} - ${cfg.tagline}` : `${title} - ${cfg.name}`;
  const crumbHtml = ['<a href="' + href('/') + '">home</a>']
    .concat((crumbs || []).map(c => c.url ? `<a href="${href(c.url)}">${esc(c.label)}</a>` : esc(c.label)))
    .join(' &gt;&gt; ');
  const logo = cfg.logo
    ? `<img src="${esc(asset(cfg.logo))}" alt="${cfg.showNameBesideLogo ? '' : esc(cfg.name)}">`
    : '';
  const name = (cfg.showNameBesideLogo || !cfg.logo) ? `<span class="name">${esc(cfg.name)}</span>` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc || cfg.tagline)}">
<meta property="og:site_name" content="${esc(cfg.name)}">
<meta property="og:title" content="${esc(title || cfg.name)}">
<meta property="og:description" content="${esc(desc || cfg.tagline)}">
${ogImage ? `<meta property="og:image" content="${esc(asset(ogImage))}">` : ''}
<meta name="color-scheme" content="light dark">
${cfg.logo ? `<link rel="icon" href="${esc(asset(cfg.logo))}">` : ''}
<script>(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();</script>
<link rel="stylesheet" href="${asset('assets/style.css')}">
</head>
<body>
<div class="page" id="top">
  <div class="swoosh-top" aria-hidden="true"></div>
  <div class="crumb">You are here: &nbsp;&gt;&gt; ${crumbHtml}</div>
  <header class="masthead">
    <a class="brand" href="${href('/')}">${logo}${name}</a>
    <span class="tagline">${esc(cfg.tagline)}</span>
  </header>
  <nav class="nav" aria-label="Main">
    <span class="links">${navLinks(section)}</span>
    <button type="button" class="theme-btn" id="theme-toggle" aria-label="Switch between light and dark mode">Dark mode</button>
  </nav>
  <div class="cols">
    <aside class="left">${adLeft}</aside>
    <main class="center">
${center}
    </main>
    ${side}
  </div>
  <footer class="foot">
    <span><a href="${href('/archive/')}">Archive</a> &nbsp;|&nbsp; <a href="#top">Top of page</a></span>
    <span>Copyright ${new Date().getFullYear()} ${esc(cfg.name)}. All rights reserved.</span>
  </footer>
  <div class="swoosh-bot" aria-hidden="true"></div>
</div>
<script src="${asset('assets/site.js')}"></script>
</body>
</html>
`;
}

const tagLinks = tags => tags.map(t => `<a class="tag" href="${href('/tag/' + slugify(t) + '/')}">${esc(t)}</a>`).join(' ');

function articleRows(list) {
  return '<table class="rows"><tbody>' + list.map(a =>
    `<tr><td class="d">${esc(shortDate(a.date))}</td><td><a href="${href(articleUrl(a))}">${esc(a.title)}</a>${a.tags.length ? `<div class="meta">${tagLinks(a.tags)}</div>` : ''}</td></tr>`
  ).join('') + '</tbody></table>';
}

/* ---------- clean old output ---------- */
['article', 'tag', 'tags', 'archive'].forEach(d => fs.rmSync(path.join(ROOT, d), { recursive: true, force: true }));
pages.forEach(p => fs.rmSync(path.join(ROOT, p.slug), { recursive: true, force: true }));

/* ---------- home ---------- */
const featured = articles[0];
const others = articles.slice(1, 7);
let homeCenter = `<h1 class="welcome">Welcome to ${esc(cfg.name)}</h1>\n`;
if (featured) {
  homeCenter += `<div class="kicker">&gt;&gt; Latest Article</div>
<article class="feature">
  ${featured.image ? `<a href="${href(articleUrl(featured))}"><img src="${esc(asset(featured.image))}" alt="${esc(featured.imageAlt)}"></a>` : ''}
  <h2><a href="${href(articleUrl(featured))}">${esc(featured.title)}</a></h2>
  <div class="meta">${featured.author ? 'By ' + esc(featured.author) + ' &nbsp;|&nbsp; ' : ''}${esc(fmtDate(featured.date))}</div>
  ${featured.summary ? `<p class="sum">${esc(featured.summary)}</p>` : ''}
  <p class="more">&gt;&gt; <a href="${href(articleUrl(featured))}">Read the full article</a></p>
</article>`;
} else {
  homeCenter += `<p>No articles yet. Add a Markdown file to the <code>articles</code> folder and run <code>node build.js</code>.</p>`;
}
write('index.html', layout({
  title: cfg.name, desc: cfg.tagline, section: 'home', isHome: true,
  ogImage: featured && featured.image, center: homeCenter,
  side: sidebar({ recent: others })
}));

/* ---------- articles ---------- */
articles.forEach(a => {
  const recent = articles.filter(x => x !== a).slice(0, 6);
  const center = `<article class="story">
  <h1>${esc(a.title)}</h1>
  <div class="byline">${a.author ? 'By ' + esc(a.author) + ' &nbsp;|&nbsp; ' : ''}${esc(fmtDate(a.date))}</div>
  ${a.tags.length ? `<div class="tags">Filed under: ${tagLinks(a.tags)}</div>` : ''}
  ${a.image ? `<figure><img src="${esc(asset(a.image))}" alt="${esc(a.imageAlt)}"></figure>` : ''}
  <div class="body">
${a.html}
  </div>
  <p class="back">&gt;&gt; <a href="${href('/')}">Back to the front page</a> &nbsp;|&nbsp; <a href="#top">top of page</a></p>
</article>`;
  write(`article/${a.slug}/index.html`, layout({
    title: a.title, desc: a.summary, section: 'article',
    crumbs: [{ label: 'articles', url: '/archive/' }, { label: a.title }],
    ogImage: a.image, center, side: sidebar({ recent })
  }));
});

/* ---------- archive, topics ---------- */
write('archive/index.html', layout({
  title: 'Archive', desc: 'All articles, newest first.', section: 'archive',
  crumbs: [{ label: 'archive' }],
  center: `<h1 class="pagetitle">Archive</h1>\n<p class="meta">${articles.length} article${articles.length === 1 ? '' : 's'}, newest first.</p>\n${articleRows(articles)}`,
  side: sidebar({ recent: articles.slice(0, 6) })
}));

const tagKeys = Object.keys(tagMap).sort();
write('tags/index.html', layout({
  title: 'Topics', desc: 'Browse articles by topic.', section: 'tags',
  crumbs: [{ label: 'topics' }],
  center: `<h1 class="pagetitle">Topics</h1>\n<ul class="taglist">${tagKeys.map(k =>
    `<li><a href="${href('/tag/' + k + '/')}">${esc(tagMap[k].name)}</a> <span class="meta">(${tagMap[k].list.length})</span></li>`).join('')}</ul>`,
  side: sidebar({ recent: articles.slice(0, 6) })
}));

tagKeys.forEach(k => {
  const t = tagMap[k];
  write(`tag/${k}/index.html`, layout({
    title: `Topic: ${t.name}`, desc: `Articles tagged ${t.name}.`, section: 'tags',
    crumbs: [{ label: 'topics', url: '/tags/' }, { label: t.name }],
    center: `<h1 class="pagetitle">Topic: ${esc(t.name)}</h1>\n${articleRows(t.list)}`,
    side: sidebar({ recent: articles.slice(0, 6) })
  }));
});

/* ---------- static pages (about, contact, ...) ---------- */
pages.forEach(p => {
  const html = p.html.replace(/\{\{email\}\}/g, esc(cfg.contactEmail || '')).replace(/\{\{name\}\}/g, esc(cfg.name));
  write(`${p.slug}/index.html`, layout({
    title: p.title, section: p.slug, crumbs: [{ label: p.title.toLowerCase() }],
    center: `<h1 class="pagetitle">${esc(p.title)}</h1>\n<div class="body">${html}</div>`,
    side: sidebar({ recent: articles.slice(0, 6) })
  }));
});

/* ---------- 404 ---------- */
// 404 can be served from any path, so it needs absolute links (uses basePath)
BASE = CFG_BASE;
write('404.html', layout({
  title: 'Page not found', section: '', crumbs: [{ label: 'page not found' }],
  center: `<h1 class="pagetitle">Page not found</h1>\n<p>The page you asked for isn't here. Try the <a href="${href('/')}">front page</a> or the <a href="${href('/archive/')}">archive</a>.</p>`,
  side: sidebar({ recent: articles.slice(0, 6) })
}));

/* ---------- article index ---------- */
write('articles.json', JSON.stringify(articles.map(a => ({
  slug: a.slug, title: a.title, date: a.date, author: a.author, tags: a.tags,
  summary: a.summary, image: a.image, url: CFG_BASE + articleUrl(a)
})), null, 2) + '\n');

console.log(`Built ${articles.length} article(s), ${tagKeys.length} topic(s), ${pages.length} page(s).`);
