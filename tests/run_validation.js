/**
 * Node.js validation script for the thermal calculator.
 * Runs key physics checks without a browser.
 */
const fs = require('fs');
const vm = require('vm');

const ctx = vm.createContext({
    Math, console, isFinite, parseInt, parseFloat,
    Array, Object, Error
});

vm.runInContext(fs.readFileSync('js/materials.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync('js/thermal.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync('js/rf_loss.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync('js/presets.js', 'utf8'), ctx);

const testCode = `
(function() {
    let fails = 0;
    function check(ok, msg) {
        console.log((ok ? 'PASS' : 'FAIL') + ': ' + msg);
        if (!ok) fails++;
    }

    console.log('=== Material Spot Checks ===');
    const spotChecks = [
        ['ss304', 10, 0.5, 2.0, 'SS304 k(10K)'],
        ['ss304', 100, 8, 14, 'SS304 k(100K)'],
        ['ptfe', 100, 0.15, 0.35, 'PTFE k(100K)'],
        ['kapton', 100, 0.10, 0.25, 'Kapton k(100K)'],
        ['copper_rrr100', 300, 350, 450, 'Cu RRR100 k(300K)'],
        ['copper_rrr100', 10, 100, 800, 'Cu RRR100 k(10K)'],
        ['nbti', 0.5, 1e-4, 0.1, 'NbTi k(0.5K)'],
        ['nbti', 0.1, 1e-5, 0.01, 'NbTi k(0.1K)'],
        ['ptfe', 0.5, 1e-4, 0.01, 'PTFE k(0.5K)'],
        ['copper_rrr50', 0.5, 25, 50, 'Cu RRR50 k(0.5K)'],
        ['copper_rrr100', 0.5, 50, 100, 'Cu RRR100 k(0.5K)'],
    ];
    for (const [matId, T, lo, hi, label] of spotChecks) {
        const k = getThermalConductivity(MATERIALS[matId], T);
        check(k >= lo && k <= hi, label + ' = ' + k.toExponential(3) + ' [' + lo + ', ' + hi + ']');
    }

    console.log('');
    console.log('=== FLAX v2 Validation — Ribbon Geometry (Smith et al. 2024) ===');
    // Ribbon mode: flat foil outer, pitch=3556 µm, 2×25.4 µm foil
    const areas = computeAreas('ribbon', 127, 102, 50.8, 3556, 25.4, 2);
    console.log('  Inner area: ' + (areas.innerArea * 1e12).toFixed(1) + ' um^2');
    console.log('  Dielectric area: ' + (areas.dielectricArea * 1e12).toFixed(1) + ' um^2');
    console.log('  Outer area (ribbon): ' + (areas.outerArea * 1e12).toFixed(1) + ' um^2');

    // Compare with old coaxial model
    const areasCoax = computeAreas('coaxial', 127, 102, 50.8, 0, 0, 0);
    console.log('  Outer area (coaxial for comparison): ' + (areasCoax.outerArea * 1e12).toFixed(1) + ' um^2');

    const components = [
        { material: MATERIALS.nbti, area: areas.innerArea },
        { material: MATERIALS.ptfe, area: areas.dielectricArea },
        { material: MATERIALS.nbti, area: areas.outerArea }
    ];
    const Q = computeHeatLoad(components, 0.3048, 0.1, 1.0);
    const Q_nW = Q * 1e9;
    console.log('  Computed: ' + Q_nW.toFixed(3) + ' nW/trace');
    console.log('  Target:   ~5 nW/trace (Smith et al.)');
    check(Q_nW > 0.5 && Q_nW < 100, 'FLAX heat load in [0.5, 100] nW');
    check(Q_nW > 10 && Q_nW < 20, 'FLAX heat load regression pin [10, 20] nW — got ' + Q_nW.toFixed(3));

    console.log('  --- Component breakdown ---');
    for (const comp of components) {
        const q = computeHeatLoad([comp], 0.3048, 0.1, 1.0);
        console.log('    ' + comp.material.name + ': ' + (q*1e9).toFixed(3) + ' nW (' + (q/Q*100).toFixed(1) + '%)');
    }

    console.log('');
    console.log('=== Temperature Profile ===');
    const prof = computeTemperatureProfile(components, 0.3048, 0.1, 1.0, 50);
    check(Math.abs(prof.T[0] - 0.1) < 0.002, 'T[0] = ' + prof.T[0].toFixed(4) + ' K (expect 0.1)');
    check(Math.abs(prof.T[49] - 1.0) < 0.02, 'T[49] = ' + prof.T[49].toFixed(4) + ' K (expect 1.0)');
    check(prof.T[25] > 0.1 && prof.T[25] < 1.0, 'T[25] = ' + prof.T[25].toFixed(4) + ' K (midpoint)');
    var mono = true;
    for (var i = 1; i < prof.T.length; i++) { if (prof.T[i] < prof.T[i-1] - 1e-10) mono = false; }
    check(mono, 'Profile is monotonic');

    console.log('');
    console.log('=== Other Temperature Ranges ===');
    var Q_1to4 = computeHeatLoad(components, 0.3048, 1.0, 4.0);
    console.log('  FLAX 1-4K: ' + (Q_1to4*1e9).toFixed(1) + ' nW');
    console.log('  Ratio 1-4K / 0.1-1K: ' + (Q_1to4/Q).toFixed(1) + 'x');
    check(Q_1to4 > Q, 'FLAX 1-4K > 0.1-1K');

    var cuAreas = computeAreas('coaxial', 500, 250, 100, 0, 0, 0);
    var cuComps = [
        { material: MATERIALS.copper_rrr50, area: cuAreas.innerArea },
        { material: MATERIALS.ptfe, area: cuAreas.dielectricArea },
        { material: MATERIALS.copper_rrr50, area: cuAreas.outerArea }
    ];
    var Q_cu = computeHeatLoad(cuComps, 0.3048, 4, 300);
    console.log('  Cu coax 4-300K: ' + (Q_cu*1e3).toFixed(2) + ' mW');
    check(Q_cu > 1e-3, 'Cu coax 4-300K > 1 mW');

    // ========== Corrected Material Spot Checks ==========
    console.log('');
    console.log('=== Corrected Material Spot Checks ===');

    // Kapton sub-K: Daal et al. 2019 Cirlex — k(1K) ≈ 4.7 mW/(m·K)
    var k_kap_1K = getThermalConductivity(MATERIALS.kapton, 1.0);
    check(k_kap_1K > 0.003 && k_kap_1K < 0.010,
        'Kapton k(1K) = ' + (k_kap_1K*1e3).toFixed(2) + ' mW (expect ~4.7 mW)');

    // PTFE sub-K: Kushino T^1.9 — k(0.1K) should be ~0.025 mW, not ~0.2 mW
    var k_ptfe_01 = getThermalConductivity(MATERIALS.ptfe, 0.1);
    check(k_ptfe_01 > 1e-5 && k_ptfe_01 < 1e-4,
        'PTFE k(0.1K) = ' + k_ptfe_01.toExponential(2) + ' (expect ~2.5e-5)');

    // Manganin main fit: k(300K) ≈ 22 W/(m·K), k(10K) ≈ 2
    var k_mang_300 = getThermalConductivity(MATERIALS.manganin, 300);
    check(k_mang_300 > 15 && k_mang_300 < 30,
        'Manganin k(300K) = ' + k_mang_300.toFixed(1) + ' (expect ~22)');
    var k_mang_10 = getThermalConductivity(MATERIALS.manganin, 10);
    check(k_mang_10 > 1.0 && k_mang_10 < 4.0,
        'Manganin k(10K) = ' + k_mang_10.toFixed(2) + ' (expect ~2)');

    // Nichrome main fit: k(300K) ≈ 12, k(10K) ≈ 0.7
    var k_nich_300 = getThermalConductivity(MATERIALS.nichrome, 300);
    check(k_nich_300 > 8 && k_nich_300 < 18,
        'Nichrome k(300K) = ' + k_nich_300.toFixed(1) + ' (expect ~12)');

    // Phosphor Bronze: k(300K) ≈ 48
    var k_phbr_300 = getThermalConductivity(MATERIALS.phosphor_bronze, 300);
    check(k_phbr_300 > 30 && k_phbr_300 < 70,
        'Phosphor Bronze k(300K) = ' + k_phbr_300.toFixed(1) + ' (expect ~48)');

    // SS304 sub-K: W-F with rho_0=2.2e-7 → k=0.111*T
    var k_ss_05 = getThermalConductivity(MATERIALS.ss304, 0.5);
    check(k_ss_05 > 0.040 && k_ss_05 < 0.080,
        'SS304 k(0.5K) = ' + (k_ss_05*1e3).toFixed(1) + ' mW (expect ~55 mW)');

    // Silver: k(1K) ≈ 30.7 (WF, RRR=20), k(300K) ≈ 427
    var k_ag_1 = getThermalConductivity(MATERIALS.silver, 1.0);
    check(k_ag_1 > 20 && k_ag_1 < 50,
        'Silver k(1K) = ' + k_ag_1.toFixed(1) + ' (expect ~30.7, WF RRR=20)');
    var k_ag_300 = getThermalConductivity(MATERIALS.silver, 300);
    check(k_ag_300 > 350 && k_ag_300 < 500,
        'Silver k(300K) = ' + k_ag_300.toFixed(1) + ' (expect ~427)');

    // ========== Silver Plating Bilayer Test ==========
    console.log('');
    console.log('=== Silver Plating Bilayer Test ===');
    // Compare SS304 vs SS304+Ag for a coaxial outer conductor
    // Geometry: 500 µm ID, 250 µm dielectric, 100 µm outer wall
    var bilayerAreas = computeAreas('coaxial', 500, 250, 100, 0, 0, 0);
    // Bare SS304 heat load (4-300K)
    var ssComp = [{ material: MATERIALS.ss304, area: bilayerAreas.outerArea }];
    var Q_bare = computeHeatLoad(ssComp, 0.3048, 4, 300);

    // SS304 + 3 µm Ag plating on inner+outer surfaces
    var r_inner = (250 + 250) * 1e-6;  // inner radius of outer conductor
    var r_outer = r_inner + 100 * 1e-6;
    var t_p = 3e-6;
    var platingArea = 2 * Math.PI * (r_inner + r_outer) * t_p;
    var baseArea = Math.max(0, bilayerAreas.outerArea - platingArea);
    var platedComps = [
        { material: MATERIALS.ss304, area: baseArea },
        { material: MATERIALS.silver, area: platingArea }
    ];
    // 4-300K: silver plating adds significant but not dominant contribution
    var Q_plated = computeHeatLoad(platedComps, 0.3048, 4, 300);
    var ratio_warm = Q_plated / Q_bare;
    console.log('  4-300K: bare=' + (Q_bare*1e6).toFixed(1) + ' µW, plated=' + (Q_plated*1e6).toFixed(1) + ' µW, ratio=' + ratio_warm.toFixed(1) + 'x');
    check(ratio_warm > 2 && ratio_warm < 10,
        'Ag plating at 4-300K: ' + ratio_warm.toFixed(1) + 'x (expect 2-10x)');

    // 0.5-4K: silver plating dominates because k_Ag/k_SS ≈ 900
    var Q_bare_cold = computeHeatLoad(ssComp, 0.3048, 0.5, 4);
    var Q_plated_cold = computeHeatLoad(platedComps, 0.3048, 0.5, 4);
    var ratio_cold = Q_plated_cold / Q_bare_cold;
    console.log('  0.5-4K: bare=' + (Q_bare_cold*1e9).toFixed(1) + ' nW, plated=' + (Q_plated_cold*1e9).toFixed(1) + ' nW, ratio=' + ratio_cold.toFixed(1) + 'x');
    check(ratio_cold > 10 && ratio_cold < 100,
        'Ag plating at 0.5-4K: ' + ratio_cold.toFixed(1) + 'x (expect 10-100x, Kuroda 2018: ~10x)');

    // ========== RF Cable Loss Tests ==========
    console.log('');
    console.log('=== RF Cable Loss (S21) Tests ===');

    // Surface resistance of copper at 1 GHz: Rs = sqrt(pi * mu0 * f * rho)
    // rho = 1.7e-8 (Cu 300K), f = 1e9, mu0 = 4*pi*1e-7
    // Rs = sqrt(pi * 4*pi*1e-7 * 1e9 * 1.7e-8) = sqrt(6.71e-5) ≈ 0.00819 Ohm
    var Rs_cu = surfaceResistance(1.7e-8, 1e9);
    check(Math.abs(Rs_cu - 0.00819) / 0.00819 < 0.02,
        'Surface resistance Cu at 1 GHz = ' + (Rs_cu*1000).toFixed(3) + ' mOhm (expect 8.19 mOhm)');

    // Dielectric attenuation: alpha_d = pi*f*sqrt(eps_r)*tan(delta)/c
    // PTFE at 1 GHz: pi*1e9*sqrt(2.1)*2e-4 / 3e8 ≈ 3.04e-3 Np/m
    var alpha_d = dielectricAttenuation(1e9, 2.1, 2e-4);
    check(Math.abs(alpha_d - 3.04e-3) / 3.04e-3 < 0.02,
        'Dielectric attenuation PTFE at 1 GHz = ' + alpha_d.toExponential(3) + ' Np/m (expect 3.04e-3)');

    // NbTi below Tc: zero conductor loss
    var Rs_nbti = materialSurfaceResistance(MATERIALS.nbti, 1.0, 8e9);
    check(Rs_nbti === 0, 'NbTi at 1K (below Tc=9.8K): Rs = 0');

    // NbTi above Tc: finite conductor loss
    var Rs_nbti_above = materialSurfaceResistance(MATERIALS.nbti, 15.0, 8e9);
    check(Rs_nbti_above > 0, 'NbTi at 15K (above Tc): Rs = ' + Rs_nbti_above.toExponential(3) + ' > 0');

    // Full S21 integration — FLAX v2, SC cable, 0.1-1K, 30 cm
    var flaxAreas = computeAreas('ribbon', 127, 102, 50.8, 3556, 25.4, 2);
    var a_m = 63.5e-6;   // inner radius
    var b_m = a_m + 102e-6;  // outer radius at dielectric boundary
    var flaxProfile = computeTemperatureProfile([
        { material: MATERIALS.nbti, area: flaxAreas.innerArea },
        { material: MATERIALS.ptfe, area: flaxAreas.dielectricArea },
        { material: MATERIALS.nbti, area: flaxAreas.outerArea }
    ], 0.30, 0.1, 1.0, 100);

    var freqs = generateFrequencies(1, 18, 50);
    var s21 = computeS21(flaxProfile, MATERIALS.nbti, MATERIALS.nbti, MATERIALS.ptfe, a_m, b_m, freqs);

    // SC cable below Tc: conductor loss should be zero
    check(s21.s21_inner.every(function(v) { return v === 0; }),
        'FLAX SC cable 0.1-1K: conductor S21 = 0 dB (all superconducting)');

    // Total S21 should equal dielectric-only (since conductor = 0)
    var totalMatchesDiel = s21.s21_total.every(function(v, i) {
        return Math.abs(v - s21.s21_dielectric[i]) < 1e-10;
    });
    check(totalMatchesDiel, 'FLAX SC: total S21 = dielectric-only S21');

    check(s21.s21_outer.every(function(v) { return v === 0; }),
        'FLAX SC cable 0.1-1K: outer conductor S21 = 0 dB (superconducting)');

    // All S21 values should be negative (lossy) or zero
    check(s21.s21_total.every(function(v) { return v <= 0; }), 'S21 total is non-positive (lossy)');

    // Higher frequency should have more loss (more negative S21)
    check(s21.s21_total[49] < s21.s21_total[0],
        'S21 at 18 GHz (' + s21.s21_total[49].toFixed(2) + ' dB) < S21 at 1 GHz (' + s21.s21_total[0].toFixed(2) + ' dB)');

    // Report FLAX S21 at 8 GHz for comparison with Smith et al. (~1.5 dB)
    var idx8ghz = Math.round((8 - 1) / (18 - 1) * 49);
    console.log('  FLAX v2 S21 at 8 GHz (dielectric only, 30cm): ' + s21.s21_total[idx8ghz].toFixed(3) + ' dB');
    console.log('  Smith et al. measured: ~-1.5 dB at 8 GHz');

    // SC-219/50-SSS-SS attenuation vs datasheet (Coax Co. Ltd.)
    // Uniform 300K, 1 m cable — compare to datasheet dB/m
    console.log('');
    console.log('=== SC-219/50-SSS-SS Attenuation vs Datasheet ===');
    var sc219_a = 255e-6;
    var sc219_b = sc219_a + 580e-6;
    // Uniform 300K profile (2 points)
    var sc219_prof = { x: [0, 1.0], T: [300, 300] };
    var sc219_freqs = [0.5e9, 1e9, 5e9, 10e9, 20e9];
    var sc219_s21 = computeS21(sc219_prof, MATERIALS.ss304_ag, MATERIALS.ss304, MATERIALS.ptfe, sc219_a, sc219_b, sc219_freqs);
    var sc219_sheet = [1.0, 1.5, 3.3, 4.6, 6.5];  // dB/m at 300K
    var sc219_labels = ['0.5', '1', '5', '10', '20'];
    var sc219_prof_4 = { x: [0, 1.0], T: [4, 4] };
    var sc219_s21_4 = computeS21(sc219_prof_4, MATERIALS.ss304_ag, MATERIALS.ss304, MATERIALS.ptfe, sc219_a, sc219_b, sc219_freqs);
    var sc219_sheet_4 = [0.5, 0.7, 1.5, 2.1, 2.9];
    for (var si = 0; si < sc219_freqs.length; si++) {
        var p300 = Math.abs(sc219_s21.s21_total[si]);
        var p4 = Math.abs(sc219_s21_4.s21_total[si]);
        var e300 = Math.abs(p300 - sc219_sheet[si]) / sc219_sheet[si];
        var e4 = Math.abs(p4 - sc219_sheet_4[si]) / sc219_sheet_4[si];
        console.log('  ' + sc219_labels[si] + ' GHz: 300K=' + p300.toFixed(2) + ' vs ' + sc219_sheet[si] + ', 4K=' + p4.toFixed(2) + ' vs ' + sc219_sheet_4[si]);
        check(e300 < 0.25, 'SC-219 ' + sc219_labels[si] + ' GHz 300K: ' + (e300*100).toFixed(0) + '% off');
        check(e4 < 0.25, 'SC-219 ' + sc219_labels[si] + ' GHz 4K: ' + (e4*100).toFixed(0) + '% off');
    }

    // SC-086/50-CN-CN attenuation vs datasheet (bare CuNi both)
    console.log('');
    console.log('=== SC-086/50-CN-CN Attenuation vs Datasheet ===');
    var sc086_a = 101.5e-6;
    var sc086_b = sc086_a + 228.5e-6;
    // Uniform 300K and 4K profiles
    var sc086_prof_300 = { x: [0, 1.0], T: [300, 300] };
    var sc086_prof_4 = { x: [0, 1.0], T: [4, 4] };
    var sc086_freqs = [0.5e9, 1e9, 5e9, 10e9, 20e9];
    var sc086_s21_300 = computeS21(sc086_prof_300, MATERIALS.cuni, MATERIALS.cuni, MATERIALS.ptfe, sc086_a, sc086_b, sc086_freqs);
    var sc086_s21_4 = computeS21(sc086_prof_4, MATERIALS.cuni, MATERIALS.cuni, MATERIALS.ptfe, sc086_a, sc086_b, sc086_freqs);
    var sc086_sheet_300 = [5.4, 7.7, 17.1, 24.3, 34.6];
    var sc086_sheet_4 = [4.1, 5.7, 12.8, 18.1, 25.7];
    var sc086_labels = ['0.5', '1', '5', '10', '20'];
    for (var ci = 0; ci < sc086_freqs.length; ci++) {
        var p300 = Math.abs(sc086_s21_300.s21_total[ci]);
        var p4 = Math.abs(sc086_s21_4.s21_total[ci]);
        var e300 = Math.abs(p300 - sc086_sheet_300[ci]) / sc086_sheet_300[ci];
        var e4 = Math.abs(p4 - sc086_sheet_4[ci]) / sc086_sheet_4[ci];
        console.log('  ' + sc086_labels[ci] + ' GHz: 300K=' + p300.toFixed(1) + ' vs ' + sc086_sheet_300[ci] + ', 4K=' + p4.toFixed(1) + ' vs ' + sc086_sheet_4[ci]);
        check(e300 < 0.20, 'SC-086 CN-CN ' + sc086_labels[ci] + ' GHz 300K: ' + (e300*100).toFixed(0) + '% off');
        check(e4 < 0.20, 'SC-086 CN-CN ' + sc086_labels[ci] + ' GHz 4K: ' + (e4*100).toFixed(0) + '% off');
    }

    console.log('');
    console.log('=== SUMMARY: ' + fails + ' failures ===');
    return fails;
})()
`;

const failures = vm.runInContext(testCode, ctx);
process.exit(failures > 0 ? 1 : 0);
