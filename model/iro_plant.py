"""IRO toy plant: ports, bonds, couplings, systems, entropy generation.

Vocabulary follows 'Grounding Industrial System Ontologies in Physics'
(draft 2026.10.27) and the IRO 2.0 vocabulary (BFO_IOF_IRO v15). See
VOCABULARY.md. Terms marked [proposed] are listed there under
'Proposed vocabulary additions'.

Model: a lumped, linear, per-unit bond-graph network.
  * Every Port carries an effort and a flow; power = effort x flow.
    Each port has one storage element (capacitance C) and a designed loss
    (conductance g_loss to the reference effort).
  * A Bond is the power link between two ports of the same asset
    (e.g. the pump's mechanical port to its fluid port).
  * A Coupling is the energy pathway from a source port on one asset to a
    target port on another asset, with resistance R and inertance L
    (L > 0 gives the coupling a resonance), a transfer mechanism, a
    topology and an intent (desired / parasitic coupling).
  * Entropy generation (per asset, per coupling, per system) is dissipated
    power divided by the reference temperature T0 (per unit), the
    Gouy-Stodola reading used in the paper (exergy destruction = T0 x
    entropy generation).
"""
from __future__ import annotations
import numpy as np
from dataclasses import dataclass, field

T0 = 1.0  # reference (ambient) temperature, per unit

# ----------------------------------------------------------------- systems
# System nesting (paper R1 second layer: systems, components, ports,
# structures and media). Each leaf system is an asset (physical system)
# with its own operating envelope. Parent -> children.
SYSTEM_TREE = {
    "PLANT": ["UTIL", "PROC", "ELEC"],
    "UTIL": ["SYS_A", "SYS_B"],
    "PROC": ["SYS_C"],
    "ELEC": ["SYS_D"],
}
SYSTEM_NAME = {
    "SYS_A": "Pumping system (A)",
    "SYS_B": "Heat-exchange system (B)",
    "SYS_C": "Reactor system (C)",
    "SYS_D": "Electrical supply system (D)",
    "UTIL": "Cooling-water utility", "PROC": "Process", "ELEC": "Electrical",
    "PLANT": "Plant",
}


def system_parent(s):
    for p, ch in SYSTEM_TREE.items():
        if s in ch:
            return p
    return None


def system_ancestors(s):
    out = [s]
    while system_parent(out[-1]):
        out.append(system_parent(out[-1]))
    return out


# ----------------------------------------------------------------- assets
@dataclass
class Asset:
    tag: str          # maintainable item tag
    name: str
    system: str       # leaf system that contains it
    xy: tuple         # plant coordinates, m
    thermal_sensitive: bool = False  # operating context moves its Safe limit


ASSETS = [
    Asset("XF1", "Transformer", "SYS_D", (0, 0), True),
    Asset("BUS1", "MCC bus", "SYS_D", (10, 0)),
    Asset("VFD1", "Variable-frequency drive", "SYS_D", (14, 4), True),
    Asset("M1", "Pump motor", "SYS_A", (40, 20), True),
    Asset("P1", "Centrifugal pump", "SYS_A", (42, 20)),
    Asset("V1", "Recirculation valve", "SYS_A", (44, 23)),
    Asset("HX1", "Shell-and-tube heat exchanger (tube bundle)", "SYS_B", (95, 30), True),
    Asset("CV1", "Cooling-water control valve", "SYS_B", (100, 30)),
    Asset("R1", "Reactor jacket", "SYS_C", (140, 60), True),
    Asset("AG1", "Agitator", "SYS_C", (140, 64)),
    Asset("BRG1", "Agitator bearing", "SYS_C", (140, 66), True),
]
ASSET = {a.tag: a for a in ASSETS}

