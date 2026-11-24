// Builds the build log from Markdown. No dependencies: run `npm run build` (or `node tools/build-log.mjs`).
//
//   log/posts/<slug>.md   one post: front matter, then Markdown
//   log/index.html        written: the list of posts, newest first
//   log/<slug>/index.html written: one page per post, at /log/<slug>/
//   log/feed.xml          written: Atom feed
//   index.html            the line between <!-- log:latest --> markers points to the newest post
//
// Front matter keys: title, date (YYYY-MM-DD), summary, and optionally product + product_url,
// and draft: true to keep a post out of the build.
//
// Markdown: paragraphs, ## and ### headings, **bold**, *italic*, `code`, [links](url),
// - and 1. lists, > quotes, --- rules, and images on their own line:
//   ![Alt text](/img/photo.webp "Optional caption")
// A line that starts with < is passed through as HTML.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SITE = "https://phorbie.com";
const POSTS = path.join(ROOT, "log", "posts");
const OUT = path.join(ROOT, "log");

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longDate = (d) => { const [y, m, day] = d.split("-").map(Number); return `${MONTHS[m - 1]} ${day}, ${y}`; };
const shortDate = (d) => { const [y, m, day] = d.split("-").map(Number); return `${MONTHS[m - 1].slice(0, 3)} ${day}, ${y}`; };

// ---------- Markdown ----------
function inline(s) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(esc(c)) - 1}\u0000`);
  s = esc(s);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => {
    const ext = /^https?:/.test(u) && !u.startsWith(SITE);
    return `<a href="${u}"${ext ? ' target="_blank" rel="noopener"' : ""}>${t}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*\w])\*([^*]+)\*(?!\w)/g, "$1<em>$2</em>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}

function webpSize(file) {
  try {
    const b = fs.readFileSync(file);
    if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WEBP") return null;
    const kind = b.toString("ascii", 12, 16);
    if (kind === "VP8X") return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
    if (kind === "VP8 ") return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    if (kind === "VP8L") { const v = b.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]; }
  } catch {}
  return null;
}

function figure(alt, src, caption) {
  const local = src.startsWith("/") ? path.join(ROOT, src) : null;
  let srcset = "", dims = "";
  if (local && /\.webp$/.test(src)) {
    const sizes = [600, 900].filter((w) => fs.existsSync(local.replace(/\.webp$/, `-${w}.webp`)));
    const wh = webpSize(local);
    if (sizes.length && wh) srcset = ` srcset="${sizes.map((w) => `${src.replace(/\.webp$/, `-${w}.webp`)} ${w}w`).join(", ")}, ${src} ${wh[0]}w" sizes="(max-width: 760px) calc(100vw - 40px), 680px"`;
    if (wh) dims = ` width="${wh[0]}" height="${wh[1]}"`;
  }
  return `<figure><img src="${src}"${srcset} alt="${esc(alt)}"${dims} loading="lazy">${caption ? `<figcaption>${inline(caption)}</figcaption>` : ""}</figure>`;
}

function markdown(md) {
  const out = [];
  for (const block of md.trim().split(/\n\s*\n/)) {
    const b = block.trim();
    let m;
    if (b.startsWith("<")) out.push(b);
    else if ((m = b.match(/^(#{2,3})\s+(.+)$/))) out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`);
    else if ((m = b.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/))) out.push(figure(m[1], m[2], m[3]));
    else if (/^-{3,}$/.test(b)) out.push("<hr>");
    else if (/^>\s?/.test(b)) out.push(`<blockquote><p>${inline(b.replace(/^>\s?/gm, "").replace(/\n/g, " "))}</p></blockquote>`);
    else if (/^[-*]\s/.test(b)) out.push(`<ul>${b.split(/\n(?=[-*]\s)/).map((l) => `<li>${inline(l.replace(/^[-*]\s+/, "").replace(/\n\s*/g, " "))}</li>`).join("")}</ul>`);
    else if (/^\d+\.\s/.test(b)) out.push(`<ol>${b.split(/\n(?=\d+\.\s)/).map((l) => `<li>${inline(l.replace(/^\d+\.\s+/, "").replace(/\n\s*/g, " "))}</li>`).join("")}</ol>`);
    else out.push(`<p>${inline(b.replace(/\n/g, " "))}</p>`);
  }
  return out.join("\n");
}

function readPost(file) {
  const raw = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${path.basename(file)}: missing front matter`);
  const meta = Object.fromEntries(m[1].split("\n").filter((l) => l.includes(":")).map((l) => {
    const i = l.indexOf(":"); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"(.*)"$/, "$1")];
  }));
  for (const k of ["title", "date", "summary"]) if (!meta[k]) throw new Error(`${path.basename(file)}: front matter needs ${k}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date)) throw new Error(`${path.basename(file)}: date must be YYYY-MM-DD`);
  return { ...meta, slug: path.basename(file, ".md"), body: markdown(m[2]), draft: meta.draft === "true" };
}

// ---------- Site chrome, taken from the home page so it stays in sync ----------
const home = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const absolute = (html) => html.replace(/(href|src)="(?!https?:|mailto:|\/|data:)([^"]*)"/g, (_, a, u) => {
  if (u.startsWith("#")) return `${a}="/${u}"`;
  if (u === "index.html") return `${a}="/"`;
  return `${a}="/${u}"`;
});
const grab = (re, name) => { const m = home.match(re); if (!m) throw new Error(`index.html: no ${name}`); return m[0]; };
const header = absolute(grab(/<header class="site-head">[\s\S]*?<\/header>/, "site header"))
  .replace('<a href="/log/">', '<a href="/log/" aria-current="page">');
