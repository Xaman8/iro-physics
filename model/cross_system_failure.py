"""Headline test: predict a failure of an asset in one system that is caused
by energy arriving through a coupling from another system.

Scenario (IRO terms): a pump-pulsation failure mechanism develops at the
fluid port of P1 (Pumping system A). The pulsation power flow crosses the
coupling P1.fluid -> HX1.fluid (60 m cooling-water line) into the
Heat-exchange system B, where the tube bundle HX1 enters the Damage region
of its operating envelope and accumulates entropy generation until it
reaches its entropic endurance (failure). P1 itself stays inside its
operating envelope.

Three predictors of the coupled RUL of HX1:
  FULL     full plant model (ports, bonds, couplings, design parameters)
           and every port sensor.
  REDUCED  system-as-asset model [proposed]: each system is one asset;
           only the power flow / energy flux across cross-system couplings
           is measured; a design-time map turns incoming power flow into
           entropy generation of each maintainable item inside the system.
  LOCAL    naive baseline: only the port sensors inside system B.
The true plant differs from the design model by +/-10 % in every parameter.
"""
from __future__ import annotations
import json, sys
import numpy as np
import iro_plant as ip

OMEGA_F = 0.5          # pulsation band, rad/s (per-unit time)
MECHANISM_PORT = "P1.fluid"
TARGET = "HX1"
A_BG = 0.10            # normal pump pulsation amplitude
DT_H = 1.0
DAYS = 220
HORIZON_D = 120.0      # alarm when predicted RUL < horizon
TREND_D = 14.0         # trailing window for trend fit
BASE_D = (0.0, 8.0)    # baseline learning window (days)
K_SIGMA = 4.0          # detection threshold, baseline std multiples
BANDS_NOISE = 0.01     # band amplitude sensor noise (pu)

design = ip.Plant()
ASSET_TAGS = [a.tag for a in ip.ASSETS]
CROSS = ip.cross_system_couplings()


# ---------------------------------------------------------------- helpers
def asset_sigma_vec(plant, x, ac=False, ambient=0.0):
    a, _, _, _ = plant.entropy_generation(x, ac=ac, ambient=ambient)
    return np.array([a[t] for t in ASSET_TAGS])


def nominal_peak_sigma(plant):
    """Peak entropy generation over the design load / context range."""
    best = np.zeros(len(ASSET_TAGS))
    for load in (0.8, 1.2):
        for grid in (0.97, 1.03):
            for amb in (0.0, 0.12):
                x = plant.dc(plant.nominal_injection(load, grid, amb))
                s = asset_sigma_vec(plant, x, ambient=amb)
                xa = plant.ac(MECHANISM_PORT, OMEGA_F, A_BG)
                s = s + asset_sigma_vec(plant, xa, ac=True)
                best = np.maximum(best, s)
    return best


SIG_PEAK = nominal_peak_sigma(design)
ENVELOPES = {t: ip.OperatingEnvelope(t, SIG_PEAK[i]) for i, t in enumerate(ASSET_TAGS)}


def context_series(rng, n, heatwave=None, load_step=None):
    t = np.arange(n) * DT_H / 24.0
    load = 1 + 0.12 * np.sin(2 * np.pi * t) + 0.03 * rng.standard_normal(n)
    grid = 1 + 0.01 * np.sin(2 * np.pi * t + 1) + 0.003 * rng.standard_normal(n)
    amb = 0.05 + 0.03 * np.sin(2 * np.pi * (t - 0.3)) + 0.02 * np.sin(2 * np.pi * t / 365)
    amb = amb + 0.005 * rng.standard_normal(n)
    if heatwave:
        s, d, h = heatwave
        amb = amb + h * ((t >= s) & (t < s + d))
    if load_step:
        s, h = load_step
        load = load + h * (t >= s)
    return t, load, grid, amb


def mechanism_amplitude(rng, t, t0, rate, p):
    a = np.zeros_like(t)
    m = t >= t0
    a[m] = rate * (t[m] - t0) ** p
    # slow multiplicative fluctuation (OU, ~10 %)
    z = np.zeros_like(t)
    for i in range(1, len(t)):
        z[i] = z[i - 1] * 0.98 + 0.2 * 0.1 * rng.standard_normal()
    return a * (1 + z)


