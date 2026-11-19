function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Math is passed through untouched for KaTeX auto-render: $$...$$, $...$, \(...\), \[...\].
const MATH = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\])/g;

function inline(s) {
  const math = [];
  let t = String(s).replace(MATH, (m) => { math.push(m); return `\u0000${math.length - 1}\u0000`; });
  t = esc(t);
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
  t = t.replace(/\u0000(\d+)\u0000/g, (_, k) => esc(math[Number(k)]));
  return t;
}

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((cell) => cell.trim());
}

function isRule(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

export function renderMarkdown(md) {
  const lines = String(md).replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const buf = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++]);
      if (i < lines.length) i += 1;
      out.push(`<pre><code>${esc(buf.join("\n"))}</code></pre>`);
      continue;
    }
    if (!line.trim()) { i += 1; continue; }
    if (line.trim().startsWith("$$")) {
      const buf = [line];
      let closed = line.trim().length > 2 && line.trim().endsWith("$$");
      i += 1;
      while (!closed && i < lines.length) { buf.push(lines[i]); closed = lines[i].trim().endsWith("$$"); i += 1; }
      out.push(`<div class="math-display">${esc(buf.join("\n"))}</div>`);
      continue;
    }
    if (/^---+$/.test(line.trim())) { out.push("<hr>"); i += 1; continue; }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }
    if (line.startsWith("> ")) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith("> ")) buf.push(lines[i++].slice(2));
      out.push(`<blockquote><p>${inline(buf.join(" "))}</p></blockquote>`);
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && isRule(lines[i + 1])) {
      const header = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(splitRow(lines[i++]));
      const head = "<tr>" + header.map((c) => `<th>${inline(c)}</th>`).join("") + "</tr>";
      const body = rows.map((row) => "<tr>" + row.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>").join("");
      out.push(`<div class="table-scroll"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>`);
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ""));
      out.push("<ul>" + items.map((item) => `<li>${inline(item)}</li>`).join("") + "</ul>");
      continue;
    }
    const buf = [line];
    i += 1;
    while (
      i < lines.length && lines[i].trim() &&
      !lines[i].startsWith("#") && !lines[i].startsWith(">") && !lines[i].startsWith("```") &&
      !lines[i].trim().startsWith("$$") &&
      !/^\s*[-*]\s+/.test(lines[i]) && !(lines[i].includes("|") && i + 1 < lines.length && isRule(lines[i + 1]))
    ) buf.push(lines[i++]);
    out.push(`<p>${inline(buf.join(" "))}</p>`);
  }
  return out.join("\n");
}
