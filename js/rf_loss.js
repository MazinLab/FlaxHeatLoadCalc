/**
 * RF cable loss (S21) physics engine for coaxial transmission lines.
 *
 * Computes frequency-dependent attenuation by integrating conductor and
 * dielectric losses along the cable using the temperature profile T(x).
 *
 * Conductor loss uses the skin-effect surface resistance model.
 * Superconductors have zero conductor loss below Tc.
 * Dielectric loss uses the loss tangent model.
 *
 * All attenuation in Neper/m internally, converted to dB for output.
 */

const MU_0 = 4 * Math.PI * 1e-7;    // Vacuum permeability [H/m]
const C_LIGHT = 299792458;            // Speed of light [m/s]
const Z0_COAX = 50;                   // Characteristic impedance [Ohm] (fixed)
const NP_TO_DB = 8.686;               // Neper to dB conversion factor

/**
 * Surface resistance from skin effect.
 * Rs = sqrt(pi * mu0 * f * rho)
 * @param {number} rho - Resistivity [Ohm·m]
 * @param {number} f - Frequency [Hz]
 * @returns {number} Surface resistance [Ohm]
 */
function surfaceResistance(rho, f) {
    return Math.sqrt(Math.PI * MU_0 * f * rho);
}

/**
 * Dielectric attenuation per unit length.
 * alpha_d = pi * f * sqrt(epsilon_r) * tan(delta) / c
 * @param {number} f - Frequency [Hz]
 * @param {number} epsilon_r - Relative permittivity
 * @param {number} tanDelta - Loss tangent
 * @returns {number} Attenuation [Np/m]
 */
function dielectricAttenuation(f, epsilon_r, tanDelta) {
    return (Math.PI * f * Math.sqrt(epsilon_r) * tanDelta) / C_LIGHT;
}

/**
 * Get surface resistance for a material at given temperature and frequency.
 * - Superconductors below Tc: returns 0 (zero conductor loss)
 * - Superconductors above Tc: uses normalStateResistivity
 * - Normal conductors: uses rho(T) from resistivity fits
 *
 * @param {object} material - Material from MATERIALS
 * @param {number} T - Temperature [K]
 * @param {number} f - Frequency [Hz]
 * @returns {number} Surface resistance [Ohm]
 */
function materialSurfaceResistance(material, T, f) {
    if (material.superconducting && T <= material.Tc) {
        return 0;
    }
    let rho;
    if (material.superconducting && T > material.Tc) {
        rho = material.normalStateResistivity;
    } else {
        rho = getResistivity(material, T);
    }
    return surfaceResistance(rho, f);
}

/**
 * Conductor attenuation at a single point along the cable.
 * Handles different inner/outer conductor materials:
 *   alpha_c = (Rs_inner/a + Rs_outer/b) / (2 * Z0 * ln(b/a))
 *
 * @param {number} f - Frequency [Hz]
 * @param {number} T - Temperature [K]
 * @param {object} innerMat - Inner conductor material
 * @param {object} outerMat - Outer conductor material
 * @param {number} a - Inner conductor radius [m]
 * @param {number} b - Outer conductor inner radius [m]
 * @returns {number} alpha_c [Np/m]
 */
function conductorLossAtPoint(f, T, innerMat, outerMat, a, b) {
    const Rs_inner = materialSurfaceResistance(innerMat, T, f);
    const Rs_outer = materialSurfaceResistance(outerMat, T, f);
    return (Rs_inner / a + Rs_outer / b) / (2 * Z0_COAX * Math.log(b / a));
}