def dc_basis(plant):
    """x_dc = X @ [grid, load, ambient] (linear)."""
    cols = []
    for v in ([1, 0, 0], [0, 1, 0], [0, 0, 1]):
        J = np.zeros(plant.n)
        J[ip.PIDX[ip.GRID_PORT]] += ip.GRID_G * ip.GRID_E * v[0]
        J[ip.PIDX[ip.PROCESS_HEAT_PORT]] += ip.PROCESS_HEAT * v[1]
        for i, pid in enumerate(ip.PORT_IDS):
            if ip.port_type(pid) == "thermal":
                J[i] += plant.gl[i] * v[2]
        cols.append(plant.dc(J))
    return np.array(cols).T


def simulate_truth(plant, t, load, grid, amb, a_mechanism, seed=0):
    n = len(t)
    X = dc_basis(plant)
    xs = X @ np.vstack([grid, load, amb])            # (N, n)
    xa_unit = plant.ac(MECHANISM_PORT, OMEGA_F, 1.0)
    gam = asset_sigma_vec(plant, xa_unit, ac=True)   # sigma per amp^2
    a_tot = A_BG + a_mechanism
    sig = np.zeros((n, len(ASSET_TAGS)))
    for k in range(n):
        sig[k] = asset_sigma_vec(plant, xs[:, k], ambient=amb[k])
    sig += np.outer(a_tot ** 2, gam)
    # [PROPOSED] port directionality: hourly net coupling power against the
    # port's design directionality is an operating-envelope excursion; its
    # power is added to the asset's damage (as entropy generation above the
    # Safe limit).
    N_ac = ip.port_net_coupling_power(plant, xa_unit, ac=True)
    exc = np.zeros((n, len(ASSET_TAGS)))
    exc_hours = {p: 0 for p in ip.PORT_DIRECTIONALITY}
    for k in range(n):
        N = ip.port_net_coupling_power(plant, xs[:, k])
        N = {p: N[p] + a_tot[k] ** 2 * N_ac[p] for p in N}
        for p, v in ip.directionality_excursion(N).items():
            if v > 0:
                exc[k, ASSET_TAGS.index(ip.port_asset(p))] += v / ip.T0
                exc_hours[p] += 1
    # damage
    D = np.zeros_like(sig)
    for j, tag in enumerate(ASSET_TAGS):
        env = ENVELOPES[tag]
        rate = np.array([env.damage_rate(sig[k, j], amb[k]) for k in range(n)]) + exc[:, j] / env.endurance
        D[:, j] = np.cumsum(rate) * DT_H / 24.0
    # sensors ---------------------------------------------------------
    rng = np.random.default_rng(seed + 7777)
    e_dc = xs[: plant.n].T                                   # (n, ports)
    e_dc_m = e_dc * (1 + 0.005 * rng.standard_normal(e_dc.shape)) + 0.002 * rng.standard_normal(e_dc.shape)
    H = xa_unit[: plant.n]
    noise = BANDS_NOISE * (rng.standard_normal((n, plant.n)) + 1j * rng.standard_normal((n, plant.n))) / np.sqrt(2)
    band = np.abs(np.outer(a_tot, H) + noise)
    # power flow across cross-system couplings, measured at target port
    P_dc = np.zeros((n, len(CROSS)))
    P_ac = np.zeros((n, len(CROSS)))
    for c, k in enumerate(CROSS):
        P_dc[:, c] = [plant.port_power(xs[:, i], k) for i in range(n)]
        P_ac[:, c] = plant.port_power(xa_unit, k, ac=True) * a_tot ** 2
    P_dc_m = P_dc * (1 + 0.02 * rng.standard_normal(P_dc.shape)) + 0.001 * rng.standard_normal(P_dc.shape)
    P_ac_m = P_ac * (1 + 0.03 * rng.standard_normal(P_ac.shape)) + 0.05 * BANDS_NOISE * rng.standard_normal(P_ac.shape)
    return dict(sig=sig, D=D, directionality_excursion_hours=exc_hours, e_dc=e_dc_m, band=band, P_dc=P_dc_m, P_ac=P_ac_m, a_tot=a_tot)


