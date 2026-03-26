/**
 * UI controller — wires DOM elements to the thermal engine and plot.
 * Entry point: runs immediately via IIFE.
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
        const numTraces = parseInt(numTracesInput.value) || 1;
        const length = parseFloat(cableLengthInput.value);
        const innerDiam = parseFloat(innerDiameterInput.value);
        const dielThick = parseFloat(dielectricThicknessInput.value);
        const outerThick = parseFloat(outerThicknessInput.value);
        const T_cold = parseFloat(tColdInput.value);
        const T_hot = parseFloat(tHotInput.value);

        if (T_cold >= T_hot) {
            alert('Cold temperature must be less than hot temperature.');
            return;
        }
        if (length <= 0 || innerDiam <= 0 || dielThick <= 0 || outerThick <= 0) {
            alert('All dimensions must be positive.');
            return;
        }

        const innerMat = MATERIALS[innerMaterialSelect.value];
        const dielMat = MATERIALS[dielectricMaterialSelect.value];
        const outerMat = MATERIALS[outerMaterialSelect.value];

        const areas = computeAreas(innerDiam, dielThick, outerThick);

        const components = [
            { material: innerMat, area: areas.innerArea, label: 'Inner Conductor' },
            { material: dielMat, area: areas.dielectricArea, label: 'Dielectric' },
            { material: outerMat, area: areas.outerArea, label: 'Outer Conductor' }
        ];

        const perTraceQ = computeHeatLoad(components, length, T_cold, T_hot);
        const totalQ = perTraceQ * numTraces;

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
            const areaUm2 = comp.area * 1e12;
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

    presetSelect.addEventListener('change', () => loadPreset(presetSelect.value));
    calculateBtn.addEventListener('click', calculate);

    // Enter key triggers calculation from any input
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
