import { renderMarkdown } from "./markdown.js";

const docs = [
  ["vocabulary", "Vocabulary", "content/vocabulary.md"],
  ["described", "Described model", "content/described-model.md"],
  ["formal", "Formal model", "content/formal-model.md"],
];
const tabs = document.getElementById("tabs");
const view = document.getElementById("doc");
const cache = new Map();
tabs.innerHTML = docs.map(([id, label], i) =>
  `<button class="btn" type="button" data-doc="${id}" aria-selected="${i === 0 ? "true" : "false"}">${label}</button>`
).join("");

function markProposed(html) {
  return html.replaceAll("[PROPOSED]", '<span class="badge draft">proposed</span>');
}

async function show(id) {
  for (const button of tabs.querySelectorAll("button")) {
    button.setAttribute("aria-selected", button.dataset.doc === id ? "true" : "false");
  }
  if (!cache.has(id)) {
    const doc = docs.find((row) => row[0] === id);
    const md = await fetch(doc[2]).then((r) => r.text());
    cache.set(id, markProposed(renderMarkdown(md)));
  }
  view.innerHTML = cache.get(id);
  typeset(view);
}

function typeset(el) {
  if (typeof window.renderMathInElement !== "function") return;
  window.renderMathInElement(el, {
    delimiters: [
      { left: "$$", right: "$$", display: true },
      { left: "\\[", right: "\\]", display: true },
      { left: "\\(", right: "\\)", display: false },
      { left: "$", right: "$", display: false },
    ],
    throwOnError: false,
  });
}

function tabFromHash() {
  const id = location.hash.replace("#", "");
  return docs.some((row) => row[0] === id) ? id : "vocabulary";
}

tabs.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (button) location.hash = button.dataset.doc;
});
window.addEventListener("hashchange", () => show(tabFromHash()));
show(tabFromHash());