# ------------------------------------------------------ design-time maps
X_DES = dc_basis(design)
XA_DES = design.ac(MECHANISM_PORT, OMEGA_F, 1.0)
H_DES = XA_DES[: design.n]
GAM_DES = asset_sigma_vec(design, XA_DES, ac=True)

# candidate source ports for transfer path analysis at the pulsation band
CAND = {pid: design.ac(pid, OMEGA_F, 1.0) for pid in ip.PORT_IDS}


def reduced_maps():
    """System-as-asset map: for every cross-system coupling c and band
    (dc / pulsation), the entropy generation of each maintainable item per
    unit power flow across c, computed on the design model by injecting at
    the source port of c. Also the nominal power flows."""
    F_ac = np.zeros((len(CROSS), len(ASSET_TAGS)))
    F_dc = np.zeros((len(CROSS), len(ASSET_TAGS)))
    for c, k in enumerate(CROSS):
        l = ip.LINKS[k]
        xa = design.ac(l.source, OMEGA_F, 1.0)
        Pc = design.port_power(xa, k, ac=True)
        sa = asset_sigma_vec(design, xa, ac=True)
        F_ac[c] = sa / Pc if abs(Pc) > 1e-9 else 0
        # dc: small dc injection at the source port on top of nominal
        J0 = design.nominal_injection()
        x0 = design.dc(J0)
        J1 = J0.copy(); J1[ip.PIDX[l.source]] += 0.05
        x1 = design.dc(J1)
        dP = design.port_power(x1, k) - design.port_power(x0, k)
        dS = asset_sigma_vec(design, x1) - asset_sigma_vec(design, x0)
        F_dc[c] = dS / dP if abs(dP) > 1e-9 else 0
    # only items in the receiving system belong to that system-as-asset
    for c, k in enumerate(CROSS):
        target_sys = ip.ASSET[ip.port_asset(ip.LINKS[k].target)].system
        for j, tag in enumerate(ASSET_TAGS):
            if ip.ASSET[tag].system != target_sys:
                F_ac[c, j] = 0; F_dc[c, j] = 0
    x0 = design.dc(design.nominal_injection())
    P_nom = np.array([design.port_power(x0, k) for k in CROSS])
    s_nom = asset_sigma_vec(design, x0, ambient=0.0) + GAM_DES * A_BG ** 2
    return F_ac, F_dc, P_nom, s_nom


F_AC, F_DC, P_NOM, S_NOM = reduced_maps()

# local (naive) calibration: entropy generation of HX1 per band amplitude^2
# at HX1.fluid, from local excitation at HX1.fluid on the design model
_xl = design.ac("HX1.fluid", OMEGA_F, 1.0)
GAMMA_LOCAL = asset_sigma_vec(design, _xl, ac=True)[ASSET_TAGS.index(TARGET)] / abs(_xl[ip.PIDX["HX1.fluid"]]) ** 2
B_PORTS = [p for p in ip.PORT_IDS if ip.ASSET[ip.port_asset(p)].system == "SYS_B"]


def daily_mean(x, i, hours=24):
    return np.mean(x[max(0, i - hours + 1): i + 1], axis=0)


def project_rul(t_now, D_now, sig_base, gam, a_fit, envs, amb_mean, horizon=400.0, step_d=0.25):
    """Integrate damage forward with sigma = base + gam * a(t)^2."""
    tt = np.arange(t_now, t_now + horizon, step_d)
    a = np.maximum(a_fit(tt), 0)
    sig = sig_base[None, :] + np.outer(a ** 2, gam)
    out = np.full(len(envs), np.inf)
    traj = None
    for j, env in enumerate(envs):
        if env is None:
            continue
        r = env.damage_rate(sig[:, j], amb_mean) * step_d
        D = D_now[j] + np.cumsum(r)
        hit = np.nonzero(D >= 1)[0]
        if len(hit):
            out[j] = tt[hit[0]]
        if env.tag == TARGET:
            traj = (tt, D)
    return out, traj


def linfit(tt, yy):
    if len(tt) < 10:
        return lambda x: np.full_like(np.asarray(x, float), yy[-1] if len(yy) else 0)
    p = np.polyfit(tt, yy, 1)
    return lambda x: np.polyval(p, x)