const footer = absolute(grab(/<footer class="site-foot">[\s\S]*?<\/footer>/, "site footer"));
const scripts = absolute(grab(/<script>document\.querySelectorAll\("\.y"\)[\s\S]*?(?=\n<\/body>)/, "footer scripts"));

function page({ title, description, canonical, body, extraHead = "" }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${canonical}">
  <link rel="alternate" type="application/atom+xml" title="Phorbie build log" href="/log/feed.xml">
  <link rel="icon" href="/favicon.ico" sizes="32x32">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="preload" href="/fonts/ibm-plex-sans-400-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/fonts/ibm-plex-sans-700-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/styles.css">${extraHead}
</head>
<body>
  ${header}
  <main class="bench">
${body}
  </main>

  ${footer}
  ${scripts}
</body>
</html>
`;
}

// ---------- Build ----------
const posts = fs.readdirSync(POSTS).filter((f) => f.endsWith(".md")).map((f) => readPost(path.join(POSTS, f)))
  .filter((p) => !p.draft).sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));

// Clear old post folders so a renamed or removed post doesn't linger
for (const d of fs.readdirSync(OUT, { withFileTypes: true })) {
  if (d.isDirectory() && d.name !== "posts" && fs.existsSync(path.join(OUT, d.name, "index.html"))) fs.rmSync(path.join(OUT, d.name), { recursive: true });
}

for (const [i, p] of posts.entries()) {
  const older = posts[i + 1], newer = posts[i - 1];
  const product = p.product && p.product_url
    ? `<p class="post-product"><a class="btn btn-primary" href="${esc(p.product_url)}">${esc(p.product)} <span aria-hidden="true">→</span></a></p>` : "";
  const nav = [newer && `<a href="/log/${newer.slug}/"><span>Newer</span>${esc(newer.title)}</a>`, older && `<a href="/log/${older.slug}/"><span>Older</span>${esc(older.title)}</a>`].filter(Boolean).join("");
  const body = `    <article class="post">
      <div class="wrap post-wrap">
        <header class="post-head">
          <p class="eyebrow"><a href="/log/">Build log</a> · <time datetime="${p.date}">${longDate(p.date)}</time></p>
          <h1>${esc(p.title)}</h1>
          <p class="lede">${esc(p.summary)}</p>
        </header>
        <div class="prose">
${p.body}
        </div>
        <footer class="post-foot">
          ${product}
          ${nav ? `<nav class="post-nav" aria-label="More from the build log">${nav}</nav>` : `<p><a href="/log/">All build log posts</a></p>`}
        </footer>
      </div>
    </article>`;
  fs.mkdirSync(path.join(OUT, p.slug), { recursive: true });
  fs.writeFileSync(path.join(OUT, p.slug, "index.html"), page({
    title: `${p.title} · Phorbie build log`, description: p.summary, canonical: `${SITE}/log/${p.slug}/`, body,
    extraHead: `\n  <meta property="og:type" content="article">\n  <meta property="og:title" content="${esc(p.title)}">\n  <meta property="og:description" content="${esc(p.summary)}">`,
  }));
}

const list = posts.map((p) => `          <li><span class="log-id"><time datetime="${p.date}">${shortDate(p.date)}</time></span><div><h2><a href="/log/${p.slug}/">${esc(p.title)}</a></h2><p>${esc(p.summary)}</p></div>${p.product ? `<span class="log-tag">${esc(p.product)}</span>` : ""}</li>`).join("\n");
fs.writeFileSync(path.join(OUT, "index.html"), page({
  title: "Build log · Phorbie", description: "What we're making, what changed, and what didn't work.", canonical: `${SITE}/log/`,
  body: `    <section class="log-home">
      <div class="wrap">
        <div class="section-head">
          <p class="eyebrow">Build log</p>
          <h1>From the bench.</h1>
          <p class="lede">What we're making, what changed, and what didn't work.</p>
        </div>
        <ol class="log log-posts">
${list}
        </ol>
        <p class="log-feed"><a href="/log/feed.xml">Follow along with RSS</a></p>
      </div>
    </section>`,
}));

const updated = posts[0] ? `${posts[0].date}T00:00:00Z` : new Date().toISOString();
fs.writeFileSync(path.join(OUT, "feed.xml"), `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Phorbie build log</title>
  <subtitle>What we're making, what changed, and what didn't work.</subtitle>
  <link href="${SITE}/log/"/>
  <link rel="self" href="${SITE}/log/feed.xml"/>
  <id>${SITE}/log/</id>
  <updated>${updated}</updated>
  <author><name>Phorbie</name></author>
${posts.map((p) => `  <entry>
    <title>${esc(p.title)}</title>
    <link href="${SITE}/log/${p.slug}/"/>
    <id>${SITE}/log/${p.slug}/</id>
    <updated>${p.date}T00:00:00Z</updated>
    <summary>${esc(p.summary)}</summary>
    <content type="html">${esc(p.body.replace(/(src|href)="\//g, `$1="${SITE}/`))}</content>
  </entry>`).join("\n")}
</feed>
`);

// The home page's pointer to the newest post
const latest = posts[0];
const marker = /<!-- log:latest -->[\s\S]*?<!-- \/log:latest -->/;
if (latest && marker.test(home)) {
  const line = `<!-- log:latest --><p class="log-latest"><span class="eyebrow">From the build log</span> <a href="/log/${latest.slug}/">${esc(latest.title)} <span aria-hidden="true">→</span></a></p><!-- /log:latest -->`;
  const next = home.replace(marker, line);
  if (next !== home) fs.writeFileSync(path.join(ROOT, "index.html"), next);
}

fs.writeFileSync(path.join(OUT, "build-info.txt"), `Built ${new Date().toISOString()} from ${posts.length} post(s).\n`);
console.log(`Build log: ${posts.length} post(s) → /log/`);
