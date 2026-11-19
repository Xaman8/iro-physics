import { mountNest } from "./envelope-tree.js";

mountNest(document.getElementById("nest"), {
  peer: { href: "bench.html", label: "Apparatus" },
});