# ------------------------------------------------------------- predictors
ENV_LIST = [ENVELOPES[t] for t in ASSET_TAGS]
J_T = ASSET_TAGS.index(TARGET)


class Predictor:
    name = ""

    def __init__(self, obs, t):
        self.obs, self.t = obs, t
        self.D = np.zeros(len(ASSET_TAGS))
        self.hist = []

    def run(self, eval_every_h=6):
        t, n = self.t, len(self.t)
        res = dict(times=[], tstar=[], Dhat=[], first=[], alarm=None, attributed_source=None, failing=None)
        bi = (t >= BASE_D[0]) & (t < BASE_D[1])
        self.calibrate(bi)
        for i in range(n):
            s_est = self.sigma_now(i)
            self.D += np.array([env.damage_rate(s_est[j], self.amb_now(i)) for j, env in enumerate(ENV_LIST)]) * DT_H / 24
            if i % eval_every_h or t[i] < BASE_D[1] + 1:
                continue
            ts, traj = self.predict(i)
            first = int(np.argmin(ts))
            res["times"].append(t[i]); res["tstar"].append(ts[J_T]); res["Dhat"].append(self.D[J_T])
            res["first"].append(ASSET_TAGS[first])
            if res["alarm"] is None and self.detected(i) and ts[first] - t[i] < HORIZON_D:
                res["alarm"] = t[i]; res["failing"] = ASSET_TAGS[first]
                res["attributed_source"] = self.attribute(i, first)
                res["traj_at_alarm"] = traj
        return res


class Full(Predictor):
    name = "FULL"

    def calibrate(self, bi):
        o = self.obs
        Hn = np.abs(H_DES)
        self.a_est = (o["band"] @ Hn) / (Hn @ Hn)
        # context by least squares on dc port efforts
        Xp = X_DES[: design.n]
        self.ctx = np.linalg.lstsq(Xp, o["e_dc"].T, rcond=None)[0].T   # grid, load, amb
        self.a_mu = self.a_est[bi].mean(); self.a_sd = self.a_est[bi].std()
        self.band_mu = o["band"][bi].mean(0)
        ab = np.convolve(self.a_est, np.ones(24) / 24, mode="same")
        self.a_sd24 = ab[bi][24:-24].std() + 1e-6

    def amb_now(self, i):
        return self.ctx[i, 2]

    def sigma_now(self, i):
        g, l, a = self.ctx[i]
        x = X_DES @ np.array([g, l, a])
        return asset_sigma_vec(design, x, ambient=a) + GAM_DES * self.a_est[i] ** 2

    def detected(self, i):
        return daily_mean(self.a_est, i) > self.a_mu + K_SIGMA * self.a_sd24

    def predict(self, i):
        t = self.t
        w = (t > t[i] - TREND_D) & (t <= t[i])
        fit = linfit(t[w], self.a_est[w])
        g, l, a = self.ctx[max(0, i - 24 * 7): i + 1].mean(0)
        x = X_DES @ np.array([g, l, a])
        base = asset_sigma_vec(design, x, ambient=a)
        return project_rul(t[i], self.D, base, GAM_DES, fit, ENV_LIST, a)

    def attribute(self, i, first):
        # transfer path analysis: which candidate source port explains the
        # pattern of band-amplitude increases over all ports best?
        m = daily_mean(self.obs["band"], i) - self.band_mu
        best, br = None, np.inf
        for pid, xc in CAND.items():
            h = np.abs(xc[: design.n])
            amp = max(m @ h / (h @ h), 0)
            r = np.sum((m - amp * h) ** 2)
            if r < br:
                best, br = pid, r
        return ip.ASSET[ip.port_asset(best)].system + ":" + best


