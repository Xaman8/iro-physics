const card = document.getElementById("paperCard");
const href = "paper/iro-envelopes.pdf";
let available = false;
try {
  const response = await fetch(href, { method: "HEAD" });
  available = response.ok;
} catch {
  available = false;
}
if (available) {
  card.classList.add("live");
  card.innerHTML = `
    <h2>Paper</h2>
    <p>The note on envelopes, the toy plant, and the headline test.</p>
    <p><a class="btn primary" href="${href}" download>Download the paper</a></p>`;
} else {
  card.innerHTML = `
    <div class="placeholder">Paper in preparation</div>
    <h2>The paper is not in the repository yet</h2>
    <p>Add <code>paper/iro-envelopes.pdf</code> and the download appears here on the next deploy. Nothing else on the page has to change.</p>`;
}