# ----------------------------------------------------------------- ports
# (port id, port type, C storage, g_loss designed loss)
PORT_TYPES = ("electrical", "mechanical", "fluid", "thermal")
PORTS = [
    ("XF1.electrical", "electrical", 0.02, 0.02),
    ("XF1.thermal", "thermal", 400.0, 0.5),
    ("BUS1.electrical", "electrical", 0.02, 0.05),
    ("VFD1.electrical", "electrical", 0.02, 0.02),
    ("VFD1.thermal", "thermal", 100.0, 1.0),
    ("M1.electrical", "electrical", 0.02, 0.02),
    ("M1.mechanical", "mechanical", 1.0, 0.1),
    ("M1.thermal", "thermal", 200.0, 1.0),
    ("P1.mechanical", "mechanical", 0.5, 0.1),
    ("P1.fluid", "fluid", 0.1, 0.01),
    ("V1.fluid", "fluid", 0.05, 0.2),
    ("HX1.fluid", "fluid", 0.15, 0.15),     # tube-bundle damping
    ("HX1.thermal", "thermal", 600.0, 0.3),
    ("CV1.fluid", "fluid", 0.05, 0.1),
    ("R1.fluid", "fluid", 0.2, 0.1),
    ("R1.thermal", "thermal", 1500.0, 0.4),
    ("AG1.electrical", "electrical", 0.02, 0.02),   # integral drive motor terminals
    ("AG1.mechanical", "mechanical", 0.8, 0.1),
    ("AG1.fluid", "fluid", 0.1, 0.05),              # wetted impeller face
    ("BRG1.mechanical", "mechanical", 0.1, 0.2),
    ("BRG1.thermal", "thermal", 50.0, 0.5),
]
PORT_IDS = [p[0] for p in PORTS]
PIDX = {p: i for i, p in enumerate(PORT_IDS)}


def port_asset(pid):
    return pid.split(".")[0]


def port_type(pid):
    return pid.split(".")[1]


# --------------------------------------------------- bonds and couplings
@dataclass
class Link:
    source: str
    target: str
    R: float
    L: float = 0.0
    kind: str = "coupling"          # 'bond' (inside one asset) or 'coupling'
    mechanism: str = ""             # transfer mechanism
    topology: str = "direct port coupling"
    intent: str = "desired"         # desired / parasitic
    length_m: float = 0.0           # property of the coupling (medium)

    @property
    def cid(self):
        return f"{self.source}->{self.target}"


LINKS = [
    # grid side
    Link("XF1.electrical", "BUS1.electrical", 0.02, 0.001, mechanism="electrical", length_m=10),
    Link("XF1.electrical", "XF1.thermal", 2.0, kind="bond", mechanism="electrical->thermal (winding loss)"),
    Link("BUS1.electrical", "VFD1.electrical", 0.05, 0.002, mechanism="electrical", length_m=25),
    Link("VFD1.electrical", "VFD1.thermal", 1.5, kind="bond", mechanism="electrical->thermal (switching loss)"),
    Link("VFD1.electrical", "M1.electrical", 0.05, 0.002, mechanism="electrical", length_m=40),
    Link("BUS1.electrical", "AG1.electrical", 0.05, 0.002, mechanism="electrical", length_m=130),
    # pumping system A
    Link("M1.electrical", "M1.mechanical", 0.1, kind="bond", mechanism="electrical->mechanical (gyrator)"),
    Link("M1.electrical", "M1.thermal", 3.0, kind="bond", mechanism="electrical->thermal (copper loss)"),
    Link("M1.mechanical", "P1.mechanical", 0.05, 0.05, mechanism="structure-borne (shaft coupling)", length_m=1),
    Link("P1.mechanical", "P1.fluid", 6.0, kind="bond", mechanism="mechanical->fluid (impeller)"),
    Link("P1.fluid", "V1.fluid", 3.0, 0.02, mechanism="fluid", length_m=3),
    # A -> B: 60 m cooling-water line; inertance gives a resonance
    Link("P1.fluid", "HX1.fluid", 0.1, 0.8, mechanism="fluid", length_m=60),
    # heat-exchange system B
    Link("HX1.fluid", "HX1.thermal", 8.0, kind="bond", mechanism="fluid->thermal (convection)"),
    Link("HX1.fluid", "CV1.fluid", 0.5, 0.3, mechanism="fluid", length_m=5),
    # B -> C
    Link("HX1.thermal", "R1.thermal", 2.0, mechanism="convection (process loop)", length_m=80),
    Link("CV1.fluid", "R1.fluid", 0.4, 0.3, mechanism="fluid", length_m=50),
    # reactor system C
    Link("R1.fluid", "R1.thermal", 1.5, kind="bond", mechanism="fluid->thermal (jacket convection)"),
    Link("R1.thermal", "BRG1.thermal", 5.0, mechanism="conduction", intent="parasitic", topology="structure-borne coupling", length_m=2),
    Link("R1.fluid", "AG1.fluid", 1.0, mechanism="fluid (fluid loading on impeller)", intent="parasitic", length_m=1),
    Link("AG1.electrical", "AG1.mechanical", 0.25, kind="bond", mechanism="electrical->mechanical (drive motor)"),
    Link("AG1.fluid", "AG1.mechanical", 1.0, kind="bond", mechanism="fluid->mechanical (impeller)"),
    Link("AG1.mechanical", "BRG1.mechanical", 0.2, 0.02, mechanism="structure-borne (shaft)", length_m=0.5),
]
GRID_PORT, GRID_G, GRID_E = "XF1.electrical", 20.0, 1.0      # external entity
PROCESS_HEAT_PORT, PROCESS_HEAT = "R1.thermal", 0.5         # process heat load