class Reduced(Predictor):
    """System-as-asset [proposed]: sees only power flow across
    cross-system couplings."""
    name = "REDUCED"

    def calibrate(self, bi):
        o = self.obs
        self.Pac_mu = o["P_ac"][bi].mean(0); self.Pdc_mu = o["P_dc"][bi].mean(0)
        sm = np.array([np.convolve(o["P_ac"][:, c], np.ones(24) / 24, mode="same") for c in range(len(CROSS))]).T
        self.Pac_sd24 = sm[bi][24:-24].std(0) + 1e-6
        self.sm = sm

    def amb_now(self, i):
        return 0.05   # cannot see operating context inside systems

    def sigma_now(self, i):
        o = self.obs
        return S_NOM + (o["P_dc"][i] - P_NOM) @ F_DC + (o["P_ac"][i] - self.Pac_mu) @ F_AC

    def detected(self, i):
        return np.any(daily_mean(self.obs["P_ac"], i) - self.Pac_mu > K_SIGMA * self.Pac_sd24)

    def predict(self, i):
        t, o = self.t, self.obs
        w = (t > t[i] - TREND_D) & (t <= t[i])
        # amplitude-like quantity: sqrt of pulsation power flow per coupling
        fits = [linfit(t[w], np.sqrt(np.maximum(o["P_ac"][w, c], 0))) for c in range(len(CROSS))]
        base = S_NOM + (o["P_dc"][max(0, i - 168): i + 1].mean(0) - P_NOM) @ F_DC - self.Pac_mu @ F_AC
        # combine: sigma = base + sum_c F_ac[c] * fit_c(t)^2 ; express via one
        # dominant coupling for projection
        dP = daily_mean(o["P_ac"], i) - self.Pac_mu
        c0 = int(np.argmax(dP * np.abs(F_AC).max(1)))
        gam = F_AC[c0]
        other = sum((dP[c] * F_AC[c] for c in range(len(CROSS)) if c != c0), np.zeros(len(ASSET_TAGS)))
        base = base - 0 * other
        return project_rul(t[i], self.D, base + other, gam, fits[c0], ENV_LIST, 0.05)

    def attribute(self, i, first):
        """Energy-balance walk upstream across system boundaries."""
        o = self.obs
        dP = daily_mean(o["P_ac"], i) - self.Pac_mu + (daily_mean(o["P_dc"], i) - self.Pdc_mu) * 0.0
        sd = self.Pac_sd24
        sysname = ip.ASSET[ASSET_TAGS[first]].system
        path = [sysname]
        for _ in range(4):
            inc = [(c, dP[c]) for c, k in enumerate(CROSS)
                   if ip.ASSET[ip.port_asset(ip.LINKS[k].target)].system == sysname and dP[c] > K_SIGMA * sd[c]]
            out = [(c, dP[c]) for c, k in enumerate(CROSS)
                   if ip.ASSET[ip.port_asset(ip.LINKS[k].source)].system == sysname]
            # also couplings where power flows backwards (target port -> source port, P_c < 0)
            inc += [(c, -dP[c]) for c, k in enumerate(CROSS)
                    if ip.ASSET[ip.port_asset(ip.LINKS[k].source)].system == sysname and -dP[c] > K_SIGMA * sd[c]]
            if not inc:
                break
            c_best = max(inc, key=lambda z: z[1])[0]
            k = CROSS[c_best]
            s_source = ip.ASSET[ip.port_asset(ip.LINKS[k].source)].system
            s_target = ip.ASSET[ip.port_asset(ip.LINKS[k].target)].system
            up = s_source if s_target == sysname else s_target
            # energy balance of the upstream system: does it emit more than it receives?
            emit = sum(abs(dP[c]) for c, kk in enumerate(CROSS)
                       if sysname in (ip.ASSET[ip.port_asset(ip.LINKS[kk].source)].system, ip.ASSET[ip.port_asset(ip.LINKS[kk].target)].system)
                       and up in (ip.ASSET[ip.port_asset(ip.LINKS[kk].source)].system, ip.ASSET[ip.port_asset(ip.LINKS[kk].target)].system))
            recv = sum(max(0, dP[c]) for c, kk in enumerate(CROSS)
                       if ip.ASSET[ip.port_asset(ip.LINKS[kk].target)].system == up and ip.ASSET[ip.port_asset(ip.LINKS[kk].source)].system != sysname)
            path.append(up)
            sysname = up
            if emit > recv + K_SIGMA * sd.max():
                break
        return sysname + " (path " + " <- ".join(path) + ")"


