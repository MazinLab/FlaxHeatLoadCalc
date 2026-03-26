/**
 * Thermal physics engine for cryogenic cable heat load calculations.
 *
 * Provides steady-state heat load and temperature profile for multi-component
 * coaxial cables using the Wiedemann–Franz / empirical k(T) fits from materials.js.
 *
 * All units are SI (W, m, K) unless otherwise noted.
 *
 * Depends on: materials.js (getThermalConductivity, MATERIALS)
 */

'use strict';

// ---------------------------------------------------------------------------
// Numerical integration
// ---------------------------------------------------------------------------

/**
 * Adaptive Simpson's rule for numerical integration.
 *
 * Uses recursive bisection with Richardson extrapolation correction.
 * The error estimate is |refined - whole| and the tolerance is applied per
 * sub-interval, so the global error is bounded by tol (approximately).
 *
 * @param {function(number): number} f - Integrand.
 * @param {number} a - Lower bound.
 * @param {number} b - Upper bound.
 * @param {number} [tol=1e-12] - Absolute tolerance per sub-interval.
 * @param {number} [maxDepth=50] - Maximum recursion depth.
 * @returns {number} Approximate integral of f from a to b.
 */
function adaptiveSimpson(f, a, b, tol = 1e-12, maxDepth = 50) {
    function simpson(lo, hi) {
        const mid = (lo + hi) / 2;
        return (hi - lo) / 6 * (f(lo) + 4 * f(mid) + f(hi));
    }

    function recurse(lo, hi, whole, depth) {
        const mid = (lo + hi) / 2;
        const left = simpson(lo, mid);
        const right = simpson(mid, hi);
        const refined = left + right;
        if (depth >= maxDepth || Math.abs(refined - whole) <= 15 * tol) {
            // Richardson extrapolation: (refined - whole) / 15 is the error estimate
            return refined + (refined - whole) / 15;
        }
        return recurse(lo, mid, left, depth + 1) + recurse(mid, hi, right, depth + 1);
    }

    return recurse(a, b, simpson(a, b), 0);
}

// ---------------------------------------------------------------------------
// Cable physics helpers
// ---------------------------------------------------------------------------

/**
 * Integrate thermal conductivity of a material from T_cold to T_hot.
 *
 * Returns ∫_{T_cold}^{T_hot} k(T) dT in units of W/m (since k is W/(m·K) and
 * we integrate over K).
 *
 * @param {Object} material - Material object from MATERIALS.
 * @param {number} T_cold - Cold-end temperature [K].
 * @param {number} T_hot - Hot-end temperature [K].
 * @returns {number} Integral value [W/m].
 */
function thermalConductivityIntegral(material, T_cold, T_hot) {
    return adaptiveSimpson(
        (T) => getThermalConductivity(material, T),
        T_cold,
        T_hot
    );
}

/**
 * Effective thermal conductance factor G(T) for a multi-component cable cross-section.
 *
 * G(T) = Σ_i A_i · k_i(T)   [W/K]
 *
 * @param {Array<{area: number, material: Object}>} components - Cable components,
 *   each with cross-sectional area [m²] and a material object.
 * @param {number} T - Temperature [K].
 * @returns {number} G(T) [W/K].
 */
function cableG(components, T) {
    let G = 0;
    for (const comp of components) {
        G += comp.area * getThermalConductivity(comp.material, T);
    }
    return G;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute steady-state heat load for a cable with multiple parallel thermal paths.
 *
 * For a 1-D steady-state problem with no internal heat generation:
 *
 *   Q [W] = (1/L) · Σ_i A_i · ∫_{T_cold}^{T_hot} k_i(T) dT
 *
 * This follows directly from the heat equation with dQ/dx = 0 and
 * Fourier's law q = −k(T) dT/dx integrated over the cross-section.
 *
 * @param {Array<{area: number, material: Object}>} components - Cable components.
 * @param {number} length - Cable length [m].
 * @param {number} T_cold - Cold-end temperature [K].
 * @param {number} T_hot - Hot-end temperature [K].
 * @returns {number} Heat load Q [W].
 */
function computeHeatLoad(components, length, T_cold, T_hot) {
    let totalIntegral = 0;
    for (const comp of components) {
        totalIntegral += comp.area * thermalConductivityIntegral(comp.material, T_cold, T_hot);
    }
    return totalIntegral / length;
}

/**
 * Compute the steady-state temperature profile T(x) along the cable.
 *
 * The approach is to parameterize position by fractional coordinate s = x/L.
 * From the constant-flux condition Q = G(T(x)) · dT/dx · (1/L):
 *
 *   ds/dT = G(T) / (Q · L)
 *
 * We integrate this ODE from T_cold (s=0) to T_hot (s=1) using the trapezoid
 * rule on a fine temperature grid, building a T → s lookup table.  We then
 * invert by binary search + linear interpolation to get T at uniform x positions.
 *
 * @param {Array<{area: number, material: Object}>} components - Cable components.
 * @param {number} length - Cable length [m].
 * @param {number} T_cold - Cold-end temperature [K].
 * @param {number} T_hot - Hot-end temperature [K].
 * @param {number} [nPoints=200] - Number of output sample points along x.
 * @returns {{x: number[], T: number[]}} Positions x [m] and temperatures T [K].
 */
function computeTemperatureProfile(components, length, T_cold, T_hot, nPoints = 200) {
    const Q = computeHeatLoad(components, length, T_cold, T_hot);

    if (Q <= 0) {
        // Degenerate case: no heat flow, uniform temperature at T_cold.
        const x = Array.from({ length: nPoints }, (_, i) => i * length / (nPoints - 1));
        const T = new Array(nPoints).fill(T_cold);
        return { x, T };
    }

    // Build T → s mapping via trapezoid integration of ds/dT = G(T) / (Q * L).
    const nSteps = 1000;
    const dT = (T_hot - T_cold) / nSteps;
    const T_arr = [T_cold];
    const s_arr = [0.0];
    let s = 0.0;
    let G_prev = cableG(components, T_cold);

    for (let i = 1; i <= nSteps; i++) {
        const T_cur = T_cold + i * dT;
        const G_cur = cableG(components, T_cur);
        // Trapezoid step: Δs = (G_prev + G_cur)/2 * ΔT / (Q * L)
        s += (G_prev + G_cur) / 2 * dT / (Q * length);
        T_arr.push(T_cur);
        s_arr.push(s);
        G_prev = G_cur;
    }

    // Interpolate T at nPoints uniform s positions (s = x/L ∈ [0, 1]).
    const x_out = [];
    const T_out = [];
    for (let i = 0; i < nPoints; i++) {
        const s_target = i / (nPoints - 1);
        x_out.push(s_target * length);

        // Binary search for bracketing interval in s_arr.
        let lo = 0;
        let hi = s_arr.length - 1;
        while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (s_arr[mid] <= s_target) lo = mid;
            else hi = mid;
        }

        const ds = s_arr[hi] - s_arr[lo];
        const frac = ds > 0 ? (s_target - s_arr[lo]) / ds : 0;
        T_out.push(T_arr[lo] + frac * (T_arr[hi] - T_arr[lo]));
    }

    return { x: x_out, T: T_out };
}
