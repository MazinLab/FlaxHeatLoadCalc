/**
 * Cryogenic thermal conductivity material database.
 *
 * Each material stores piecewise k(T) fits:
 *   - NIST 8th-degree log-log polynomial (typically 1–300 K or 4–300 K)
 *   - Sub-kelvin power law or log-polynomial (typically 0.05–4 K)
 *   - Stitching region uses log-linear blending over a transition window
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
 * @returns {number} Thermal conductivity in W/(m·K)
 */
function powerLaw(a, b, T) {
    return a * Math.pow(T, b);
}

/**
 * Log-polynomial fit for sub-K data: log10(k) = sum(a_i * log10(T)^i)
 * Mathematically identical to nistLogPoly but named separately to reflect
 * the different data source (e.g., Daal et al. sub-K measurements).
 * @param {number[]} coeffs - Polynomial coefficients [a0, a1, a2, ...]
 * @param {number} T - Temperature in Kelvin
 * @returns {number} Thermal conductivity in W/(m·K)
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
 * NIST rational polynomial for OFHC copper (NIST SRD 81 form).
 * Uses W = log10(T) as the independent variable (valid for T >= 4 K, so W >= 0):
 *   P = a + c*W^0.5 + e*W + g*W^1.5 + i*W^2
 *   Q = 1 + b*W^0.5 + d*W + f*W^1.5 + h*W^2
 *   k = 10^(P/Q)
 * @param {number[]} coeffs - [a, b, c, d, e, f, g, h, i]
 * @param {number} T - Temperature in Kelvin (expected >= 1 K; used only above stitch range)
 * @returns {number} Thermal conductivity in W/(m·K)
 */
function nistCopperRational(coeffs, T) {
    const [a, b, c, d, e, f, g, h, ii] = coeffs;
    const W = Math.log10(T);
    // W^0.5 is only real for W >= 0 (T >= 1 K).
    // Below T = 1 K, fall back to the T = 1 K intercept value (k = 10^a).
    if (W < 0) {
        return Math.pow(10, a);
    }
    const W05 = Math.sqrt(W);
    const W15 = W * W05;
    const W2 = W * W;
    const num = a + c * W05 + e * W + g * W15 + ii * W2;
    const den = 1 + b * W05 + d * W + f * W15 + h * W2;
    return Math.pow(10, num / den);
}

/**
 * Dispatch to the correct fit evaluator based on fit.type.
 * @param {object} fit - Fit object with type and coefficients
 * @param {number} T - Temperature in Kelvin
 * @returns {number} Thermal conductivity in W/(m·K)
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

/**
 * Evaluate k(T) for a material using its piecewise fits with log-space blending.
 *
 * Stitching rules:
 *   - Below stitchRange[0]: sub-K fit only
 *   - Above stitchRange[1]: main fit only
 *   - In between: log-linear interpolation between sub-K and main fits
 *
 * @param {object} material - Material definition from MATERIALS
 * @param {number} T - Temperature in Kelvin
 * @returns {number} Thermal conductivity in W/(m·K)
 */
function getThermalConductivity(material, T) {
    const T_min = material.validRange[0];
    const T_max = material.validRange[1];
    T = Math.max(T_min, Math.min(T_max, T));

    if (!material.subK) {
        return evaluateFit(material.mainFit, T);
    }

    const tLo = material.stitchRange[0];
    const tHi = material.stitchRange[1];

    if (T <= tLo) {
        return evaluateFit(material.subK, T);
    } else if (T >= tHi) {
        return evaluateFit(material.mainFit, T);
    } else {
        // Log-linear blend between sub-K and main fits
        const frac = (Math.log10(T) - Math.log10(tLo)) / (Math.log10(tHi) - Math.log10(tLo));
        const logKSubK = Math.log10(evaluateFit(material.subK, T));
        const logKMain = Math.log10(evaluateFit(material.mainFit, T));
        return Math.pow(10, logKSubK * (1 - frac) + logKMain * frac);
    }
}

/**
 * Evaluate electrical resistivity ρ(T) for a conductor material.
 * Uses the same piecewise stitching approach as getThermalConductivity().
 * @param {object} material - Material definition with resistivity field
 * @param {number} T - Temperature in Kelvin
 * @returns {number} Electrical resistivity in Ohm·m
 */