class Local(Predictor):
    """Naive baseline: only port sensors inside system B."""
    name = "LOCAL"

    def calibrate(self, bi):
        o = self.obs
        self.jh = ip.PIDX["HX1.fluid"]
        self.amp = o["band"][:, self.jh]
        self.amp_mu = self.amp[bi].mean()
        sm = np.convolve(self.amp, np.ones(24) / 24, mode="same")
        self.amp_sd24 = sm[bi][24:-24].std() + 1e-6
        # local baseline entropy generation for HX1 = design nominal
        self.s0 = S_NOM.copy()

    def amb_now(self, i):
        return 0.05

    def sigma_now(self, i):
        s = self.s0.copy()
        s[J_T] = self.s0[J_T] + GAMMA_LOCAL * (self.amp[i] ** 2 - self.amp_mu ** 2)
        return s

    def detected(self, i):
        return daily_mean(self.amp, i) > self.amp_mu + K_SIGMA * self.amp_sd24

    def predict(self, i):
        t = self.t
        w = (t > t[i] - TREND_D) & (t <= t[i])
        fit = linfit(t[w], self.amp[w])
        gam = np.zeros(len(ASSET_TAGS)); gam[J_T] = GAMMA_LOCAL
        base = self.s0.copy(); base[J_T] -= GAMMA_LOCAL * self.amp_mu ** 2
        envs = [ENVELOPES[TARGET] if tg == TARGET else None for tg in ASSET_TAGS]
        return project_rul(t[i], self.D, base, gam, fit, envs, 0.05)

    def attribute(self, i, first):
        return "SYS_B (local item HX1.fluid)"


class LocalConventional(Local):
    """Naive baseline with conventional health indicators only: DC effort
    (temperature, pressure) at the system-B ports, no pulsation-band
    sensor. The carrier variable of the failure mechanism is not measured."""
    name = "LOCAL_DC"

    def calibrate(self, bi):
        o = self.obs
        self.cols = [ip.PIDX[p] for p in B_PORTS]
        y = o["e_dc"][:, self.cols]
        self.mu = y[bi].mean(0)
        sm = np.array([np.convolve(y[:, c], np.ones(24) / 24, mode="same") for c in range(y.shape[1])]).T
        self.sd24 = sm[bi][24:-24].std(0) + 1e-6
        self.y = y
        self.s0 = S_NOM.copy()

    def sigma_now(self, i):
        return self.s0

    def detected(self, i):
        return np.any(np.abs(daily_mean(self.y, i) - self.mu) > K_SIGMA * self.sd24)

    def predict(self, i):
        t = self.t
        envs = [ENVELOPES[TARGET] if tg == TARGET else None for tg in ASSET_TAGS]
        gam = np.zeros(len(ASSET_TAGS))
        return project_rul(t[i], self.D, self.s0, gam, lambda x: np.zeros_like(np.asarray(x, float)), envs, 0.05)


METHODS = [Full, Reduced, Local, LocalConventional]


def run_case(seed, mechanism_active=True):
    rng = np.random.default_rng(seed)
    n = int(DAYS * 24 / DT_H)
    plant = ip.perturbed_plant(rng, 0.10)
    hw = (rng.uniform(40, 150), 10.0, 0.12) if not mechanism_active or rng.uniform() < 0.5 else None
    ls = (rng.uniform(30, 150), 0.10) if not mechanism_active or rng.uniform() < 0.5 else None
    t, load, grid, amb = context_series(rng, n, hw, ls)
    if mechanism_active:
        t0 = rng.uniform(10, 40)
        p = rng.uniform(0.8, 1.3)
        rate = rng.uniform(0.010, 0.022) * 50 ** (1 - p)
        a = mechanism_amplitude(rng, t, t0, rate, p)
    else:
        t0 = None
        a = np.zeros(n)
    truth = simulate_truth(plant, t, load, grid, amb, a, seed)
    fails = {}
    for j, tag in enumerate(ASSET_TAGS):
        h = np.nonzero(truth["D"][:, j] >= 1)[0]
        if len(h):
            fails[tag] = t[h[0]]
    out = dict(seed=seed, mechanism_active=mechanism_active, t0=t0, fails=fails, heatwave=hw, load_step=ls,
               directionality_excursion_hours=truth["directionality_excursion_hours"], methods={})
    for M in METHODS:
        out["methods"][M.name] = M(truth, t).run()
    return out, truth, t