/**
 * Compute S21 cable transmission by integrating attenuation along the cable.
 *
 * Uses the temperature profile T(x) from computeTemperatureProfile().
 * For each frequency, integrates alpha_total(f, T(x)) over x using
 * the trapezoidal rule on the discrete profile points.
 *
 * @param {{x: number[], T: number[]}} profile - Temperature profile
 * @param {object} innerMat - Inner conductor material
 * @param {object} outerMat - Outer conductor material
 * @param {object} dielMat - Dielectric material (must have epsilon_r, tanDelta)
 * @param {number} a - Inner conductor radius [m]
 * @param {number} b - Outer conductor inner radius (a + dielectric thickness) [m]
 * @param {number[]} frequencies - Array of frequencies [Hz]
 * @returns {{frequencies: number[], s21_total: number[], s21_conductor: number[], s21_dielectric: number[]}}
 *   S21 values in dB (negative = loss)
 */
function computeS21(profile, innerMat, outerMat, dielMat, a, b, frequencies) {
    const { x, T } = profile;
    const n = x.length;
    const epsilon_r = dielMat.epsilon_r;
    const tanDelta = dielMat.tanDelta;
    const lnBA = Math.log(b / a);

    const s21_total = [];
    const s21_inner = [];
    const s21_outer = [];
    const s21_dielectric = [];

    for (const f of frequencies) {
        let integralInner = 0;
        let integralOuter = 0;
        let integralDielectric = 0;

        const alpha_d = dielectricAttenuation(f, epsilon_r, tanDelta);

        for (let i = 0; i < n - 1; i++) {
            const dx = x[i + 1] - x[i];

            // Inner conductor loss
            const Rs_in_i = materialSurfaceResistance(innerMat, T[i], f);
            const Rs_in_next = materialSurfaceResistance(innerMat, T[i + 1], f);
            const alpha_in_i = Rs_in_i / (a * 2 * Z0_COAX * lnBA);
            const alpha_in_next = Rs_in_next / (a * 2 * Z0_COAX * lnBA);
            integralInner += 0.5 * (alpha_in_i + alpha_in_next) * dx;

            // Outer conductor loss
            const Rs_out_i = materialSurfaceResistance(outerMat, T[i], f);
            const Rs_out_next = materialSurfaceResistance(outerMat, T[i + 1], f);
            const alpha_out_i = Rs_out_i / (b * 2 * Z0_COAX * lnBA);
            const alpha_out_next = Rs_out_next / (b * 2 * Z0_COAX * lnBA);
            integralOuter += 0.5 * (alpha_out_i + alpha_out_next) * dx;

            integralDielectric += alpha_d * dx;
        }

        s21_inner.push(-NP_TO_DB * integralInner);
        s21_outer.push(-NP_TO_DB * integralOuter);
        s21_dielectric.push(-NP_TO_DB * integralDielectric);
        s21_total.push(-NP_TO_DB * (integralInner + integralOuter + integralDielectric));
    }

    return { frequencies, s21_total, s21_inner, s21_outer, s21_dielectric };
}

/**
 * Generate linearly spaced frequency array.
 * @param {number} fMinGhz - Minimum frequency [GHz]
 * @param {number} fMaxGhz - Maximum frequency [GHz]
 * @param {number} nPoints - Number of points
 * @returns {number[]} Frequencies in Hz
 */
function generateFrequencies(fMinGhz, fMaxGhz, nPoints) {
    const fMin = fMinGhz * 1e9;
    const fMax = fMaxGhz * 1e9;
    const freqs = [];
    for (let i = 0; i < nPoints; i++) {
        freqs.push(fMin + (fMax - fMin) * i / (nPoints - 1));
    }
    return freqs;
}

/**
 * Generate logarithmically spaced frequency array.
 * @param {number} fMinGhz - Minimum frequency [GHz]
 * @param {number} fMaxGhz - Maximum frequency [GHz]
 * @param {number} nPoints - Number of points
 * @returns {number[]} Frequencies in Hz
 */
function generateFrequenciesLog(fMinGhz, fMaxGhz, nPoints) {
    const logMin = Math.log10(fMinGhz * 1e9);
    const logMax = Math.log10(fMaxGhz * 1e9);
    const freqs = [];
    for (let i = 0; i < nPoints; i++) {
        freqs.push(Math.pow(10, logMin + (logMax - logMin) * i / (nPoints - 1)));
    }
    return freqs;
}
