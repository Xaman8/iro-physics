import { text } from "./format.js";

const data = await fetch("data/captions.json").then((r) => r.json());
const root = document.getElementById("story");
root.innerHTML = data.figures.map((fig, i) => {
  const stats = (fig.stats || []).map((row) =>
    `<div><dt>${row.label}</dt><dd>${text(row.value)}</dd></div>`
  ).join("");
  return `<figure class="plate">
    <img src="${fig.file}" alt="${fig.title}">
    <figcaption>
      <h2>${i + 1}. ${fig.title}</h2>
      <p>${fig.caption}</p>
      ${stats ? `<dl class="stats">${stats}</dl>` : ""}
    </figcaption>
  </figure>`;
}).join("");