def link_systems(l):
    return ASSET[port_asset(l.source)].system, ASSET[port_asset(l.target)].system


def is_cross_system(l):
    a, b = link_systems(l)
    return l.kind == "coupling" and a != b


# --------------------------------------------------------------- the model
def check_same_domain_couplings():
    """Locked decision: domain conversion lives inside the asset (bonds);
    every coupling links two ports of the same domain."""
    bad = [l.cid for l in LINKS if l.kind == "coupling" and port_type(l.source) != port_type(l.target)]
    if bad:
        raise ValueError(f"couplings across domains: {bad}")


check_same_domain_couplings()


class Plant:
    """Linear state-space model. States: port efforts, then the flows of
    couplings/bonds with inertance (L > 0)."""

    def __init__(self, link_scale=None, port_scale=None):
        """link_scale: cid -> (fR, fL); port_scale: port -> (fC, fg).
        Used to make the 'true' plant differ from the design model."""
        link_scale = link_scale or {}
        port_scale = port_scale or {}
        self.n = len(PORT_IDS)
        self.C = np.array([p[2] for p in PORTS], float)
        self.gl = np.array([p[3] for p in PORTS], float)
        for i, pid in enumerate(PORT_IDS):
            if pid in port_scale:
                self.C[i] *= port_scale[pid][0]
                self.gl[i] *= port_scale[pid][1]
        self.links = [Link(**{**l.__dict__}) for l in LINKS]
        for l in self.links:
            if l.cid in link_scale:
                l.R *= link_scale[l.cid][0]
                l.L *= link_scale[l.cid][1]
        self.Llinks = [k for k, l in enumerate(self.links) if l.L > 0]
        self.m = len(self.Llinks)
        self.N = self.n + self.m
        self._build()

    def _build(self):
        n, N = self.n, self.N
        A = np.zeros((N, N))
        g_ext = np.zeros(n)
        g_ext[PIDX[GRID_PORT]] = GRID_G
        for i in range(n):
            A[i, i] -= (self.gl[i] + g_ext[i]) / self.C[i]
        for k, l in enumerate(self.links):
            i, j = PIDX[l.source], PIDX[l.target]
            if l.L > 0:
                s = n + self.Llinks.index(k)
                # L di/dt = e_i - e_j - R i ; flow i leaves i, enters j
                A[s, i] += 1 / l.L
                A[s, j] -= 1 / l.L
                A[s, s] -= l.R / l.L
                A[i, s] -= 1 / self.C[i]
                A[j, s] += 1 / self.C[j]
            else:
                g = 1 / l.R
                A[i, i] -= g / self.C[i]
                A[i, j] += g / self.C[i]
                A[j, j] -= g / self.C[j]
                A[j, i] += g / self.C[j]
        self.A = A
        self.g_ext = g_ext
        self.Binj = np.zeros((N, n))  # flow injection at a port
        for i in range(n):
            self.Binj[i, i] = 1 / self.C[i]

    # -------------------------------------------------------------- inputs
    def nominal_injection(self, load=1.0, grid=1.0, ambient=0.0):
        J = np.zeros(self.n)
        J[PIDX[GRID_PORT]] += GRID_G * GRID_E * grid
        J[PIDX[PROCESS_HEAT_PORT]] += PROCESS_HEAT * load
        # operating context: ambient temperature is the reference effort of
        # the designed losses at thermal ports
        for i, p in enumerate(PORT_IDS):
            if port_type(p) == "thermal":
                J[i] += self.gl[i] * ambient
        return J

    # ------------------------------------------------------------- solvers
    def dc(self, J):
        x = np.linalg.solve(-self.A, self.Binj @ J)
        return x

    def ac(self, port, omega, amp=1.0):
        """Complex state amplitudes for a sinusoidal flow injection."""
        u = np.zeros(self.n, complex)
        u[PIDX[port]] = amp
        M = 1j * omega * np.eye(self.N) - self.A
        return np.linalg.solve(M, self.Binj @ u)

    def ac_multi(self, u, omega):
        M = 1j * omega * np.eye(self.N) - self.A
        return np.linalg.solve(M, self.Binj @ u)

    def link_flow(self, x, k):
        l = self.links[k]
        if l.L > 0:
            return x[self.n + self.Llinks.index(k)]
        return (x[PIDX[l.source]] - x[PIDX[l.target]]) / l.R

    # --------------------------------------------- dissipation and entropy
    def dissipation(self, x, ac=False, ambient=0.0):
        """Dissipated power per port designed loss and per link.
        DC: g e^2.  AC (amplitude phasors): 0.5 g |e|^2."""
        f = 0.5 if ac else 1.0
        e = x[: self.n]
        ref = np.array([ambient if port_type(p) == "thermal" and not ac else 0.0 for p in PORT_IDS])
        port_loss = f * self.gl * np.abs(e - ref) ** 2
        link_loss = np.array([f * l.R * np.abs(self.link_flow(x, k)) ** 2 for k, l in enumerate(self.links)])
        return port_loss, link_loss

    def entropy_generation(self, x, ac=False, ambient=0.0):
        """Entropy generation rate by asset (ports + bonds), by coupling,
        and by leaf system (its assets + couplings inside it). Couplings
        that cross a system boundary are reported on their own, since IRO
        anchors their failure modes to the coupling (coupling-anchored
        failure mode)."""
        pl, ll = self.dissipation(x, ac, ambient)
        by_asset = {a.tag: 0.0 for a in ASSETS}
        by_coupling = {}
        for i, p in enumerate(PORT_IDS):
            by_asset[port_asset(p)] += pl[i] / T0
        for k, l in enumerate(self.links):
            if l.kind == "bond":
                by_asset[port_asset(l.source)] += ll[k] / T0
            else:
                by_coupling[l.cid] = ll[k] / T0
        by_system = {}
        for a in ASSETS:
            by_system[a.system] = by_system.get(a.system, 0.0) + by_asset[a.tag]
        cross = {}
        for k, l in enumerate(self.links):
            if l.kind != "coupling":
                continue
            sa, sb = link_systems(l)
            if sa == sb:
                by_system[sa] += by_coupling[l.cid]
            else:
                cross[l.cid] = by_coupling[l.cid]
        return by_asset, by_coupling, by_system, cross

    def port_power(self, x, k, at="target", ac=False):
        """Power flow / energy flux through coupling k, measured at its
        target port or source port. Positive P_c = nominal direction (source port -> target port); the actual direction is the sign of P_c."""
        l = self.links[k]
        i = self.link_flow(x, k)
        e = x[PIDX[l.target if at == "target" else l.source]]
        if ac:
            return 0.5 * np.real(e * np.conj(i))
        return e * i

    def injected_power(self, x, port, amp=1.0):
        e = x[PIDX[port]]
        return 0.5 * np.real(e * np.conj(amp))

    def transfer(self, port_from, port_to, omega):
        x = self.ac(port_from, omega)
        return x[PIDX[port_to]]

    def discretize(self, dt):
        from scipy.linalg import expm
        N, n = self.N, self.n
        M = np.zeros((N + n, N + n))
        M[:N, :N] = self.A * dt
        M[:N, N:] = self.Binj * dt
        E = expm(M)
        return E[:N, :N], E[:N, N:]


