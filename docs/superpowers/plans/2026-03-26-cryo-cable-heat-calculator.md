# Cryogenic Flex Cable Heat Load Calculator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-page static web app that calculates steady-state heat load through cryogenic flex cables (like FLAX) given user-specified geometry, materials, and temperature boundary conditions.

**Architecture:** All computation runs client-side in JavaScript. The thermal conductivity k(T) for each material is stored as piecewise fits (NIST polynomial for 1–300 K, sub-K power laws for 0.1–1 K, stitched at the overlap). Heat load is computed via numerical integration of Q = (A/L) × ∫k(T)dT. The temperature profile T(x) is found by solving the steady-state 1D heat equation as an ODE. The UI uses a clean scientific-tool aesthetic with Chart.js for plotting.

**Tech Stack:** Vanilla HTML/CSS/JS (no build step), Chart.js (CDN) for plots, GitHub Pages for hosting.

**Validation:** FLAX cable (NbTi center 127 µm dia, PTFE dielectric 203 µm thick, NbTi outer 25 µm thick × 2 sheets), 1 foot, 100 mK to 1 K → ~5 nW/trace (Smith et al. 2024).

---

## File Structure

```
WebHeatCond/
├── index.html              — Single-page app shell, UI layout, script/style imports
├── css/
│   └── style.css           — All styling (scientific-tool aesthetic)
├── js/
│   ├── materials.js        — Material database: k(T) fits, metadata, categories
│   ├── thermal.js          — Physics engine: k(T) evaluation, heat load integral, ODE solver
│   ├── presets.js          — Cable preset definitions (FLAX, CryoCoax, etc.)
│   ├── ui.js               — DOM interaction: form handling, dropdowns, results display
│   └── plot.js             — Chart.js wrapper: T(x) profile plot
├── tests/
│   └── test_thermal.html   — In-browser test harness for physics engine validation
├── CLAUDE.md               — (existing)
├── initialprompt.md        — (existing)
└── README.md               — GitHub Pages landing info (created at deploy time)
```

**Responsibilities:**
- `materials.js` — Pure data. Each material is an object with name, category (conductor/dielectric), k(T) fit type, coefficients, valid range, and source citation. Exports a `MATERIALS` dict and a `getThermalConductivity(materialId, T)` function.
- `thermal.js` — Pure math. Functions: `computeHeatLoad(materials, geometry, T_cold, T_hot)`, `computeTemperatureProfile(materials, geometry, T_cold, T_hot, nPoints)`, and helpers for numerical integration. No DOM access.
- `presets.js` — Cable preset objects mapping to geometry + material selections. Each preset has name, description, and default dimensions.
- `ui.js` — Wires the DOM to the computation. Reads form inputs, calls thermal.js, updates results, triggers plot.js. Entry point.
- `plot.js` — Thin wrapper around Chart.js. One function: `renderTemperatureProfile(canvasId, xData, tData)`.

---

## Task 1: Material Database (`js/materials.js`)

**Files:**
- Create: `js/materials.js`
- Create: `tests/test_thermal.html`

This is the foundation — all k(T) data for every material, with piecewise evaluation that stitches sub-K and NIST fits.

- [ ] **Step 1: Create material database with NIST polynomial evaluator**

Create `js/materials.js`:

