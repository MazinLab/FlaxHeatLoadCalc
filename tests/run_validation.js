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
    ];
    for (const [matId, T, lo, hi, label] of spotChecks) {
        const k = getThermalConductivity(MATERIALS[matId], T);
        check(k >= lo && k <= hi, label + ' = ' + k.toExponential(3) + ' [' + lo + ', ' + hi + ']');
    }

    console.log('');
    console.log('=== FLAX v2 Validation — Ribbon Geometry (Smith et al. 2024) ===');
    // Ribbon mode: flat foil outer, pitch=3556 µm, 2×25.4 µm foil
    const areas = computeAreas('ribbon', 127, 203, 50.8, 3556, 25.4, 2);
    console.log('  Inner area: ' + (areas.innerArea * 1e12).toFixed(1) + ' um^2');
    console.log('  Dielectric area: ' + (areas.dielectricArea * 1e12).toFixed(1) + ' um^2');
    console.log('  Outer area (ribbon): ' + (areas.outerArea * 1e12).toFixed(1) + ' um^2');

    // Compare with old coaxial model
    const areasCoax = computeAreas('coaxial', 127, 203, 50.8, 0, 0, 0);
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

    console.log('');
    console.log('=== SUMMARY: ' + fails + ' failures ===');
    return fails;
})()
`;

const failures = vm.runInContext(testCode, ctx);
process.exit(failures > 0 ? 1 : 0);