# ------------------------------------------------------ operating envelope
# Per asset, on the entropy generation rate sigma (one coordinate of the
# operating state): Design limit, Safe limit (no degradation below it),
# Damage region above it, failure when accumulated entropy generation
# above the Safe limit reaches the entropic endurance.
SAFE_FACTOR = {"HX1": 1.2, "P1": 3.0, "V1": 4.0}   # x nominal peak sigma
SAFE_FACTOR_DEFAULT = 2.0
DESIGN_FACTOR = 1.05
ENDURANCE_DAYS = 20.0       # days at sigma = 2 x Safe limit to reach failure
CONTEXT_SENSITIVITY = 0.5   # Safe limit shrinks by this x ambient (pu)


class OperatingEnvelope:
    def __init__(self, tag, sigma_nominal_peak):
        self.tag = tag
        f = SAFE_FACTOR.get(tag, SAFE_FACTOR_DEFAULT)
        self.design = DESIGN_FACTOR * sigma_nominal_peak
        self.safe0 = f * sigma_nominal_peak
        self.endurance = self.safe0 * ENDURANCE_DAYS   # entropy units x day
        self.thermal = ASSET[tag].thermal_sensitive

    def safe(self, ambient=0.0):
        """Operating context moves the Safe limit (thermal assets)."""
        if self.thermal:
            return self.safe0 * (1 - CONTEXT_SENSITIVITY * ambient)
        return self.safe0

    def region(self, sigma, ambient=0.0):
        if sigma <= self.design:
            return "Design"
        if sigma <= self.safe(ambient):
            return "Safe"
        return "Damage"

    def damage_rate(self, sigma, ambient=0.0):
        """Entropic-endurance fraction consumed per day."""
        return np.maximum(0.0, sigma - self.safe(ambient)) / self.endurance