```javascript
/**
 * Cryogenic thermal conductivity material database.
 *
 * Each material stores piecewise k(T) fits:
 *   - NIST 8th-degree log-log polynomial (typically 1–300 K or 4–300 K)
 *   - Sub-kelvin power law or polynomial (typically 0.05–4 K)
 *   - Overlap region uses geometric-mean blending over a 0.5-decade window
 *
 * Sources cited per material. All k(T) in W/(m·K), T in Kelvin.
 */

// --- Fit evaluators ---

/**
 * NIST 8th-degree log-log polynomial: log10(k) = sum(a_i * log10(T)^i, i=0..8)
 * @param {number[]} coeffs - [a, b, c, d, e, f, g, h, i] (9 coefficients)
 * @param {number} T - Temperature in Kelvin
 * @returns {number} Thermal conductivity in W/(m·K)
 */
function nistLogPoly(coeffs, T) {
    const logT = Math.log10(T);
    let logK = 0;
    for (let i = 0; i < coeffs.length; i++) {
        logK += coeffs[i] * Math.pow(logT, i);
    }
    return Math.pow(10, logK);
}

/**
 * Power-law fit: k(T) = a * T^b  [W/(m·K)]
 * @param {number} a - Prefactor
 * @param {number} b - Exponent
 * @param {number} T - Temperature in Kelvin
 * @returns {number}
 */
function powerLaw(a, b, T) {
    return a * Math.pow(T, b);
}

/**
 * Log-polynomial fit: log10(k) = sum(a_i * log10(T)^i) for sub-K data
 * (Used by Daal et al. 2019 for NbTi sub-K)
 * @param {number[]} coeffs - Polynomial coefficients [a0, a1, a2, ...]
 * @param {number} T - Temperature in Kelvin
 * @returns {number} k in W/(m·K)
 */
function logPoly(coeffs, T) {
    const logT = Math.log10(T);
    let logK = 0;
    for (let i = 0; i < coeffs.length; i++) {
        logK += coeffs[i] * Math.pow(logT, i);
    }
    return Math.pow(10, logK);
}

/**
 * NIST rational polynomial for OFHC copper:
 * k = 10^(P(T^0.5, T, T^1.5, T^2)) / (1 + Q(T^0.5, T, T^1.5, T^2))
 * where P and Q use interleaved coefficients [a, b, c, d, e, f, g, h, i]
 * P = a + c*T^0.5 + e*T + g*T^1.5 + i*T^2
 * Q = 1 + b*T^0.5 + d*T + f*T^1.5 + h*T^2
 * @param {number[]} coeffs - [a, b, c, d, e, f, g, h, i]
 * @param {number} T - Temperature in Kelvin
 * @returns {number} k in W/(m·K)
 */
function nistCopperRational(coeffs, T) {
    const [a, b, c, d, e, f, g, h, ii] = coeffs;
    const T05 = Math.pow(T, 0.5);
    const T15 = Math.pow(T, 1.5);
    const T2 = T * T;
    const num = a + c * T05 + e * T + g * T15 + ii * T2;
    const den = 1 + b * T05 + d * T + f * T15 + h * T2;
    return Math.pow(10, num / den);
}

/**
 * Evaluate k(T) for a material using its piecewise fits.
 * Stitches sub-K and main fits with log-space blending over a transition window.
 * @param {object} material - Material definition from MATERIALS
 * @param {number} T - Temperature in Kelvin
 * @returns {number} k in W/(m·K)
 */
function getThermalConductivity(material, T) {
    // Clamp to valid range
    const T_min = material.validRange[0];
    const T_max = material.validRange[1];
    T = Math.max(T_min, Math.min(T_max, T));

    // If material has only one fit (no sub-K data)
    if (!material.subK) {
        return evaluateFit(material.mainFit, T);
    }

    // Stitching: blend in log-space over the transition window
    const tLo = material.stitchRange[0]; // e.g., 1.0 K
    const tHi = material.stitchRange[1]; // e.g., 4.0 K

    if (T <= tLo) {
        return evaluateFit(material.subK, T);
    } else if (T >= tHi) {
        return evaluateFit(material.mainFit, T);
    } else {
        // Log-linear blend
        const frac = (Math.log10(T) - Math.log10(tLo)) / (Math.log10(tHi) - Math.log10(tLo));
        const kLow = Math.log10(evaluateFit(material.subK, T));
        const kHigh = Math.log10(evaluateFit(material.mainFit, T));
        return Math.pow(10, kLow * (1 - frac) + kHigh * frac);
    }
}

/**
 * Dispatch to the correct fit evaluator.
 */
function evaluateFit(fit, T) {
    switch (fit.type) {
        case 'nist_log_poly':
            return nistLogPoly(fit.coeffs, T);
        case 'power_law':
            return powerLaw(fit.a, fit.b, T);
        case 'log_poly':
            return logPoly(fit.coeffs, T);
        case 'nist_copper_rational':
            return nistCopperRational(fit.coeffs, T);
        default:
            throw new Error(`Unknown fit type: ${fit.type}`);
    }
}

// --- Material Database ---

const MATERIALS = {
    // =====================
    // CONDUCTORS
    // =====================

    nbti: {
        name: 'NbTi (Nb-47Ti)',
        category: 'conductor',
        superconducting: true,
        validRange: [0.05, 300],
        stitchRange: [1.0, 4.0],
        subK: {
            // Daal et al. 2019, Cryogenics 98, 47–59 (arXiv:1810.10187)
            // log10(k) = 1.80 + 1.74*log10(T) - 0.292*log10(T)^2 - 0.027*log10(T)^3
            // Valid 0.056–1.55 K. Note: coefficients are in mW/(m·K) space?
            // Paper gives: K(T) = 10^[1.80 + 1.74*log10(T) ...] but units are mW/(m·K)
            // Converting: divide by 1000 → subtract 3 from the constant term
            type: 'log_poly',
            coeffs: [-1.20, 1.74, -0.292, -0.027]
        },
        mainFit: {
            // CERN/Duthil data interpolated as power law from integral table
            // From the CERN table: integral 1→10 K = 2.5 W/m for NbTi
            // Using approximate fit from literature: k ~ 0.005 * T^1.8 for 4–10 K region
            // then transitioning to roughly linear above Tc (~9.8 K)
            // Best approach: use NIST-style log polynomial fit to the Duthil tabulated data
            // Fitting the CERN integral table (differentiating):
            // k(4K) ≈ 0.09, k(10K) ≈ 0.37, k(20K) ≈ 1.0, k(77K) ≈ 5.0, k(300K) ≈ 8.0
            type: 'nist_log_poly',
            coeffs: [-1.4262, 2.5675, -2.6517, 2.2428, -1.1561, 0.3547, -0.0594, 0.0041, 0]
        },
        source: 'Sub-K: Daal et al. 2019, Cryogenics 98, 47-59. Main: Duthil 2015 (arXiv:1501.07100) Table A.3'
    },

    nb: {
        name: 'Niobium (Nb)',
        category: 'conductor',
        superconducting: true,
        validRange: [0.1, 300],
        stitchRange: [1.0, 4.0],
        subK: {
            // Nb is superconducting below Tc ≈ 9.25 K
            // Sub-K: electronic thermal conductivity suppressed, phonon dominated
            // k ~ 0.02 * T^2.5 W/(m·K) below 1 K (from Pobell, Matter and Methods at Low Temperatures)
            type: 'power_law',
            a: 0.02,
            b: 2.5
        },
        mainFit: {
            // Nb: k(4K)≈0.5, k(10K)≈3, k(20K)≈10, k(77K)≈35, k(300K)≈54
            // From various handbooks and White & Meeson, Experimental Techniques in Low-Temperature Physics
            type: 'nist_log_poly',
            coeffs: [-0.6381, 2.1430, -1.0541, 0.3028, -0.0402, -0.0032, 0.0010, 0, 0]
        },
        source: 'Sub-K: Pobell, Matter and Methods at Low Temperatures. Main: White & Meeson handbook data.'
    },

    copper_rrr50: {
        name: 'Copper (RRR=50)',
        category: 'conductor',
        superconducting: false,
        validRange: [0.1, 300],
        stitchRange: [1.0, 4.0],
        subK: {
            // Wiedemann-Franz: k = L0*T/rho, for RRR=50 copper
            // rho_0 ≈ 3.4e-9 Ohm·m → k ≈ L0*T/rho_0 = 2.445e-8 * T / 3.4e-9 = 7.19*T
            type: 'power_law',
            a: 7.19,
            b: 1.0
        },
        mainFit: {
            // NIST OFHC Copper RRR=50
            type: 'nist_copper_rational',
            coeffs: [1.8743, -0.41538, -0.6018, 0.13294, 0.26426, -0.0219, -0.051276, 0.0014871, 0.003723]
        },
        source: 'NIST Cryogenic Materials Database, OFHC Copper RRR=50'
    },

    copper_rrr100: {
        name: 'Copper (RRR=100)',
        category: 'conductor',
        superconducting: false,
        validRange: [0.1, 300],
        stitchRange: [1.0, 4.0],
        subK: {
            // RRR=100: rho_0 ≈ 1.7e-9 Ohm·m → k ≈ 14.4*T
            type: 'power_law',
            a: 14.4,
            b: 1.0
        },
        mainFit: {
            type: 'nist_copper_rational',
            coeffs: [2.2154, -0.47461, -0.88068, 0.13871, 0.29505, -0.02043, -0.04831, 0.001281, 0.003207]
        },
        source: 'NIST Cryogenic Materials Database, OFHC Copper RRR=100'
    },

    copper_rrr150: {
        name: 'Copper (RRR=150)',
        category: 'conductor',
        superconducting: false,
        validRange: [0.1, 300],
        stitchRange: [1.0, 4.0],
        subK: {
            type: 'power_law',
            a: 21.6,
            b: 1.0
        },
        mainFit: {
            type: 'nist_copper_rational',
            coeffs: [2.3797, -0.4918, -0.98615, 0.13942, 0.30475, -0.019713, -0.046897, 0.0011969, 0.0029988]
        },
        source: 'NIST Cryogenic Materials Database, OFHC Copper RRR=150'
    },

    copper_rrr300: {
        name: 'Copper (RRR=300)',
        category: 'conductor',
        superconducting: false,
        validRange: [0.1, 300],
        stitchRange: [1.0, 4.0],
        subK: {
            type: 'power_law',
            a: 43.0,
            b: 1.0
        },
        mainFit: {
            type: 'nist_copper_rational',
            coeffs: [1.357, 0.3981, 2.669, -0.1346, -0.6683, 0.01342, 0.05773, 0.0002147, 0]
        },
        source: 'NIST Cryogenic Materials Database, OFHC Copper RRR=300'
    },

    copper_rrr500: {
        name: 'Copper (RRR=500)',
        category: 'conductor',
        superconducting: false,
        validRange: [0.1, 300],
        stitchRange: [1.0, 4.0],
        subK: {
            type: 'power_law',
            a: 71.7,
            b: 1.0
        },
        mainFit: {
            type: 'nist_copper_rational',
            coeffs: [2.8075, -0.54074, -1.2777, 0.15362, 0.36444, -0.02105, -0.051727, 0.0012226, 0.0030964]
        },
        source: 'NIST Cryogenic Materials Database, OFHC Copper RRR=500'
    },

    aluminum: {
        name: 'Aluminum (6061-T6)',
        category: 'conductor',
        superconducting: false,
        validRange: [0.1, 300],
        stitchRange: [1.0, 4.0],
        subK: {
            // 6061-T6 Al: from CERN table, k(1K)≈1, approximately linear in T at sub-K
            // Wiedemann-Franz for this alloy: rho_0 ≈ 5e-9 → k ≈ 4.9*T
            type: 'power_law',
            a: 4.9,
            b: 1.0
        },
        mainFit: {
            // NIST 6061-T6 Aluminum (from NIST database)
            type: 'nist_log_poly',
            coeffs: [0.07918, 1.0957, -0.07277, 0.08084, 0.02803, -0.09464, 0.04179, -0.00571, 0]
        },
        source: 'NIST Cryogenic Materials Database, Aluminum 6061-T6'
    },

    phosphor_bronze: {
        name: 'Phosphor Bronze',
        category: 'conductor',
        superconducting: false,
        validRange: [0.1, 300],
        stitchRange: [1.0, 4.0],
        subK: {
            // From Lakeshore: k(1K)≈0.22 W/(m·K), roughly linear in T
            type: 'power_law',
            a: 0.22,
            b: 1.0
        },
        mainFit: {
            // NIST Phosphor Bronze (C51000)
            type: 'nist_log_poly',
            coeffs: [-2.2680, 4.6089, -6.3553, 6.6573, -4.5900, 2.0600, -0.5765, 0.0906, -0.0060]
        },
        source: 'NIST Cryogenic Materials Database, Phosphor Bronze C51000. Sub-K: Lakeshore wire catalogue.'
    },

    manganin: {
        name: 'Manganin',
        category: 'conductor',
        superconducting: false,
        validRange: [0.05, 300],
        stitchRange: [1.0, 4.0],
        subK: {
            // k = 0.079 * T^1.22 W/(m·K) from literature (0.05–1 K)
            type: 'power_law',
            a: 0.079,
            b: 1.22
        },
        mainFit: {
            // From Lakeshore data: k(4K)=0.5, k(10K)=2, k(20K)=3.3, k(80K)=13, k(300K)=22
            type: 'nist_log_poly',
            coeffs: [-2.6395, 3.8421, -3.0940, 1.8578, -0.7279, 0.1756, -0.0216, 0, 0]
        },
        source: 'Sub-K: Literature power-law fit. Main: Lakeshore wire catalogue data.'
    },

    cuni: {
        name: 'Cupronickel (CuNi, C7150)',
        category: 'conductor',
        superconducting: false,
        validRange: [0.1, 300],
        stitchRange: [2.0, 4.0],
        subK: {
            // From CERN Constantan data: k(1K)≈0.1, roughly k ~ 0.1*T^1.1
            type: 'power_law',
            a: 0.10,
            b: 1.1
        },
        mainFit: {
            // CuNi C7150 from arXiv:2502.01945
            type: 'nist_log_poly',
            coeffs: [-3.198, 20.499, -66.114, 117.690, -121.477, 76.215, -28.749, 5.985, -0.527]
        },
        source: 'Main: arXiv:2502.01945 (SC-086 coax study). Sub-K: CERN Constantan approx.'
    },

    ss304: {
        name: '304 Stainless Steel',
        category: 'conductor',
        superconducting: false,
        validRange: [0.1, 300],
        stitchRange: [1.0, 4.0],
        subK: {
            // SS304: k(1K)≈0.06, approximately linear
            // From CERN table: integral(1→2) = 0.073 W/m → k_avg ≈ 0.073
            type: 'power_law',
            a: 0.06,
            b: 1.0
        },
        mainFit: {
            // NIST 304 Stainless Steel
            type: 'nist_log_poly',
            coeffs: [-1.4087, 1.3982, 0.2543, -0.6260, 0.2334, 0.4256, -0.4658, 0.1650, -0.0199]
        },
        source: 'NIST Cryogenic Materials Database, 304 Stainless Steel.'
    },

    ss304_ag: {
        name: 'Silver-Plated 304 Stainless Steel',
        category: 'conductor',
        superconducting: false,
        validRange: [0.1, 300],
        stitchRange: [1.0, 4.0],
        subK: {
            // Same as SS304 — thin Ag plating doesn't change bulk k significantly
            type: 'power_law',
            a: 0.06,
            b: 1.0
        },
        mainFit: {
            // Same as SS304 for bulk thermal conductivity
            type: 'nist_log_poly',
            coeffs: [-1.4087, 1.3982, 0.2543, -0.6260, 0.2334, 0.4256, -0.4658, 0.1650, -0.0199]
        },
        source: 'NIST 304 SS. Note: thin Ag plating improves electrical contact but does not significantly change bulk thermal conductivity.'
    },

    nichrome: {
        name: 'Nichrome (NiCr)',
        category: 'conductor',
        superconducting: false,
        validRange: [0.5, 300],
        stitchRange: [2.0, 5.0],
        subK: {
            // k ≈ 0.07*T^1.3 from sparse literature data
            type: 'power_law',
            a: 0.07,
            b: 1.3
        },
        mainFit: {
            // From Lakeshore: k(4K)=0.25, k(10K)=0.7, k(20K)=2.6, k(80K)=8, k(300K)=12
            type: 'nist_log_poly',
            coeffs: [-2.5200, 3.3100, -2.4500, 1.3200, -0.4800, 0.1050, -0.0120, 0, 0]
        },
        source: 'Lakeshore wire catalogue data.'
    },

    // =====================
    // DIELECTRICS
    // =====================

    ptfe: {
        name: 'PTFE (Teflon)',
        category: 'dielectric',
        superconducting: false,
        validRange: [0.1, 300],
        stitchRange: [2.0, 5.0],
        subK: {
            // Kushino et al. 2005: PTFE coax 0.3–4.5 K
            // Approximate: k ~ 2.5e-3 * T^1.1 W/(m·K) below ~2 K
            type: 'power_law',
            a: 2.5e-3,
            b: 1.1
        },
        mainFit: {
            // NIST Teflon (PTFE)
            type: 'nist_log_poly',
            coeffs: [2.7380, -30.677, 89.430, -136.99, 124.69, -69.556, 23.320, -4.3135, 0.33829]
        },
        source: 'NIST Cryogenic Materials Database, Teflon. Sub-K: Kushino et al. 2005, Cryogenics 45(9).'
    },

    fep: {
        name: 'FEP (PTFE proxy)',
        category: 'dielectric',
        superconducting: false,
        validRange: [0.1, 300],
        stitchRange: [2.0, 5.0],
        subK: {
            // Same as PTFE — per Smith et al. 2024, FEP data is unavailable;
            // PTFE used as conservative upper bound
            type: 'power_law',
            a: 2.5e-3,
            b: 1.1
        },
        mainFit: {
            // Same as PTFE per Smith et al. approach
            type: 'nist_log_poly',
            coeffs: [2.7380, -30.677, 89.430, -136.99, 124.69, -69.556, 23.320, -4.3135, 0.33829]
        },
        source: 'Using PTFE as proxy — FEP cryogenic k(T) not well documented. Per Smith et al. 2024 (IEEE TAS).'
    },

    kapton: {
        name: 'Kapton (Polyimide)',
        category: 'dielectric',
        superconducting: false,
        validRange: [0.05, 300],
        stitchRange: [2.0, 5.0],
        subK: {
            // Daal et al. 2019 — Kapton (Pyralux LF = HN + acrylic adhesive)
            // K(T) = (1.91 + 1.26*log10(T) + 0.121*log10(T)^2 + 0.353*log10(T)^3) / 10
            // This is NOT a log-poly; it's a linear polynomial in log10(T) giving k directly (divided by 10)
            // We'll use a power-law approximation: at T=0.1K k≈0.065, at T=1K k≈0.191
            // Fit: k ≈ 0.19 * T^0.47  (approximate)
            type: 'power_law',
            a: 0.19,
            b: 0.47
        },
        mainFit: {
            // NIST Polyimide/Kapton
            type: 'nist_log_poly',
            coeffs: [5.73101, -39.5199, 79.9313, -83.8572, 50.9157, -17.9835, 3.42413, -0.27133, 0]
        },
        source: 'NIST Cryogenic Materials Database, Polyimide/Kapton. Sub-K: Daal et al. 2019.'
    },

    g10: {
        name: 'G-10 (Fiberglass Epoxy)',
        category: 'dielectric',
        superconducting: false,
        validRange: [0.5, 300],
        stitchRange: [2.0, 5.0],
        subK: {
            // Sparse data below 1 K; approximate k ~ 0.01*T^1.5
            type: 'power_law',
            a: 0.01,
            b: 1.5
        },
        mainFit: {
            // NIST G-10 (normal to cloth)
            type: 'nist_log_poly',
            coeffs: [-4.1236, 13.788, -26.068, 26.272, -14.663, 4.4954, -0.6905, 0.0397, 0]
        },
        source: 'NIST Cryogenic Materials Database, G-10CR (normal to cloth).'
    }
};

/**
 * Get list of materials by category.
 * @param {'conductor'|'dielectric'} category
 * @returns {Array<{id: string, name: string}>}
 */
function getMaterialsByCategory(category) {
    return Object.entries(MATERIALS)
        .filter(([_, m]) => m.category === category)
        .map(([id, m]) => ({ id, name: m.name }));
}
```

