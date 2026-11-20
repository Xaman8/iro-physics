import { mountNest } from "./envelope-tree.js?v=20261120";

mountNest(document.getElementById("nest"), {
  peer: { href: "bench.html", label: "Apparatus" },
});