def link_index(cid):
    for k, l in enumerate(LINKS):
        if l.cid == cid:
            return k
    raise KeyError(cid)


def cross_system_couplings():
    return [k for k, l in enumerate(LINKS) if is_cross_system(l)]


def perturbed_plant(rng, spread=0.10):
    """A 'true' plant whose parameters differ from the design model by a
    random +/- spread (uniform), to test model mismatch honestly."""
    ls = {l.cid: tuple(1 + spread * rng.uniform(-1, 1, 2)) for l in LINKS}
    ps = {p: tuple(1 + spread * rng.uniform(-1, 1, 2)) for p in PORT_IDS}
    return Plant(ls, ps)


# ------------------------------------------- Step 1 energy balance (spec)
def asset_energy_balance(plant, x, ac=False):
    """FORMAL_MODEL.md Step 1, per asset i:
        dH_i/dt = sum_{c: target(c) in i} P_c - sum_{c: source(c) in i} P_c - D_i  (+ P_ext,i)
    P_c is taken at the asset's own port (target port for couplings that
    target i, source port for couplings sourced at i), so the coupling's
    own dissipation D_c = P_c(source port) - P_c(target port) stays on the
    coupling (coupling-anchored). P_ext,i is power from external entities
    (grid, process heat) that the toy model does not represent as assets.
    Returns dict tag -> (P_in, P_out, D_i, P_ext, dH/dt residual).
    Valid for ambient = 0 (thermal reference at zero)."""
    f = 0.5 if ac else 1.0
    e = x[: plant.n]
    out = {}
    pl, ll = plant.dissipation(x, ac=ac)
    for a in ASSETS:
        P_in = P_out = D = P_ext = 0.0
        for k, l in enumerate(plant.links):
            if l.kind == "bond":
                if port_asset(l.source) == a.tag:
                    D += ll[k]
                continue
            if port_asset(l.target) == a.tag:
                P_in += plant.port_power(x, k, at="target", ac=ac)
            if port_asset(l.source) == a.tag:
                P_out += plant.port_power(x, k, at="source", ac=ac)
        for i, p in enumerate(PORT_IDS):
            if port_asset(p) == a.tag:
                D += pl[i]
        out[a.tag] = [P_in, P_out, D, P_ext]
    return out


def external_power(plant, x, J_ext, ac=False):
    """Power delivered into each port by external entities: e*(J - g_ext e)."""
    e = x[: plant.n]
    if ac:
        return 0.5 * np.real(e * np.conj(J_ext - plant.g_ext * e))
    return e * (J_ext - plant.g_ext * e)


# ------------------------------------- [PROPOSED] port directionality
# Design constraint only (FORMAL_MODEL.md Step 1): what the port is built
# to tolerate. Ports themselves are direction-neutral; the actual direction
# of a coupling is the sign of P_c. A port's net coupling power
#   N_p = sum_{c sourced at p} P_c - sum_{c targeting p} P_c   (> 0: energy leaves p)
# against its design directionality is an operating-envelope excursion.
PORT_DIRECTIONALITY = {
    "P1.fluid": "source-only",          # pump discharge
    "M1.electrical": "target-only",     # motor terminals
    "HX1.thermal": "target-only",       # exchanger receives process heat
    # R1.fluid was "target-only" until domain conversion moved into the
    # assets (decision A). Since then R1.fluid also sources the R1.fluid ->
    # AG1.fluid coupling, its nominal net coupling power is ~0.0025 pu, and a
    # target-only constraint is breached in ~63 % of hours from load and
    # context alone (results/cross_system_failure_summary_R1_target_only.json).
    # It is therefore reversible: directionality belongs only on ports with a
    # clearly signed nominal power flow.
}
DIRECTIONALITY_DEFAULT = "reversible"
# Reverse power below this (pu) is not counted as an excursion. Without a
# deadband, a constrained port whose nominal net power is close to zero
# (R1.fluid here) breaches its directionality most of the time from load
# and context variation alone.
DIRECTIONALITY_DEADBAND = 0.01