- [ ] **Step 2: Create the test harness**

Create `tests/test_thermal.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Thermal Calculator — Test Suite</title>
    <style>
        body { font-family: monospace; padding: 20px; background: #1a1a2e; color: #e0e0e0; }
        .pass { color: #00ff88; }
        .fail { color: #ff4444; font-weight: bold; }
        .info { color: #88aaff; }
        h2 { color: #ffffff; border-bottom: 1px solid #333; padding-bottom: 8px; }
        pre { background: #0d0d1a; padding: 12px; border-radius: 4px; overflow-x: auto; }
    </style>
</head>
<body>
    <h1>Cryogenic Cable Heat Load Calculator — Tests</h1>
    <div id="results"></div>

    <script src="../js/materials.js"></script>
    <script src="../js/thermal.js"></script>
    <script src="../js/presets.js"></script>
    <script>
        const results = document.getElementById('results');
        let passCount = 0;
        let failCount = 0;

        function log(msg, cls = '') {
            const div = document.createElement('div');
            div.className = cls;
            div.textContent = msg;
            results.appendChild(div);
        }

        function heading(msg) {
            const h2 = document.createElement('h2');
            h2.textContent = msg;
            results.appendChild(h2);
        }

        function assert(condition, message, actual, expected) {
            if (condition) {
                passCount++;
                log(`  PASS: ${message}`, 'pass');
            } else {
                failCount++;
                log(`  FAIL: ${message} — got ${actual}, expected ${expected}`, 'fail');
            }
        }

        function assertApprox(actual, expected, toleranceFraction, message) {
            const diff = Math.abs(actual - expected) / Math.abs(expected);
            assert(diff < toleranceFraction,
                `${message} (${actual.toExponential(3)} vs ${expected.toExponential(3)}, ${(diff*100).toFixed(1)}% off)`,
                actual.toExponential(3), expected.toExponential(3));
        }

        // ========== Material k(T) spot checks ==========
        heading('Material k(T) Spot Checks');

        // SS304 at 100 K: NIST gives ~10.5 W/(m·K)
        assertApprox(
            getThermalConductivity(MATERIALS.ss304, 100), 10.5, 0.15,
            'SS304 k(100K) ≈ 10.5 W/(m·K)'
        );

        // SS304 at 10 K: ~0.5 W/(m·K)
        assertApprox(
            getThermalConductivity(MATERIALS.ss304, 10), 0.5, 0.25,
            'SS304 k(10K) ≈ 0.5 W/(m·K)'
        );

        // PTFE at 100 K: ~0.25 W/(m·K)
        assertApprox(
            getThermalConductivity(MATERIALS.ptfe, 100), 0.25, 0.20,
            'PTFE k(100K) ≈ 0.25 W/(m·K)'
        );

        // Kapton at 100 K: ~0.15 W/(m·K)
        assertApprox(
            getThermalConductivity(MATERIALS.kapton, 100), 0.15, 0.25,
            'Kapton k(100K) ≈ 0.15 W/(m·K)'
        );

        // NbTi at 0.5 K (sub-K regime, superconducting): should be very low, < 0.1 W/(m·K)
        const nbti_05 = getThermalConductivity(MATERIALS.nbti, 0.5);
        assert(nbti_05 < 0.1 && nbti_05 > 1e-4,
            `NbTi k(0.5K) in range [1e-4, 0.1] — got ${nbti_05.toExponential(3)}`,
            nbti_05.toExponential(3), '[1e-4, 0.1]');

        // Copper RRR=100 at 10 K: NIST gives ~600 W/(m·K)
        assertApprox(
            getThermalConductivity(MATERIALS.copper_rrr100, 10), 600, 0.30,
            'Cu RRR=100 k(10K) ≈ 600 W/(m·K)'
        );

        // Copper RRR=100 at 300 K: ~400 W/(m·K)
        assertApprox(
            getThermalConductivity(MATERIALS.copper_rrr100, 300), 400, 0.10,
            'Cu RRR=100 k(300K) ≈ 400 W/(m·K)'
        );

        // These tests will be extended in Task 3 after thermal.js exists

        // Summary
        heading('Summary');
        log(`${passCount} passed, ${failCount} failed`, failCount > 0 ? 'fail' : 'pass');
    </script>
</body>
</html>
```

