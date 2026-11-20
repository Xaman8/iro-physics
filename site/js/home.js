import { text } from "./format.js?v=20261120";

const data = await fetch("data/captions.json").then((r) => r.json());
const root = document.getElementById("story");

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function caption(fig) {
  let html = esc(fig.caption);
  for (const link of fig.links || []) {
    html = html.replace(esc(link.text), `<a href="${link.href}">${esc(link.text)}</a>`);
  }
  return html;
}

root.innerHTML = data.figures.map((fig, i) => {
  const stats = (fig.stats || []).map((row) =>
    `<div><dt>${esc(row.label)}</dt><dd>${text(row.value)}</dd></div>`
  ).join("");
  const link = fig.link
    ? `<p class="step-link"><a href="${fig.link.href}">${esc(fig.link.label)}</a></p>`
    : "";
  return `<figure class="plate">
    <img src="${fig.file}" alt="${esc(fig.title)}">
    <figcaption>
      <h2>${i + 1}. ${esc(fig.title)}</h2>
      <p>${caption(fig)}</p>
      ${link}
      ${stats ? `<dl class="stats">${stats}</dl>` : ""}
    </figcaption>
  </figure>`;
}).join("");
