const LINKS = [
  ["index.html", "Overview"],
  ["questions.html", "(1) Research Questions"],
  ["hypotheses.html", "(2) Hypotheses"],
  ["model.html", "(3) Model"],
  ["design.html", "(4) Experimental Design"],
  ["bench.html", "Apparatus"],
  ["results.html", "Results"],
  ["explorer.html", "Envelope explorer"],
  ["paper.html", "Paper"],
];

const header = document.querySelector("header.top");
if (header) {
  const here = header.dataset.page;
  header.innerHTML = `<a class="brand" href="index.html">IRO <span>Physics</span></a><nav>${
    LINKS.map(([href, label]) => `<a href="${href}"${href === here ? ' aria-current="page"' : ""}>${label}</a>`).join("")
  }</nav>`;
}