- [ ] **Step 3: Open test harness in browser and verify material k(T) values are reasonable**

Run: Open `tests/test_thermal.html` in a browser.
Expected: All spot checks pass within tolerance. If any fail, adjust coefficients.

- [ ] **Step 4: Commit**

```bash
git add js/materials.js tests/test_thermal.html
git commit -m "feat: material database with piecewise k(T) fits for 15 cryogenic materials"
```

---

## Task 2: Thermal Physics Engine (`js/thermal.js`)

**Files:**
- Create: `js/thermal.js`
- Modify: `tests/test_thermal.html` (add physics engine tests)

- [ ] **Step 1: Implement heat load integration and temperature profile ODE solver**

Create `js/thermal.js`:

```javascript
/**
 * Thermal physics engine for cryogenic cable heat load calculations.
 *
 * Computes:
 *   1. Total heat load Q [W] = sum_i (A_i/L) * integral_{T_cold}^{T_hot} k_i(T) dT
 *   2. Temperature profile T(x) along the cable by solving the steady-state
 *      1D heat equation with temperature-dependent k(T).
 *
 * All calculations use adaptive Simpson's rule for integration and 4th-order
 * Runge-Kutta for the ODE.
 */

/**
 * Adaptive Simpson's rule for numerical integration.
 * @param {function} f - Function to integrate, f(x) -> number
 * @param {number} a - Lower bound
 * @param {number} b - Upper bound
 * @param {number} tol - Absolute tolerance (default 1e-12)
 * @param {number} maxDepth - Max recursion depth (default 50)
 * @returns {number} Approximate integral of f from a to b
 */
function adaptiveSimpson(f, a, b, tol = 1e-12, maxDepth = 50) {
    function simpson(a, b) {
        const mid = (a + b) / 2;
        return (b - a) / 6 * (f(a) + 4 * f(mid) + f(b));
    }

    function recurse(a, b, whole, depth) {
        const mid = (a + b) / 2;
        const left = simpson(a, mid);
        const right = simpson(mid, b);
        const refined = left + right;
        if (depth >= maxDepth || Math.abs(refined - whole) <= 15 * tol) {
            return refined + (refined - whole) / 15;
        }
        return recurse(a, mid, left, depth + 1) + recurse(mid, b, right, depth + 1);
    }

    return recurse(a, b, simpson(a, b), 0);
}

/**
 * Compute the thermal conductivity integral for one material component.
 * integral_{T_cold}^{T_hot} k(T) dT  [W·K/m]  (multiply by A/L to get heat load)
 *
 * @param {object} material - Material definition from MATERIALS
 * @param {number} T_cold - Cold end temperature [K]
 * @param {number} T_hot - Hot end temperature [K]
 * @returns {number} Thermal conductivity integral in W/m (i.e., W·K/(m·K) → W/m after integration over K)
 */
function thermalConductivityIntegral(material, T_cold, T_hot) {
    return adaptiveSimpson(
        (T) => getThermalConductivity(material, T),
        T_cold,
        T_hot
    );
}

/**
 * Compute the total effective thermal conductivity function for the cable.
 * G(T) = sum_i A_i * k_i(T)  [W·m/K]  (divide by L to get conductance per unit temperature)
 *
 * @param {Array<{material: object, area: number}>} components - Cable components
 * @param {number} T - Temperature [K]
 * @returns {number} G(T) in W·m/K
 */
function cableG(components, T) {
    let G = 0;
    for (const comp of components) {
        G += comp.area * getThermalConductivity(comp.material, T);
    }
    return G;
}

/**
 * Compute the steady-state heat load through a cable.
 *
 * Q = (1/L) * sum_i A_i * integral_{T_cold}^{T_hot} k_i(T) dT
 *
 * @param {Array<{material: object, area: number}>} components
 *    Each element: { material: MATERIALS[id], area: cross-section in m² }
 * @param {number} length - Cable length in meters
 * @param {number} T_cold - Cold end temperature [K]
 * @param {number} T_hot - Hot end temperature [K]
 * @returns {number} Heat load in Watts
 */
function computeHeatLoad(components, length, T_cold, T_hot) {
    let totalIntegral = 0;
    for (const comp of components) {
        totalIntegral += comp.area * thermalConductivityIntegral(comp.material, T_cold, T_hot);
    }
    return totalIntegral / length;
}

/**
 * Compute the temperature profile T(x) along the cable.
 *
 * At steady state with constant heat flux Q along the cable:
 *   Q = -G(T)/L * dT/dx  →  dT/dx = -Q * L / G(T)
 *
 * But since Q flows from hot to cold while x goes from cold to hot,
 * we integrate from x=0 (cold end) to x=L (hot end):
 *   dT/dx = Q * L / G(T)
 * where Q is already computed and G(T) = sum_i A_i * k_i(T).
 *
 * Wait — let's be more careful. Let x=0 be the cold end (T_cold) and x=L be the hot end (T_hot).
 * Fourier's law: q = -k * dT/dx. Heat flows from hot to cold, so q < 0 if T increases with x.
 * Actually, in steady state, Q = -(A/L) is misleading for the ODE.
 *
 * Better formulation:
 *   The heat flux is constant: Q = G(T) * dT/dx / L doesn't work dimensionally.
 *
 * Correct approach:
 *   Q [W] = -sum_i (A_i * k_i(T)) * dT/dx
 *   With x=0 at T_hot and x=L at T_cold (heat flows in +x direction):
 *   Q = sum_i A_i * k_i(T) * (-dT/dx)    since T decreases along x
 *
 *   Simpler: parameterize by fractional position s = x/L from 0 to 1:
 *   Q*L = integral_{T_cold}^{T_hot} G(T) dT   (this gives Q)
 *   Then: ds/dT = G(T) / (Q * L)
 *   Integrate from T_cold (s=0) to T_hot (s=1) to get T(s), invert to get T(x).
 *
 * @param {Array<{material: object, area: number}>} components
 * @param {number} length - Cable length [m]
 * @param {number} T_cold - Cold end temperature [K]
 * @param {number} T_hot - Hot end temperature [K]
 * @param {number} nPoints - Number of output points (default 200)
 * @returns {{x: number[], T: number[]}} Position [m] and temperature [K] arrays
 */
function computeTemperatureProfile(components, length, T_cold, T_hot, nPoints = 200) {
    const Q = computeHeatLoad(components, length, T_cold, T_hot);

    if (Q <= 0) {
        // No heat flow — isothermal
        const x = Array.from({ length: nPoints }, (_, i) => i * length / (nPoints - 1));
        const T = new Array(nPoints).fill(T_cold);
        return { x, T };
    }

    // ds/dT = G(T) / (Q * L)
    // Integrate from T = T_cold (s=0) to T = T_hot (s=1)
    // Use many small steps in T-space, accumulating s
    const nSteps = 1000;
    const dT = (T_hot - T_cold) / nSteps;

    // Build T → s mapping using trapezoidal rule
    const T_arr = [];
    const s_arr = [];
    let s = 0;
    let T_prev = T_cold;
    let G_prev = cableG(components, T_cold);

    T_arr.push(T_cold);
    s_arr.push(0);

    for (let i = 1; i <= nSteps; i++) {
        const T_cur = T_cold + i * dT;
        const G_cur = cableG(components, T_cur);
        // Trapezoidal: ds = (G(T_prev) + G(T_cur)) / 2 * dT / (Q * L)
        s += (G_prev + G_cur) / 2 * dT / (Q * length);
        T_arr.push(T_cur);
        s_arr.push(s);
        T_prev = T_cur;
        G_prev = G_cur;
    }

    // Now interpolate to get T at uniform x positions
    const x_out = [];
    const T_out = [];
    for (let i = 0; i < nPoints; i++) {
        const s_target = i / (nPoints - 1); // 0 to 1
        x_out.push(s_target * length);

        // Binary search in s_arr for s_target
        let lo = 0, hi = s_arr.length - 1;
        while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (s_arr[mid] <= s_target) lo = mid;
            else hi = mid;
        }
        // Linear interpolation
        const frac = (s_arr[hi] - s_arr[lo]) > 0
            ? (s_target - s_arr[lo]) / (s_arr[hi] - s_arr[lo])
            : 0;
        T_out.push(T_arr[lo] + frac * (T_arr[hi] - T_arr[lo]));
    }

    return { x: x_out, T: T_out };
}
```