def port_net_coupling_power(plant, x, ac=False):
    N = {p: 0.0 for p in PORT_IDS}
    for k, l in enumerate(plant.links):
        if l.kind != "coupling":
            continue
        N[l.source] += plant.port_power(x, k, at="source", ac=ac)
        N[l.target] -= plant.port_power(x, k, at="target", ac=ac)
    return N


def directionality_excursion(N):
    """Power flowing against the design directionality, per port (>= 0)."""
    v = {}
    for p, d in PORT_DIRECTIONALITY.items():
        if d == "source-only":
            v[p] = max(0.0, -N[p] - DIRECTIONALITY_DEADBAND)
        elif d == "target-only":
            v[p] = max(0.0, N[p] - DIRECTIONALITY_DEADBAND)
    return v


# ----------------------------------- [PROPOSED] Step 6b port-to-port map
def nodal_admittance(plant, s):
    """Y(s) over all ports: storage sC, designed losses, external source
    conductance, and every bond / coupling admittance 1/(R + sL)."""
    n = plant.n
    Y = np.diag(s * plant.C + plant.gl + plant.g_ext).astype(complex)
    for l in plant.links:
        i, j = PIDX[l.source], PIDX[l.target]
        y = 1.0 / (l.R + s * l.L)
        Y[i, i] += y; Y[j, j] += y; Y[i, j] -= y; Y[j, i] -= y
    return Y


def kron_port_map(plant, omega, keep):
    """Kron reduction (Schur complement) of Y(j omega) onto the kept ports:
    Y_red = Y_KK - Y_KI Y_II^-1 Y_IK ; Z = Y_red^-1, so e_K = Z J_K.
    Valid for one operating state of a linearised model (this toy model is
    linear, so one map per failure-mechanism band)."""
    Y = nodal_admittance(plant, 1j * omega)
    K = [PIDX[p] for p in keep]
    I = [i for i in range(plant.n) if i not in K]
    Yr = Y[np.ix_(K, K)] - Y[np.ix_(K, I)] @ np.linalg.solve(Y[np.ix_(I, I)], Y[np.ix_(I, K)])
    return np.linalg.inv(Yr)


# ------------------------------------------------- structural modes of assets
# Natural frequency (rad/s, per-unit time), damping ratio and the port whose
# effort drives the mode. Used by the convergent-excitation test and by the
# spectral-proximity distance. (A mode is a Resonance: "A coupling that
# amplifies at some frequencies instead of damping"; here it sits inside the
# asset, as a property of its port.)
NATURAL_MODES = {
    "CV1": (2.0, 0.03, "CV1.fluid"),      # valve plug / stem mode
}


def modal_gain(omega, wn, zeta):
    r = omega / wn
    return 1.0 / (1 - r ** 2 + 2j * zeta * r)


def port_resonances(plant, port, wgrid=None):
    """Frequencies of local maxima of the driving-point impedance |Z_pp(jw)|
    (network resonances seen from a port), plus any asset mode at that port."""
    if wgrid is None:
        wgrid = np.logspace(-3, 2, 400)
    z = np.array([abs(plant.ac(port, w, 1.0)[PIDX[port]]) for w in wgrid])
    peaks = []
    for i in range(1, len(z) - 1):
        if z[i] >= z[i - 1] and z[i] >= z[i + 1]:
            lo = min(z[max(0, i - 20): i].min(), z[i + 1: i + 21].min())
            if z[i] > 1.05 * lo:          # prominence of at least 5 %
                peaks.append(wgrid[i])
    for tag, (wn, zeta, p) in NATURAL_MODES.items():
        if p == port:
            peaks.append(wn)
    return peaks
