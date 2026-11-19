import { renderMarkdown } from "./markdown.js";

const md = await fetch("content/research-questions.md").then((r) => r.text());
const statusRe = /PARTLY ANSWERED|IN PROGRESS|NOT YET TESTED|ANSWERED|DROPPED|ONGOING|OPEN/g;
const badgeClass = {
  "PARTLY ANSWERED": "partly",
  "IN PROGRESS": "progress",
  "NOT YET TESTED": "open",
  OPEN: "open",
  ANSWERED: "answered",
  DROPPED: "open",
  ONGOING: "ongoing",
};
const badgeLabel = {
  "PARTLY ANSWERED": "partly answered",
  "IN PROGRESS": "in progress",
  "NOT YET TESTED": "open",
  OPEN: "open",
  ANSWERED: "answered",
  DROPPED: "dropped",
  ONGOING: "ongoing",
};

function latestStatus(text) {
  let last = null;
  for (const match of text.matchAll(statusRe)) last = match[0];
  return last;
}

const chunks = md.split(/\n(?=\*\*RQ\d+)/);
const intro = renderMarkdown(chunks[0]);
const cards = chunks.slice(1).map((chunk) => {
  const status = latestStatus(chunk);
  const badge = status
    ? `<span class="badge ${badgeClass[status] || "open"}">${badgeLabel[status] || status}</span>`
    : "";
  const html = renderMarkdown(chunk).replace("<p>", `<p>${badge}`);
  return `<section class="rq">${html}</section>`;
}).join("");
document.getElementById("questions").innerHTML = intro + cards;