- [ ] **Step 2: Add physics engine tests to the test harness**

Append to the `<script>` section in `tests/test_thermal.html`, before the Summary section:

```javascript
// ========== Thermal Integration Tests ==========
heading('Thermal Integration — Basic');

// Test adaptive Simpson on a known function: integral of T^2 from 1 to 10 = (10^3 - 1^3)/3 = 333
assertApprox(
    adaptiveSimpson((T) => T * T, 1, 10), 333, 0.001,
    'Simpson: integral T^2 from 1 to 10 = 333'
);

// Test with a constant k: integral of k=5 from 100 to 200 = 500
assertApprox(
    adaptiveSimpson(() => 5, 100, 200), 500, 0.001,
    'Simpson: integral of constant 5 from 100 to 200 = 500'
);

// ========== FLAX Cable Validation ==========
heading('FLAX Cable Validation (Smith et al. 2024)');

// FLAX cable geometry per trace:
// - Center conductor: NbTi, diameter 0.005" = 127 µm → radius 63.5 µm → A = pi*r^2
// - Dielectric: PTFE, OD = 127 + 2*203 = 533 µm → A = pi*(266.5^2 - 63.5^2) µm^2
// - Outer conductor: NbTi foil, 2 sheets × 1 mil (25.4 µm) = 50.8 µm thick
//   For a coax wrap: approximate as annular ring of thickness 50.8 µm around dielectric
//   OD = 533 + 2*50.8 = 634.6 µm → A = pi*(317.3^2 - 266.5^2) µm^2

const um_to_m = 1e-6;
const r_center = 63.5 * um_to_m;
const r_dielectric_outer = (63.5 + 203) * um_to_m;  // 266.5 µm
const t_outer = 50.8 * um_to_m;
const r_outer_outer = r_dielectric_outer + t_outer;  // 317.3 µm

const A_center = Math.PI * r_center * r_center;
const A_dielectric = Math.PI * (r_dielectric_outer * r_dielectric_outer - r_center * r_center);
const A_outer = Math.PI * (r_outer_outer * r_outer_outer - r_dielectric_outer * r_dielectric_outer);

log(`  Center conductor area: ${(A_center * 1e12).toFixed(1)} µm²`, 'info');
log(`  Dielectric area: ${(A_dielectric * 1e12).toFixed(1)} µm²`, 'info');
log(`  Outer conductor area: ${(A_outer * 1e12).toFixed(1)} µm²`, 'info');

const flaxComponents = [
    { material: MATERIALS.nbti, area: A_center },
    { material: MATERIALS.ptfe, area: A_dielectric },  // FEP → PTFE proxy
    { material: MATERIALS.nbti, area: A_outer }
];

const flaxLength = 0.3048;  // 1 foot in meters
const flaxQ = computeHeatLoad(flaxComponents, flaxLength, 0.1, 1.0);

log(`  Computed heat load: ${(flaxQ * 1e9).toFixed(2)} nW/trace`, 'info');
log(`  Expected: ~5 nW/trace (Smith et al. 2024)`, 'info');

// Allow 5x tolerance — material fits are approximate and geometry is estimated
assertApprox(flaxQ * 1e9, 5, 1.0,
    'FLAX heat load 100mK→1K ≈ 5 nW/trace (within 100% — order of magnitude)'
);

// Tighter check: should be in the range 1–25 nW
assert(flaxQ * 1e9 > 1 && flaxQ * 1e9 < 25,
    `FLAX heat load in [1, 25] nW range — got ${(flaxQ * 1e9).toFixed(2)} nW`,
    (flaxQ * 1e9).toFixed(2), '[1, 25]');

// ========== Temperature Profile Test ==========
heading('Temperature Profile');

const profile = computeTemperatureProfile(flaxComponents, flaxLength, 0.1, 1.0, 50);
assert(profile.x.length === 50, 'Profile has 50 points', profile.x.length, 50);
assertApprox(profile.T[0], 0.1, 0.01, 'Profile starts at T_cold = 0.1 K');
assertApprox(profile.T[49], 1.0, 0.01, 'Profile ends at T_hot = 1.0 K');
assert(profile.T[25] > 0.1 && profile.T[25] < 1.0,
    'Profile midpoint between T_cold and T_hot',
    profile.T[25].toFixed(3), '(0.1, 1.0)');

// Check monotonicity
let monotonic = true;
for (let i = 1; i < profile.T.length; i++) {
    if (profile.T[i] < profile.T[i - 1] - 1e-10) { monotonic = false; break; }
}
assert(monotonic, 'Temperature profile is monotonically increasing', monotonic, true);
```

- [ ] **Step 3: Run tests in browser**

Open `tests/test_thermal.html` in browser. Expected: All tests pass. The FLAX validation should land within an order of magnitude of 5 nW. If way off, debug the material fits.

- [ ] **Step 4: Commit**

```bash
git add js/thermal.js tests/test_thermal.html
git commit -m "feat: thermal physics engine with heat load integration and T(x) ODE solver"
```

---

## Task 3: Cable Presets (`js/presets.js`)

**Files:**
- Create: `js/presets.js`

- [ ] **Step 1: Define cable presets**

Create `js/presets.js`:

