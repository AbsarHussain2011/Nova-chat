// Small, safe markdown renderer: everything is HTML-escaped first, then a few
// constructs are turned into tags. Only http(s) links are allowed.
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function inline(src) {
  const codes = [];
  let t = esc(src).replace(/`([^`\n]+)`/g, (_, c) => {
    codes.push(c);
    return '\u0000' + (codes.length - 1) + '\u0000';
  });
  t = t
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\s][^*\n]*?)\*(?!\*)/g, '$1<i>$2</i>')
    .replace(/~~([^~\n]+)~~/g, '<s>$1</s>')
    .replace(
      /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => '<code>' + codes[i] + '</code>');
}

export function renderMarkdown(text) {
  const lines = text.split('\n');
  const out = [];
  let list = null; // 'ul' | 'ol'
  let para = [];
  const closePara = () => {
    if (para.length) out.push('<p>' + para.map(inline).join('<br>') + '</p>');
    para = [];
  };
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const line of lines) {
    let m;
    if (!line.trim()) {
      closePara();
      closeList();
    } else if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
      closePara();
      closeList();
      out.push(`<h${m[1].length + 2}>${inline(m[2])}</h${m[1].length + 2}>`);
    } else if (/^\s*([-*_])\1\1+\s*$/.test(line)) {
      closePara();
      closeList();
      out.push('<hr>');
    } else if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) {
      closePara();
      if (list !== 'ul') {
        closeList();
        out.push('<ul>');
        list = 'ul';
      }
      out.push('<li>' + inline(m[1]) + '</li>');
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      closePara();
      if (list !== 'ol') {
        closeList();
        out.push('<ol>');
        list = 'ol';
      }
      out.push('<li>' + inline(m[1]) + '</li>');
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      closePara();
      closeList();
      out.push('<blockquote>' + inline(m[1]) + '</blockquote>');
    } else {
      closeList();
      para.push(line);
    }
  }
  closePara();
  closeList();
  return out.join('');
}
