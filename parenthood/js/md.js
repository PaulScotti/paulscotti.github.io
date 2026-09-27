// Safe markdown-lite → HTML. Input is escaped first; only a fixed set of patterns become markup.
export function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function inline(s, ctx) {
  // attach citation markers to the preceding word: "text [1]." -> "text[1]."
  let out = esc(String(s).replace(/\s+\[(\d+(?:\s*,\s*\d+)*)\](?!\()/g, '[$1]'));
  // links: [text](https://...)
  out = out.replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, (_, text, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`);
  // citations: [1] or [1, 3]
  out = out.replace(/\[(\d+(?:\s*,\s*\d+)*)\](?!\()/g, (_, nums) => nums.split(',').map((n) => {
    const k = Number(n.trim());
    return `<a class="cite" href="#" data-cite="${k}" data-scope="${esc(ctx?.scope || '')}" aria-label="source ${k}">${k}</a>`;
  }).join(''));
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>');
  return out;
}

export function md(text = '', ctx = {}) {
  const blocks = String(text).replace(/\r\n?/g, '\n').trim().split(/\n\s*\n/);
  return blocks.map((block) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length && lines.every((l) => /^[-•]\s+/.test(l))) {
      return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^[-•]\s+/, ''), ctx)}</li>`).join('')}</ul>`;
    }
    if (lines.length && lines.every((l) => /^\d+[.)]\s+/.test(l))) {
      return `<ol>${lines.map((l) => `<li>${inline(l.replace(/^\d+[.)]\s+/, ''), ctx)}</li>`).join('')}</ol>`;
    }
    // mixed block: paragraph lines, then a list
    const firstList = lines.findIndex((l) => /^[-•]\s+/.test(l));
    if (firstList > 0 && lines.slice(firstList).every((l) => /^[-•]\s+/.test(l))) {
      return `<p>${inline(lines.slice(0, firstList).join(' '), ctx)}</p><ul>${lines.slice(firstList).map((l) => `<li>${inline(l.replace(/^[-•]\s+/, ''), ctx)}</li>`).join('')}</ul>`;
    }
    return `<p>${inline(lines.join(' '), ctx)}</p>`;
  }).join('');
}

export function inlineOnly(text = '', ctx = {}) {
  return inline(String(text).replace(/\s*\n\s*/g, ' '), ctx);
}

/** Plain text (for copying, titles, aria). */
export function plain(text = '') {
  return String(text)
    .replace(/\[(\d+(?:\s*,\s*\d+)*)\](?!\()/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