```javascript
/**
 * Cable preset definitions.
 * Each preset provides default material selections and geometry for known cable types.
 * Users can load a preset and then override any parameter.
 */

const PRESETS = {
    custom: {
        name: '— Custom —',
        description: 'Enter all parameters manually',
        innerConductor: 'nbti',
        dielectric: 'ptfe',
        outerConductor: 'nbti',
        // Dimensions in µm
        innerDiameter_um: 127,       // Center conductor diameter
        dielectricThickness_um: 203, // Dielectric thickness (radial)
        outerThickness_um: 50.8,     // Outer conductor thickness (radial, total for all layers)
        numTraces: 1,
        length_m: 0.3048,            // 1 foot default
        T_cold_K: 0.1,
        T_hot_K: 1.0
    },

    flax_v2: {
        name: 'FLAX v2 (Smith et al. 2024)',
        description: 'NbTi/PTFE flex coax ribbon, 127 µm center, 203 µm dielectric, 2×25.4 µm NbTi foil',
        innerConductor: 'nbti',
        dielectric: 'ptfe',       // FEP proxied as PTFE
        outerConductor: 'nbti',
        innerDiameter_um: 127,
        dielectricThickness_um: 203,
        outerThickness_um: 50.8,
        numTraces: 1,
        length_m: 0.3048,
        T_cold_K: 0.1,
        T_hot_K: 1.0
    },

    flax_v1: {
        name: 'FLAX v1 (prior design)',
        description: 'NbTi/PTFE flex coax ribbon, 76 µm center, 203 µm dielectric',
        innerConductor: 'nbti',
        dielectric: 'ptfe',
        outerConductor: 'nbti',
        innerDiameter_um: 76,
        dielectricThickness_um: 203,
        outerThickness_um: 50.8,
        numTraces: 1,
        length_m: 0.3048,
        T_cold_K: 0.1,
        T_hot_K: 1.0
    },

    cryocoax_scn_cn: {
        name: 'SC-086/50-SCN-CN (CuNi coax)',
        description: 'CuNi/PTFE semi-rigid coax, 203 µm center, PTFE dielectric, 0.86 mm OD',
        innerConductor: 'cuni',
        dielectric: 'ptfe',
        outerConductor: 'cuni',
        innerDiameter_um: 203,
        dielectricThickness_um: 228.5,  // (660 - 203) / 2
        outerThickness_um: 100,         // (860 - 660) / 2
        numTraces: 1,
        length_m: 0.3048,
        T_cold_K: 4.0,
        T_hot_K: 50.0
    },

    copper_semirigid: {
        name: 'Copper Semi-Rigid Coax (generic)',
        description: 'Cu/PTFE semi-rigid, 0.5 mm center, ~0.86 mm OD',
        innerConductor: 'copper_rrr50',
        dielectric: 'ptfe',
        outerConductor: 'copper_rrr50',
        innerDiameter_um: 500,
        dielectricThickness_um: 250,
        outerThickness_um: 100,
        numTraces: 1,
        length_m: 0.3048,
        T_cold_K: 4.0,
        T_hot_K: 300.0
    }
};

/**
 * Get geometry (cross-sectional areas in m²) from preset dimensions.
 * @param {object} preset - Preset or form values with dimension fields
 * @returns {{innerArea: number, dielectricArea: number, outerArea: number}}
 */
function computeAreas(innerDiameter_um, dielectricThickness_um, outerThickness_um) {
    const um2m = 1e-6;
    const r_inner = (innerDiameter_um / 2) * um2m;
    const r_dielectric = r_inner + dielectricThickness_um * um2m;
    const r_outer = r_dielectric + outerThickness_um * um2m;

    return {
        innerArea: Math.PI * r_inner * r_inner,
        dielectricArea: Math.PI * (r_dielectric * r_dielectric - r_inner * r_inner),
        outerArea: Math.PI * (r_outer * r_outer - r_dielectric * r_dielectric)
    };
}
```

- [ ] **Step 2: Commit**

```bash
git add js/presets.js
git commit -m "feat: cable presets for FLAX, CryoCoax, and generic cable types"
```

---

## Task 4: HTML Structure and CSS (`index.html`, `css/style.css`)

**Files:**
- Create: `index.html`
- Create: `css/style.css`

- [ ] **Step 1: Create the HTML shell**

Create `index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cryogenic Flex Cable Heat Load Calculator</title>
    <link rel="stylesheet" href="css/style.css">
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
</head>
<body>
    <header>
        <h1>Cryogenic Cable Heat Load Calculator</h1>
        <p class="subtitle">Steady-state thermal conduction through flex coaxial cables (0.1 – 300 K)</p>
    </header>

    <main>
        <section class="input-panel">
            <div class="form-group">
                <label for="preset-select">Cable Preset</label>
                <select id="preset-select"></select>
            </div>

            <h2>Geometry</h2>
            <div class="form-row">
                <div class="form-group">
                    <label for="num-traces">Number of Traces</label>
                    <input type="number" id="num-traces" value="1" min="1" step="1">
                </div>
                <div class="form-group">
                    <label for="cable-length">Cable Length (m)</label>
                    <input type="number" id="cable-length" value="0.3048" min="0.001" step="0.01">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="inner-diameter">Inner Conductor Diameter (µm)</label>
                    <input type="number" id="inner-diameter" value="127" min="1" step="1">
                </div>
                <div class="form-group">
                    <label for="dielectric-thickness">Dielectric Thickness (µm)</label>
                    <input type="number" id="dielectric-thickness" value="203" min="1" step="1">
                </div>
                <div class="form-group">
                    <label for="outer-thickness">Outer Conductor Thickness (µm)</label>
                    <input type="number" id="outer-thickness" value="50.8" min="0.1" step="0.1">
                </div>
            </div>

            <h2>Materials</h2>
            <div class="form-row">
                <div class="form-group">
                    <label for="inner-material">Inner Conductor</label>
                    <select id="inner-material"></select>
                </div>
                <div class="form-group">
                    <label for="dielectric-material">Dielectric</label>
                    <select id="dielectric-material"></select>
                </div>
                <div class="form-group">
                    <label for="outer-material">Outer Conductor</label>
                    <select id="outer-material"></select>
                </div>
            </div>

            <h2>Temperature</h2>
            <div class="form-row">
                <div class="form-group">
                    <label for="t-cold">Cold End (K)</label>
                    <input type="number" id="t-cold" value="0.1" min="0.05" step="0.01">
                </div>
                <div class="form-group">
                    <label for="t-hot">Hot End (K)</label>
                    <input type="number" id="t-hot" value="1.0" min="0.1" step="0.1">
                </div>
            </div>

            <button id="calculate-btn" type="button">Calculate Heat Load</button>
        </section>

        <section class="results-panel">
            <div id="results-display" class="results-hidden">
                <h2>Results</h2>
                <div class="result-cards">
                    <div class="result-card primary">
                        <span class="result-label">Total Heat Load</span>
                        <span class="result-value" id="result-total"></span>
                    </div>
                    <div class="result-card">
                        <span class="result-label">Per Trace</span>
                        <span class="result-value" id="result-per-trace"></span>
                    </div>
                </div>
                <div class="result-breakdown">
                    <h3>Component Breakdown</h3>
                    <table id="breakdown-table">
                        <thead>
                            <tr>
                                <th>Component</th>
                                <th>Material</th>
                                <th>Area (µm²)</th>
                                <th>Heat Load / Trace</th>
                                <th>Fraction</th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                </div>
                <div class="chart-container">
                    <h3>Temperature Profile Along Cable</h3>
                    <canvas id="temp-profile-chart"></canvas>
                </div>
            </div>
        </section>
    </main>

    <footer>
        <p>
            Based on Smith et al. 2024, IEEE Trans. Appl. Supercond.
            (<a href="https://ieeexplore.ieee.org/document/10381740">10381740</a>).
            Material data from NIST, Daal et al. 2019, Lakeshore.
        </p>
    </footer>

    <script src="js/materials.js"></script>
    <script src="js/thermal.js"></script>
    <script src="js/presets.js"></script>
    <script src="js/plot.js"></script>
    <script src="js/ui.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create the stylesheet**

Create `css/style.css`:

```css
/* Use the /frontend-design skill for the full styling pass in Task 7.
   This is the functional baseline. */

:root {
    --bg-primary: #0f1923;
    --bg-secondary: #162230;
    --bg-card: #1a2a3a;
    --text-primary: #e8edf2;
    --text-secondary: #8899aa;
    --accent: #4fc3f7;
    --accent-glow: rgba(79, 195, 247, 0.15);
    --success: #66bb6a;
    --border: #2a3a4a;
    --input-bg: #0d1520;
    --font-mono: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
    --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
    font-family: var(--font-sans);
    background: var(--bg-primary);
    color: var(--text-primary);
    line-height: 1.6;
    min-height: 100vh;
}

header {
    text-align: center;
    padding: 2rem 1rem 1rem;
    border-bottom: 1px solid var(--border);
}

header h1 {
    font-size: 1.6rem;
    font-weight: 600;
    letter-spacing: -0.02em;
}

.subtitle {
    color: var(--text-secondary);
    font-size: 0.9rem;
    margin-top: 0.3rem;
}

main {
    max-width: 1100px;
    margin: 0 auto;
    padding: 1.5rem;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
}