def summarise(cases):
    rows = {}
    for M in METHODS:
        nm = M.name
        lead, errs, cause_ok, item_ok, n_alarm = [], {60: [], 30: [], 14: [], 7: []}, 0, 0, 0
        fa_runs, fa_n = 0, 0
        det = []
        n_mech = 0
        for c in cases:
            r = c["methods"][nm]
            if c["mechanism_active"]:
                tf = c["fails"].get(TARGET)
                if tf is None:
                    continue
                n_mech += 1
                if r["alarm"] is not None and r["alarm"] < tf:
                    n_alarm += 1
                    lead.append(tf - r["alarm"])
                    det.append(r["alarm"] - c["t0"])
                    cause_ok += ("SYS_A" in (r["attributed_source"] or "").split(" ")[0])
                    item_ok += (r["failing"] == TARGET)
                times = np.array(r["times"]); ts = np.array(r["tstar"])
                for h in errs:
                    k = np.searchsorted(times, tf - h)
                    if k < len(times) and r["alarm"] is not None and r["alarm"] <= tf - h:
                        errs[h].append(ts[k] - tf if np.isfinite(ts[k]) else np.nan)
            else:
                if r["alarm"] is not None:
                    fa_runs += 1
        nf = sum(1 for c in cases if not c["mechanism_active"])
        rows[nm] = dict(
            mechanism_runs_with_target_failure=n_mech,
            warned_before_failure=n_alarm,
            lead_time_days_median=float(np.median(lead)) if lead else None,
            lead_time_days_iqr=[float(np.percentile(lead, 25)), float(np.percentile(lead, 75))] if lead else None,
            root_cause_SYS_A_correct=f"{cause_ok}/{n_alarm}",
            failing_item_HX1_correct=f"{item_ok}/{n_alarm}",
            no_mechanism_runs=nf, no_mechanism_runs_with_alarm=fa_runs,
            detection_delay_after_onset_days_median=float(np.median(det)) if det else None,
        )
        for h, v in errs.items():
            v = np.array(v, float)
            fin = v[np.isfinite(v)]
            rows[nm][f"tstar_error_days_at_RUL_{h}d"] = dict(
                n=int(len(v)), n_no_failure_predicted=int(np.sum(~np.isfinite(v))),
                median_signed=float(np.median(fin)) if len(fin) else None,
                MAE=float(np.mean(np.abs(fin))) if len(fin) else None)
    return rows


if __name__ == "__main__":
    nf = int(sys.argv[1]) if len(sys.argv) > 1 else 40
    cases = []
    keep = None
    for s in range(nf):
        c, truth, t = run_case(1000 + s, True)
        cases.append(c)
        if keep is None and TARGET in c["fails"] and min(c["fails"], key=c["fails"].get) == TARGET:
            keep = (c, truth, t)
    for s in range(nf):
        c, truth, t = run_case(5000 + s, False)
        cases.append(c)
    summ = summarise(cases)
    # first-failing items across mechanism runs
    first_fail = {}
    for c in cases:
        if c["mechanism_active"] and c["fails"]:
            f = min(c["fails"], key=c["fails"].get)
            first_fail[f] = first_fail.get(f, 0) + 1
    no_mech_true_fail = sum(1 for c in cases if not c["mechanism_active"] and c["fails"])
    exc = {}
    for c in cases:
        for p_, h in c["directionality_excursion_hours"].items():
            key = ("mechanism" if c["mechanism_active"] else "no_mechanism") + ":" + p_
            exc[key] = exc.get(key, 0) + h
    summ["_truth"] = dict(first_failing_item_in_mechanism_runs=first_fail,
                          port_directionality_excursion_hours_total=exc,
                          no_mechanism_runs_with_a_true_failure=no_mech_true_fail)
    json.dump(summ, open("results/cross_system_failure_summary.json", "w"), indent=2)
    json.dump(cases, open("results/cross_system_failure_cases.json", "w"), indent=1, default=lambda o: None if o is None else (o.tolist() if hasattr(o, "tolist") else str(o)))
    import pickle
    pickle.dump(keep, open("results/representative_case.pkl", "wb"))
    print(json.dumps(summ, indent=1))