function getResistivity(material, T) {
    if (!material.resistivity) {
        throw new Error('No resistivity data for material: ' + material.name);
    }
    const r = material.resistivity;
    const T_min = r.validRange ? r.validRange[0] : material.validRange[0];
    const T_max = r.validRange ? r.validRange[1] : material.validRange[1];
    T = Math.max(T_min, Math.min(T_max, T));

    if (!r.subK) {
        return evaluateFit(r.mainFit, T);
    }

    const tLo = r.stitchRange[0];
    const tHi = r.stitchRange[1];

    if (T <= tLo) {
        return evaluateFit(r.subK, T);
    } else if (T >= tHi) {
        return evaluateFit(r.mainFit, T);
    } else {
        const frac = (Math.log10(T) - Math.log10(tLo)) / (Math.log10(tHi) - Math.log10(tLo));
        const logRhoSubK = Math.log10(evaluateFit(r.subK, T));
        const logRhoMain = Math.log10(evaluateFit(r.mainFit, T));
        return Math.pow(10, logRhoSubK * (1 - frac) + logRhoMain * frac);
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
            // log10(k [mW/(m·K)]) = 1.80 + 1.74*log10(T) - 0.292*log10(T)^2 - 0.027*log10(T)^3
            // Converted to W/(m·K) by subtracting 3 from the constant term (dividing by 1000)
            type: 'log_poly',
            coeffs: [-1.20, 1.74, -0.292, -0.027]
        },
        mainFit: {
            // Fitted to Duthil 2015 (arXiv:1501.07100) Table A.3 tabulated data:
            // k(4K)≈0.09, k(10K)≈0.37, k(20K)≈1.0, k(77K)≈5.0, k(300K)≈8.0
            type: 'nist_log_poly',
            coeffs: [-1.4262, 2.5675, -2.6517, 2.2428, -1.1561, 0.3547, -0.0594, 0.0041, 0]
        },
        source: 'Sub-K: Daal et al. 2019, Cryogenics 98, 47-59. Main: Duthil 2015 (arXiv:1501.07100) Table A.3',
        Tc: 9.8,
        normalStateResistivity: 6.0e-7  // Ohm·m, NbTi above Tc
    },

    nb: {
        name: 'Niobium (Nb, RRR~40)',
        category: 'conductor',
        superconducting: true,
        validRange: [0.1, 300],
        stitchRange: [1.5, 4.0],
        subK: {
            // Superconducting below Tc=9.25 K; phonon boundary scattering dominates
            // k ~ T^3 (Casimir regime) for T << Tc; fit for commercial Nb RRR~40
            // Kes et al. 1974, J. Low Temp. Phys. 17, 341; Townsend & Sutton 1962
            type: 'power_law',
            a: 0.5,
            b: 2.5
        },
        mainFit: {
            // Commercial Nb (RRR~40): k(4K)~10 (Padamsee: RRR/4), k(300K)~54
            // Touloukian TPRC Vol 1; Koechlin & Bonin 1995 (SRF95F24)
            // Note: k(T) is highly RRR-dependent below 20K
            type: 'nist_log_poly',
            coeffs: [-0.1200, 2.1430, -1.0541, 0.3028, -0.0402, -0.0032, 0.0010, 0, 0]
        },
        source: 'Sub-K: Kes et al. 1974, J. Low Temp. Phys. 17, 341; Townsend & Sutton 1962. Main: Touloukian TPRC Vol 1; Koechlin & Bonin 1995. Note: RRR~40 (commercial grade); k is highly RRR-dependent below 20K.',
        Tc: 9.25,
        normalStateResistivity: 1.5e-7  // Ohm·m, commercial Nb RRR~40 above Tc
    },

    copper_rrr50: {
        name: 'Copper (RRR=50)',
        category: 'conductor',
        superconducting: false,
        validRange: [0.1, 300],
        stitchRange: [1.0, 2.0],
        subK: {
            // Wiedemann-Franz: k = L0*T/rho_0
            // RRR=50 → rho_0 ≈ 3.4e-10 Ohm·m → k ≈ L0/rho_0 * T = 71.9*T
            type: 'power_law',
            a: 71.9,
            b: 1.0
        },
        mainFit: {
            type: 'nist_copper_rational',
            coeffs: [1.8743, -0.41538, -0.6018, 0.13294, 0.26426, -0.0219, -0.051276, 0.0014871, 0.003723]
        },
        source: 'NIST Cryogenic Materials Database, OFHC Copper RRR=50',
        resistivity: {
            mainFit: { type: 'power_law', a: 3.4e-10, b: 0 }  // rho_0 = 1.7e-8 / 50
        }
    },

    copper_rrr100: {
        name: 'Copper (RRR=100)',
        category: 'conductor',
        superconducting: false,
        validRange: [0.1, 300],
        stitchRange: [1.0, 2.0],
        subK: {
            // RRR=100 → rho_0 ≈ 1.7e-10 Ohm·m → k ≈ 144*T
            type: 'power_law',
            a: 144,
            b: 1.0
        },
        mainFit: {
            type: 'nist_copper_rational',
            coeffs: [2.2154, -0.47461, -0.88068, 0.13871, 0.29505, -0.02043, -0.04831, 0.001281, 0.003207]
        },
        source: 'NIST Cryogenic Materials Database, OFHC Copper RRR=100',
        resistivity: {
            mainFit: { type: 'power_law', a: 1.7e-10, b: 0 }  // rho_0 = 1.7e-8 / 100
        }
    },

    copper_rrr150: {
        name: 'Copper (RRR=150)',
        category: 'conductor',
        superconducting: false,
        validRange: [0.1, 300],
        stitchRange: [1.0, 2.0],
        subK: {
            // RRR=150 → rho_0 ≈ 1.13e-10 Ohm·m → k ≈ 216*T
            type: 'power_law',
            a: 216,
            b: 1.0
        },
        mainFit: {
            type: 'nist_copper_rational',
            coeffs: [2.3797, -0.4918, -0.98615, 0.13942, 0.30475, -0.019713, -0.046897, 0.0011969, 0.0029988]
        },
        source: 'NIST Cryogenic Materials Database, OFHC Copper RRR=150',
        resistivity: {
            mainFit: { type: 'power_law', a: 1.13e-10, b: 0 }  // rho_0 = 1.7e-8 / 150
        }
    },

    copper_rrr300: {
        name: 'Copper (RRR=300)',
        category: 'conductor',
        superconducting: false,
        validRange: [0.1, 300],
        stitchRange: [3.0, 4.0],
        subK: {
            // RRR=300 → rho_0 ≈ 5.7e-11 Ohm·m → k ≈ 430*T
            // Note: NIST rational polynomial extrapolates badly below 4K for this RRR,
            // so stitch range is raised to [3, 4] K to avoid the pathological region.
            type: 'power_law',
            a: 430,
            b: 1.0
        },
        mainFit: {
            type: 'nist_copper_rational',
            coeffs: [1.357, 0.3981, 2.669, -0.1346, -0.6683, 0.01342, 0.05773, 0.0002147, 0]
        },
        source: 'NIST Cryogenic Materials Database, OFHC Copper RRR=300',
        resistivity: {
            mainFit: { type: 'power_law', a: 5.67e-11, b: 0 }  // rho_0 = 1.7e-8 / 300
        }
    },

    copper_rrr500: {
        name: 'Copper (RRR=500)',
        category: 'conductor',
        superconducting: false,
        validRange: [0.1, 300],
        stitchRange: [1.0, 2.0],
        subK: {
            // RRR=500 → rho_0 ≈ 3.4e-11 Ohm·m → k ≈ 717*T
            type: 'power_law',
            a: 717,
            b: 1.0
        },
        mainFit: {
            type: 'nist_copper_rational',
            coeffs: [2.8075, -0.54074, -1.2777, 0.15362, 0.36444, -0.02105, -0.051727, 0.0012226, 0.0030964]
        },
        source: 'NIST Cryogenic Materials Database, OFHC Copper RRR=500',
        resistivity: {
            mainFit: { type: 'power_law', a: 3.4e-11, b: 0 }  // rho_0 = 1.7e-8 / 500
        }
    },

    aluminum: {
        name: 'Aluminum (6061-T6)',
        category: 'conductor',
        superconducting: false,
        validRange: [0.1, 300],
        stitchRange: [1.0, 4.0],
        subK: {
            // Wiedemann-Franz for 6061-T6 Al: rho_0 ≈ 5e-9 Ohm·m → k ≈ 4.9*T
            type: 'power_law',
            a: 4.9,
            b: 1.0
        },
        mainFit: {
            // NIST 6061-T6 Aluminum
            type: 'nist_log_poly',
            coeffs: [0.07918, 1.0957, -0.07277, 0.08084, 0.02803, -0.09464, 0.04179, -0.00571, 0]
        },
        source: 'NIST Cryogenic Materials Database, Aluminum 6061-T6',
        resistivity: {
            mainFit: { type: 'power_law', a: 5.0e-9, b: 0 }  // residual rho for 6061-T6
        }
    },

    phosphor_bronze: {
        name: 'Phosphor Bronze (C51000)',
        category: 'conductor',
        superconducting: false,
        validRange: [0.1, 300],
        stitchRange: [2.0, 4.0],
        subK: {
            // Wiedemann-Franz: L0/rho_0 = 2.44e-8/1.1e-7 = 0.22 W/(m·K²)
            // Consistent with Lakeshore wire catalogue: k(1K) ≈ 0.22 W/(m·K)
            type: 'power_law',
            a: 0.22,
            b: 1.0
        },
        mainFit: {
            // Lakeshore/literature: k(4K)≈0.5, k(10K)≈3, k(20K)≈8, k(77K)≈25, k(300K)≈48
            // Wire-grade C51000 (lower than annealed bulk ~69 W/(m·K) due to cold-work)
            // Degree-4 log-log polynomial fit
            type: 'nist_log_poly',
            coeffs: [-1.926238, 3.082351, -0.531515, -0.21318, 0.065704, 0, 0, 0, 0]
        },
        source: 'Sub-K: Wiedemann-Franz with rho_0=1.1e-7 Ohm·m (Lakeshore). Main: Literature data, wire-grade C51000.',
        resistivity: {
            mainFit: { type: 'power_law', a: 1.1e-7, b: 0 }  // nearly constant
        }
    },

    manganin: {
        name: 'Manganin',
        category: 'conductor',
        superconducting: false,
        validRange: [0.05, 300],
        stitchRange: [3.0, 4.0],
        subK: {
            // Pobell et al. 1999 (Nucl. Phys. B 78:573): k = 0.079 * T^1.22, 0.05–1 K
            type: 'power_law',
            a: 0.079,
            b: 1.22
        },
        mainFit: {
            // Lakeshore data: k(4K)≈0.5, k(10K)≈2, k(20K)≈3.3, k(80K)≈13, k(300K)≈22
            // Degree-4 log-log polynomial fit to these 5 data points
            type: 'nist_log_poly',
            coeffs: [-4.052022, 11.413457, -11.477502, 5.289629, -0.872532, 0, 0, 0, 0]
        },
        source: 'Sub-K: Pobell et al. 1999, Nucl. Phys. B Proc. Suppl. 78, 573. Main: Lakeshore wire catalogue data.',
        resistivity: {
            mainFit: { type: 'power_law', a: 4.3e-7, b: 0 }  // nearly constant
        }
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
            // CuNi C7150 from arXiv:2502.01945 (SC-086 coax study)
            type: 'nist_log_poly',
            coeffs: [-3.198, 20.499, -66.114, 117.690, -121.477, 76.215, -28.749, 5.985, -0.527]
        },
        source: 'Main: arXiv:2502.01945 (SC-086 coax study). Sub-K: CERN Constantan approx.',
        resistivity: {
            // RRR ≈ 1.8 from Coax Co. SC-086/50-CN-CN datasheet (24.3→18.1 dB/m at 10 GHz)
            subK: { type: 'power_law', a: 1.93e-7, b: 0 },    // residual rho at T < 10K
            mainFit: { type: 'power_law', a: 3.5e-7, b: 0 },   // room-temp rho
            stitchRange: [10, 100]
        }
    },

    cuni_maybell: {
        name: 'CuNi (Maybell)',
        category: 'conductor',
        superconducting: false,
        validRange: [0.1, 300],
        stitchRange: [2.0, 4.0],
        subK: {
            // Wiedemann-Franz: L0/rho_0 = 2.44e-8/6.24e-7 = 0.039 W/(m·K²)
            type: 'power_law',
            a: 0.039,
            b: 1.0
        },
        mainFit: {
            // Using Coax Co. C7150 k(T) shape scaled — higher rho alloy but
            // similar phonon spectrum. Adequate for heat load estimates.
            type: 'nist_log_poly',
            coeffs: [-3.198, 20.499, -66.114, 117.690, -121.477, 76.215, -28.749, 5.985, -0.527]
        },
        source: 'Resistivity fitted to Mazin lab FLAX-style CuNi/CuNi cable measurements. k(T) shape from arXiv:2502.01945.',
        resistivity: {
            // Fitted from measured S21: -15 dB at 4 GHz (290K), -12 dB at 4 GHz (4K)
            // rho(290K) = 1.01e-6, rho(4K) = 6.24e-7, RRR ≈ 1.6
            // Note: effective rho absorbs coaxial-model approximation for ribbon geometry
            subK: { type: 'power_law', a: 6.24e-7, b: 0 },
            mainFit: { type: 'power_law', a: 1.01e-6, b: 0 },
            stitchRange: [10, 100]
        }
    },

    cuni_ag: {
        name: 'Silver-Plated CuNi',
        category: 'conductor',
        superconducting: false,
        validRange: [0.1, 300],
        stitchRange: [2.0, 4.0],
        subK: {
            // Bulk CuNi contribution: same as bare cuni
            // Silver plating thermal contribution handled via bilayer model
            type: 'power_law',
            a: 0.10,
            b: 1.1
        },
        mainFit: {
            // Same as cuni for bulk thermal conductivity
            type: 'nist_log_poly',
            coeffs: [-3.198, 20.499, -66.114, 117.690, -121.477, 76.215, -28.749, 5.985, -0.527]
        },
        source: 'CuNi C7150 + Ag plating bilayer. arXiv:2502.01945.',
        baseMaterial: 'cuni',
        plating: {
            material: 'silver',
            defaultThickness_um: 3.0
        },
        resistivity: {
            // Silver RRR≈20 (electroplated): rho_0=8e-10, rho(300K)=1.6e-8
            subK: { type: 'power_law', a: 8e-10, b: 0 },
            mainFit: { type: 'power_law', a: 1.6e-8, b: 0 },
            stitchRange: [10, 100]
        }
    },

    ss304: {
        name: '304 Stainless Steel',
        category: 'conductor',
        superconducting: false,
        validRange: [0.1, 300],
        stitchRange: [1.0, 4.0],
        subK: {
            // Wiedemann-Franz: L0/rho_0 = 2.44e-8 / 2.2e-7 = 0.111 W/(m·K²)
            // Consistent with resistivity RRR≈3.3 from Coax Co. SC-219 datasheet
            type: 'power_law',
            a: 0.111,
            b: 1.0
        },
        mainFit: {
            // NIST 304 Stainless Steel
            type: 'nist_log_poly',
            coeffs: [-1.4087, 1.3982, 0.2543, -0.6260, 0.2334, 0.4256, -0.4658, 0.1650, -0.0199]
        },
        source: 'NIST Cryogenic Materials Database, 304 Stainless Steel.',
        resistivity: {
            // RRR ≈ 3.3: rho drops from ~7.2e-7 at 300K to ~2.2e-7 at 4K
            // Fitted to Coax Co. SC-219/50-SSS-SS 300K/4K attenuation ratio
            subK: { type: 'power_law', a: 2.2e-7, b: 0 },     // residual rho
            mainFit: { type: 'power_law', a: 7.2e-7, b: 0 },   // room-temp rho
            stitchRange: [10, 100]
        }
    },

    silver: {
        name: 'Silver (Ag, RRR≈20)',
        category: 'conductor',
        superconducting: false,
        validRange: [0.1, 300],
        stitchRange: [2.0, 4.0],
        subK: {
            // Wiedemann-Franz: rho_0 = 1.59e-8/20 = 7.95e-10 Ohm·m → k = 30.7*T
            // RRR≈20 typical for electroplated silver (Kuroda et al. 2018)
            type: 'power_law',
            a: 30.7,
            b: 1.0
        },
        mainFit: {
            // Fit to Smith & Fickett 1995 RRR≈20-30 data (TPRC Vol 1)
            // k(4K)≈100, k(20K)≈400, k(77K)≈435, k(200K)≈428, k(300K)≈427
            type: 'nist_log_poly',
            coeffs: [0.093786, 4.89597, -3.481567, 1.08633, -0.125891, 0, 0, 0, 0]
        },
        source: 'Smith & Fickett 1995, J. Res. NIST 100(2). Sub-K: Wiedemann-Franz, RRR≈20 (electroplated).',
        resistivity: {
            subK: { type: 'power_law', a: 8e-10, b: 0 },       // residual rho, RRR≈20
            mainFit: { type: 'power_law', a: 1.6e-8, b: 0 },    // rho(300K)
            stitchRange: [10, 100]
        }
    },

    ss304_ag: {
        name: 'Silver-Plated 304 SS',
        category: 'conductor',
        superconducting: false,
        validRange: [0.1, 300],
        stitchRange: [1.0, 4.0],
        subK: {
            // Bulk SS304 contribution: Wiedemann-Franz L0/rho_0 = 0.111 W/(m·K²)
            // Silver plating thermal contribution handled as a separate parallel
            // component via the bilayer model (see plating field below)
            type: 'power_law',
            a: 0.111,
            b: 1.0
        },
        mainFit: {
            // Same as SS304 for bulk thermal conductivity
            type: 'nist_log_poly',
            coeffs: [-1.4087, 1.3982, 0.2543, -0.6260, 0.2334, 0.4256, -0.4658, 0.1650, -0.0199]
        },
        source: 'NIST 304 SS + Ag plating bilayer. Kuroda et al. 2018, J. Low Temp. Phys. 193, 611.',
        // Bilayer model: silver plating treated as a separate parallel thermal path
        baseMaterial: 'ss304',
        plating: {
            material: 'silver',
            defaultThickness_um: 3.0   // µm, typical for semi-rigid coax (Kuroda et al. 2018)
        },
        // For RF, skin depth at GHz is ~1 µm, well within Ag plating — use silver resistivity.
        resistivity: {
            subK: { type: 'power_law', a: 8e-10, b: 0 },
            mainFit: { type: 'power_law', a: 1.6e-8, b: 0 },
            stitchRange: [10, 100]
        }
    },

    phosphor_bronze_ag: {
        name: 'Silver-Plated Phosphor Bronze',
        category: 'conductor',
        superconducting: false,
        validRange: [0.1, 300],
        stitchRange: [2.0, 4.0],
        subK: {
            // Bulk PhBr contribution: Wiedemann-Franz L0/rho_0 = 0.22 W/(m·K²)
            // Silver plating thermal contribution handled via bilayer model
            type: 'power_law',
            a: 0.22,
            b: 1.0
        },
        mainFit: {
            // Same as phosphor_bronze for bulk thermal conductivity
            type: 'nist_log_poly',
            coeffs: [-1.926238, 3.082351, -0.531515, -0.21318, 0.065704, 0, 0, 0, 0]
        },
        source: 'Phosphor Bronze C51000 + Ag plating bilayer.',
        baseMaterial: 'phosphor_bronze',
        plating: {
            material: 'silver',
            defaultThickness_um: 3.0
        },
        resistivity: {
            subK: { type: 'power_law', a: 8e-10, b: 0 },
            mainFit: { type: 'power_law', a: 1.6e-8, b: 0 },
            stitchRange: [10, 100]
        }
    },

    nichrome: {
        name: 'Nichrome (NiCr)',
        category: 'conductor',
        superconducting: false,
        validRange: [0.5, 300],
        stitchRange: [3.0, 5.0],
        subK: {
            // Sparse literature: k ≈ 0.07*T^1.3 W/(m·K) below ~2 K
            type: 'power_law',
            a: 0.07,
            b: 1.3
        },
        mainFit: {
            // Lakeshore: k(4K)≈0.25, k(10K)≈0.7, k(20K)≈2.6, k(80K)≈8, k(300K)≈12
            // Degree-4 log-log polynomial fit to these 5 data points
            type: 'nist_log_poly',
            coeffs: [2.587817, -12.583101, 16.253085, -7.633205, 1.220501, 0, 0, 0, 0]
        },
        source: 'Lakeshore wire catalogue data.',
        resistivity: {
            mainFit: { type: 'power_law', a: 1.1e-6, b: 0 }  // nearly constant
        }
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
            // Kushino et al. 2005, Cryogenics 45(9): A=19.9 µW/(cm·K^(B+1)), B=1.9
            // k = 1.99e-3 * T^1.9 W/(m·K), valid 0.3–4.5 K
            // Confirmed by Daal et al. 2017 (Cryogenics 85): ~T^2 dependence at sub-K
            type: 'power_law',
            a: 2.0e-3,
            b: 1.9
        },
        mainFit: {
            // NIST Teflon (PTFE)
            type: 'nist_log_poly',
            coeffs: [2.7380, -30.677, 89.430, -136.99, 124.69, -69.556, 23.320, -4.3135, 0.33829]
        },
        epsilon_r: 2.1,
        tanDelta: 2e-4,
        source: 'NIST Cryogenic Materials Database, Teflon. Sub-K: Kushino et al. 2005, Cryogenics 45(9).'
    },

    fep: {
        name: 'FEP (PTFE proxy)',
        category: 'dielectric',
        superconducting: false,
        validRange: [0.1, 300],
        stitchRange: [2.0, 5.0],
        subK: {
            // FEP cryogenic k(T) not well documented; PTFE used as proxy per Smith et al. 2024
            // Same as PTFE: Kushino et al. 2005, k = 2.0e-3 * T^1.9
            type: 'power_law',
            a: 2.0e-3,
            b: 1.9
        },
        mainFit: {
            // Same as PTFE per Smith et al. 2024 (IEEE TAS) approach
            type: 'nist_log_poly',
            coeffs: [2.7380, -30.677, 89.430, -136.99, 124.69, -69.556, 23.320, -4.3135, 0.33829]
        },
        epsilon_r: 2.1,
        tanDelta: 2e-4,
        source: 'Using PTFE as proxy — FEP cryogenic k(T) not well documented. Per Smith et al. 2024 (IEEE TAS).'
    },

    kapton: {
        name: 'Kapton (Polyimide)',
        category: 'dielectric',
        superconducting: false,
        validRange: [0.05, 300],
        stitchRange: [2.0, 5.0],
        subK: {
            // Daal et al. 2019, Cryogenics 98, Table 2 (Cirlex polyimide, 0.05–1.4 K)
            // log10(k [W/(m·K)]) = -2.33 + 0.544*log10(T) - 0.436*log10(T)^2 + 0.0754*log10(T)^3
            // Confirmed by Barucci et al. 2000: k(1K) = 4.6 mW/(m·K) for Kapton HN
            type: 'log_poly',
            coeffs: [-2.33, 0.544, -0.436, 0.0754]
        },
        mainFit: {
            // NIST Polyimide/Kapton
            type: 'nist_log_poly',
            coeffs: [5.73101, -39.5199, 79.9313, -83.8572, 50.9157, -17.9835, 3.42413, -0.27133, 0]
        },
        epsilon_r: 3.4,
        tanDelta: 2.75e-4,
        source: 'NIST Cryogenic Materials Database, Polyimide/Kapton. Sub-K: Daal et al. 2019.'
    },

    g10: {
        name: 'G-10 (Fiberglass Epoxy)',
        category: 'dielectric',
        superconducting: false,
        validRange: [0.5, 300],
        stitchRange: [2.0, 5.0],
        subK: {
            // Sparse data below 1 K; approximate k ~ 0.01*T^1.5 W/(m·K)
            type: 'power_law',
            a: 0.01,
            b: 1.5
        },
        mainFit: {
            // NIST G-10 (normal to cloth)
            type: 'nist_log_poly',
            coeffs: [-4.1236, 13.788, -26.068, 26.272, -14.663, 4.4954, -0.6905, 0.0397, 0]
        },
        epsilon_r: 4.5,
        tanDelta: 0.01,
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
        .filter(([, m]) => m.category === category)
        .map(([id, m]) => ({ id, name: m.name }));
}