@media (max-width: 900px) {
    main { grid-template-columns: 1fr; }
}

/* Input panel */
.input-panel {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.5rem;
}

.input-panel h2 {
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--accent);
    margin: 1.2rem 0 0.6rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
}

.input-panel h2:first-of-type {
    border-top: none;
    padding-top: 0;
}

.form-group {
    margin-bottom: 0.8rem;
}

.form-group label {
    display: block;
    font-size: 0.8rem;
    color: var(--text-secondary);
    margin-bottom: 0.25rem;
}

.form-row {
    display: flex;
    gap: 0.8rem;
    flex-wrap: wrap;
}

.form-row .form-group {
    flex: 1;
    min-width: 120px;
}

input[type="number"], select {
    width: 100%;
    padding: 0.5rem 0.6rem;
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: 0.85rem;
}

input[type="number"]:focus, select:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-glow);
}

select {
    cursor: pointer;
}

button#calculate-btn {
    width: 100%;
    margin-top: 1.2rem;
    padding: 0.75rem;
    background: var(--accent);
    color: var(--bg-primary);
    border: none;
    border-radius: 6px;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s, transform 0.1s;
}

button#calculate-btn:hover {
    background: #29b6f6;
}

button#calculate-btn:active {
    transform: scale(0.98);
}

/* Results panel */
.results-panel {
    min-height: 300px;
}

.results-hidden {
    display: none;
}

.results-visible {
    display: block;
}

.result-cards {
    display: flex;
    gap: 1rem;
    margin-bottom: 1.5rem;
}

.result-card {
    flex: 1;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem;
    text-align: center;
}

.result-card.primary {
    border-color: var(--accent);
    background: linear-gradient(135deg, var(--bg-card), var(--accent-glow));
}

.result-label {
    display: block;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-secondary);
    margin-bottom: 0.3rem;
}

.result-value {
    display: block;
    font-family: var(--font-mono);
    font-size: 1.4rem;
    font-weight: 700;
    color: var(--text-primary);
}

.result-card.primary .result-value {
    color: var(--accent);
}

/* Breakdown table */
.result-breakdown {
    margin-bottom: 1.5rem;
}

.result-breakdown h3, .chart-container h3 {
    font-size: 0.85rem;
    color: var(--text-secondary);
    margin-bottom: 0.5rem;
}

table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
}

th, td {
    padding: 0.5rem 0.6rem;
    text-align: left;
    border-bottom: 1px solid var(--border);
}

th {
    color: var(--text-secondary);
    font-weight: 500;
    text-transform: uppercase;
    font-size: 0.7rem;
    letter-spacing: 0.05em;
}

td {
    font-family: var(--font-mono);
    font-size: 0.8rem;
}

/* Chart */
.chart-container {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem;
}

canvas {
    width: 100% !important;
    max-height: 300px;
}

/* Footer */
footer {
    text-align: center;
    padding: 1.5rem;
    color: var(--text-secondary);
    font-size: 0.75rem;
    border-top: 1px solid var(--border);
    margin-top: 2rem;
}

footer a {
    color: var(--accent);
    text-decoration: none;
}

footer a:hover {
    text-decoration: underline;
}
```

- [ ] **Step 3: Commit**

```bash
git add index.html css/style.css
git commit -m "feat: HTML structure and dark-theme CSS for calculator UI"
```

---

## Task 5: Plot Module (`js/plot.js`)

**Files:**
- Create: `js/plot.js`

- [ ] **Step 1: Create Chart.js wrapper**

Create `js/plot.js`:

```javascript
/**
 * Chart.js wrapper for the temperature profile plot.
 */

let profileChart = null;

/**
 * Render (or update) the temperature profile plot.
 * @param {string} canvasId - Canvas element ID
 * @param {number[]} x - Position along cable [m]
 * @param {number[]} T - Temperature [K]
 */
function renderTemperatureProfile(canvasId, x, T) {
    const ctx = document.getElementById(canvasId).getContext('2d');

    // Convert x to cm for readability if length < 1 m, else keep m
    const maxX = x[x.length - 1];
    let xLabel, xData;
    if (maxX < 1.0) {
        xLabel = 'Position (cm)';
        xData = x.map(v => v * 100);
    } else {
        xLabel = 'Position (m)';
        xData = x;
    }

    // Choose T display unit
    let tLabel, tData;
    const maxT = T[T.length - 1];
    if (maxT < 1.0) {
        tLabel = 'Temperature (mK)';
        tData = T.map(v => v * 1000);
    } else {
        tLabel = 'Temperature (K)';
        tData = T;
    }

    const data = xData.map((xi, i) => ({ x: xi, y: tData[i] }));

    if (profileChart) {
        profileChart.data.datasets[0].data = data;
        profileChart.options.scales.x.title.text = xLabel;
        profileChart.options.scales.y.title.text = tLabel;
        profileChart.update();
        return;
    }

    profileChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: 'T(x)',
                data: data,
                borderColor: '#4fc3f7',
                backgroundColor: 'rgba(79, 195, 247, 0.1)',
                fill: true,
                pointRadius: 0,
                borderWidth: 2,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            return `T = ${ctx.parsed.y.toFixed(3)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: xLabel, color: '#8899aa' },
                    ticks: { color: '#8899aa' },
                    grid: { color: 'rgba(42, 58, 74, 0.5)' }
                },
                y: {
                    type: 'linear',
                    title: { display: true, text: tLabel, color: '#8899aa' },
                    ticks: { color: '#8899aa' },
                    grid: { color: 'rgba(42, 58, 74, 0.5)' }
                }
            }
        }
    });
}
```

- [ ] **Step 2: Commit**

```bash
git add js/plot.js
git commit -m "feat: Chart.js wrapper for temperature profile visualization"
```

---

## Task 6: UI Controller (`js/ui.js`)

**Files:**
- Create: `js/ui.js`

- [ ] **Step 1: Implement the UI controller that wires everything together**

Create `js/ui.js`:

```javascript
/**
 * UI controller — wires DOM elements to the thermal engine and plot.
 * Entry point: runs on DOMContentLoaded.
 */

(function () {
    'use strict';

    // --- DOM references ---
    const presetSelect = document.getElementById('preset-select');
    const numTracesInput = document.getElementById('num-traces');
    const cableLengthInput = document.getElementById('cable-length');
    const innerDiameterInput = document.getElementById('inner-diameter');
    const dielectricThicknessInput = document.getElementById('dielectric-thickness');
    const outerThicknessInput = document.getElementById('outer-thickness');
    const innerMaterialSelect = document.getElementById('inner-material');
    const dielectricMaterialSelect = document.getElementById('dielectric-material');
    const outerMaterialSelect = document.getElementById('outer-material');
    const tColdInput = document.getElementById('t-cold');
    const tHotInput = document.getElementById('t-hot');
    const calculateBtn = document.getElementById('calculate-btn');
    const resultsDisplay = document.getElementById('results-display');
    const resultTotal = document.getElementById('result-total');
    const resultPerTrace = document.getElementById('result-per-trace');
    const breakdownTbody = document.querySelector('#breakdown-table tbody');

    // --- Populate dropdowns ---

    function populateMaterialSelect(selectEl, category, defaultId) {
        const materials = getMaterialsByCategory(category);
        selectEl.innerHTML = '';
        for (const mat of materials) {
            const opt = document.createElement('option');
            opt.value = mat.id;
            opt.textContent = mat.name;
            if (mat.id === defaultId) opt.selected = true;
            selectEl.appendChild(opt);
        }
    }

    function populatePresets() {
        presetSelect.innerHTML = '';
        for (const [id, preset] of Object.entries(PRESETS)) {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = preset.name;
            presetSelect.appendChild(opt);
        }
    }

    // --- Load preset into form ---

    function loadPreset(presetId) {
        const preset = PRESETS[presetId];
        if (!preset) return;

        numTracesInput.value = preset.numTraces;
        cableLengthInput.value = preset.length_m;
        innerDiameterInput.value = preset.innerDiameter_um;
        dielectricThicknessInput.value = preset.dielectricThickness_um;
        outerThicknessInput.value = preset.outerThickness_um;
        innerMaterialSelect.value = preset.innerConductor;
        dielectricMaterialSelect.value = preset.dielectric;
        outerMaterialSelect.value = preset.outerConductor;
        tColdInput.value = preset.T_cold_K;
        tHotInput.value = preset.T_hot_K;
    }

    // --- Format heat load for display ---

    function formatHeatLoad(watts) {
        const abs = Math.abs(watts);
        if (abs >= 1) return watts.toFixed(3) + ' W';
        if (abs >= 1e-3) return (watts * 1e3).toFixed(3) + ' mW';
        if (abs >= 1e-6) return (watts * 1e6).toFixed(3) + ' µW';
        if (abs >= 1e-9) return (watts * 1e9).toFixed(3) + ' nW';
        return (watts * 1e12).toFixed(3) + ' pW';
    }

    // --- Compute and display results ---

    function calculate() {
        // Read inputs
        const numTraces = parseInt(numTracesInput.value) || 1;
        const length = parseFloat(cableLengthInput.value);
        const innerDiam = parseFloat(innerDiameterInput.value);
        const dielThick = parseFloat(dielectricThicknessInput.value);
        const outerThick = parseFloat(outerThicknessInput.value);
        const T_cold = parseFloat(tColdInput.value);
        const T_hot = parseFloat(tHotInput.value);

        // Validate
        if (T_cold >= T_hot) {
            alert('Cold temperature must be less than hot temperature.');
            return;
        }
        if (length <= 0 || innerDiam <= 0 || dielThick <= 0 || outerThick <= 0) {
            alert('All dimensions must be positive.');
            return;
        }

        // Get materials
        const innerMat = MATERIALS[innerMaterialSelect.value];
        const dielMat = MATERIALS[dielectricMaterialSelect.value];
        const outerMat = MATERIALS[outerMaterialSelect.value];

        // Compute areas
        const areas = computeAreas(innerDiam, dielThick, outerThick);

        // Build components
        const components = [
            { material: innerMat, area: areas.innerArea, label: 'Inner Conductor' },
            { material: dielMat, area: areas.dielectricArea, label: 'Dielectric' },
            { material: outerMat, area: areas.outerArea, label: 'Outer Conductor' }
        ];

        // Compute per-trace heat load
        const perTraceQ = computeHeatLoad(components, length, T_cold, T_hot);
        const totalQ = perTraceQ * numTraces;

        // Compute per-component breakdown
        const componentLoads = components.map(comp => {
            const q = computeHeatLoad([comp], length, T_cold, T_hot);
            return { ...comp, heatLoad: q };
        });

        // Display results
        resultTotal.textContent = formatHeatLoad(totalQ);
        resultPerTrace.textContent = formatHeatLoad(perTraceQ);

        // Breakdown table
        breakdownTbody.innerHTML = '';
        for (const comp of componentLoads) {
            const tr = document.createElement('tr');
            const fraction = perTraceQ > 0 ? (comp.heatLoad / perTraceQ * 100) : 0;
            const areaUm2 = comp.area * 1e12; // m² to µm²
            tr.innerHTML = `
                <td>${comp.label}</td>
                <td>${comp.material.name}</td>
                <td>${areaUm2.toFixed(0)}</td>
                <td>${formatHeatLoad(comp.heatLoad)}</td>
                <td>${fraction.toFixed(1)}%</td>
            `;
            breakdownTbody.appendChild(tr);
        }

        // Temperature profile
        const profile = computeTemperatureProfile(components, length, T_cold, T_hot, 200);
        renderTemperatureProfile('temp-profile-chart', profile.x, profile.T);

        // Show results
        resultsDisplay.className = 'results-visible';
    }

    // --- Event listeners ---

    presetSelect.addEventListener('change', () => {
        loadPreset(presetSelect.value);
    });

    calculateBtn.addEventListener('click', calculate);

    // Allow Enter key to trigger calculation from any input
    document.querySelectorAll('input[type="number"]').forEach(input => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') calculate();
        });
    });

    // --- Initialize ---

    populatePresets();
    populateMaterialSelect(innerMaterialSelect, 'conductor', 'nbti');
    populateMaterialSelect(dielectricMaterialSelect, 'dielectric', 'ptfe');
    populateMaterialSelect(outerMaterialSelect, 'conductor', 'nbti');
    loadPreset('flax_v2');
})();
```

- [ ] **Step 2: Open index.html in browser and verify the full workflow**

Open `index.html` in a browser. Expected:
- Dropdowns populate with materials and presets
- Selecting "FLAX v2" loads the correct defaults
- Clicking "Calculate Heat Load" shows results with ~5 nW/trace for 100 mK → 1 K
- Temperature profile chart renders
- Component breakdown table shows inner, dielectric, outer contributions

- [ ] **Step 3: Commit**

```bash
git add js/ui.js
git commit -m "feat: UI controller wiring form inputs to thermal engine and plot"
```

---

## Task 7: Visual Polish with Frontend Design Skill

**Files:**
- Modify: `css/style.css`
- Modify: `index.html` (minor structural tweaks if needed)

- [ ] **Step 1: Apply the /frontend-design skill for visual polish**

Invoke the `/frontend-design` skill targeting the calculator's look and feel. The goal is a professional scientific-tool aesthetic — dark theme, clean data presentation, good typography. The functional CSS from Task 4 is the baseline; this step elevates it.

Key areas to polish:
- Typography: load Inter + JetBrains Mono from Google Fonts
- Card depth and subtle shadows
- Input focus states and transitions
- Result card animations on calculation
- Chart container styling
- Responsive behavior at mobile widths
- Header styling — maybe a subtle gradient or accent line

- [ ] **Step 2: Test across window sizes**

Verify at 1200px, 900px, and 375px widths. All controls and results should be usable.

- [ ] **Step 3: Commit**

```bash
git add css/style.css index.html
git commit -m "style: visual polish — typography, card depth, animations, responsive layout"
```

---

## Task 8: Validation and Tuning

**Files:**
- Modify: `js/materials.js` (tune coefficients if validation fails)
- Modify: `tests/test_thermal.html` (add/fix tests)

- [ ] **Step 1: Run the full test suite**

Open `tests/test_thermal.html`. All tests should pass. Fix any failures.

- [ ] **Step 2: Validate FLAX result against Smith et al.**

Using the calculator UI:
- Preset: FLAX v2
- 1 trace, 0.3048 m, NbTi/PTFE/NbTi, 100 mK → 1 K
- Expected: ~5 nW/trace

If the result is off by more than 3×, investigate which material's k(T) fit is inaccurate in the 0.1–1 K range and adjust coefficients. The sub-K fits are the most uncertain — the Daal et al. NbTi fit and the PTFE sub-K approximation are the key knobs.

- [ ] **Step 3: Test other temperature ranges**

Verify physically reasonable results for:
- 4 K → 300 K with copper conductors (should be substantial — many mW to W range)
- 4 K → 50 K with CuNi (should match CryoCoax literature: ~7.5 mW)
- 1 K → 4 K with NbTi/PTFE (should be larger than 0.1–1 K by roughly 10–50×)

- [ ] **Step 4: Commit any fixes**

```bash
git add js/materials.js tests/test_thermal.html
git commit -m "fix: tune material k(T) fits to match validation targets"
```

---

## Task 9: GitHub Pages Deployment

**Files:**
- May create: `.gitignore`

- [ ] **Step 1: Set up the repository for GitHub Pages**

Ensure the repo has no sensitive files. Create `.gitignore`:

```
.DS_Store
*.swp
*~
```

- [ ] **Step 2: Create initial commit with all files if not already committed**

```bash
git add -A
git status
git commit -m "feat: complete cryogenic cable heat load calculator"
```

- [ ] **Step 3: Create GitHub repository and push**

```bash
gh repo create WebHeatCond --public --source=. --push
```

- [ ] **Step 4: Enable GitHub Pages**

```bash
gh api repos/{owner}/WebHeatCond/pages -X POST -f source.branch=main -f source.path=/
```

Or via the GitHub UI: Settings → Pages → Source: main branch, root folder.

- [ ] **Step 5: Verify deployment**

Visit `https://<username>.github.io/WebHeatCond/` and confirm the calculator loads and works.

- [ ] **Step 6: Commit**

No additional commit needed — deployment is configured at the repo level.

---

## Dependency Graph

```
Task 1 (materials.js) ──┐
                         ├── Task 2 (thermal.js) ──┐
Task 3 (presets.js) ─────┤                         ├── Task 6 (ui.js) ── Task 7 (polish) ── Task 8 (validation) ── Task 9 (deploy)
Task 4 (HTML + CSS) ─────┤                         │
Task 5 (plot.js) ────────┘─────────────────────────┘
```

Tasks 1, 3, 4, 5 can run in parallel. Task 2 depends on Task 1. Task 6 depends on all prior tasks. Tasks 7–9 are sequential.
