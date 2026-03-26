/**
 * UI controller — wires DOM elements to the thermal engine and plot.
 * Entry point: runs immediately via IIFE.
 */
(function () {
    'use strict';

    // --- DOM references ---
    const presetSelect = document.getElementById('preset-select');
    const geometryModeSelect = document.getElementById('geometry-mode');
    const numTracesInput = document.getElementById('num-traces');
    const cableLengthInput = document.getElementById('cable-length');
    const innerDiameterInput = document.getElementById('inner-diameter');
    const dielectricThicknessInput = document.getElementById('dielectric-thickness');
    const outerThicknessInput = document.getElementById('outer-thickness');
    const tracePitchInput = document.getElementById('trace-pitch');
    const foilThicknessInput = document.getElementById('foil-thickness');
    const numFoilLayersInput = document.getElementById('num-foil-layers');
    const coaxialFields = document.getElementById('coaxial-fields');
    const ribbonFields = document.getElementById('ribbon-fields');
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

    // --- Geometry mode toggle ---

    function updateGeometryFields() {
        const mode = geometryModeSelect.value;
        coaxialFields.style.display = mode === 'coaxial' ? '' : 'none';
        ribbonFields.style.display = mode === 'ribbon' ? '' : 'none';
    }

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
        geometryModeSelect.value = preset.geometry;
        numTracesInput.value = preset.numTraces;
        cableLengthInput.value = preset.length_m;
        innerDiameterInput.value = preset.innerDiameter_um;
        dielectricThicknessInput.value = preset.dielectricThickness_um;
        outerThicknessInput.value = preset.outerThickness_um;
        tracePitchInput.value = preset.tracePitch_um;
        foilThicknessInput.value = preset.foilThickness_um;
        numFoilLayersInput.value = preset.numFoilLayers;
        innerMaterialSelect.value = preset.innerConductor;
        dielectricMaterialSelect.value = preset.dielectric;
        outerMaterialSelect.value = preset.outerConductor;
        tColdInput.value = preset.T_cold_K;
        tHotInput.value = preset.T_hot_K;
        updateGeometryFields();
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
        const geometry = geometryModeSelect.value;
        const numTraces = parseInt(numTracesInput.value) || 1;
        const length = parseFloat(cableLengthInput.value);
        const innerDiam = parseFloat(innerDiameterInput.value);
        const dielThick = parseFloat(dielectricThicknessInput.value);
        const outerThick = parseFloat(outerThicknessInput.value);
        const tracePitch = parseFloat(tracePitchInput.value);
        const foilThick = parseFloat(foilThicknessInput.value);
        const numFoilLayers = parseInt(numFoilLayersInput.value) || 2;
        const T_cold = parseFloat(tColdInput.value);
        const T_hot = parseFloat(tHotInput.value);

        if (T_cold >= T_hot) {
            alert('Cold temperature must be less than hot temperature.');
            return;
        }
        if (length <= 0 || innerDiam <= 0 || dielThick <= 0) {
            alert('All dimensions must be positive.');
            return;
        }
        if (geometry === 'coaxial' && outerThick <= 0) {
            alert('Outer conductor thickness must be positive.');
            return;
        }
        if (geometry === 'ribbon' && (tracePitch <= 0 || foilThick <= 0 || numFoilLayers < 1)) {
            alert('Trace pitch, foil thickness, and number of foil layers must be positive.');
            return;
        }

        const innerMat = MATERIALS[innerMaterialSelect.value];
        const dielMat = MATERIALS[dielectricMaterialSelect.value];
        const outerMat = MATERIALS[outerMaterialSelect.value];

        const areas = computeAreas(geometry, innerDiam, dielThick,
                                   outerThick, tracePitch, foilThick, numFoilLayers);

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
            const areaMm2 = comp.area * 1e6;
            tr.innerHTML = `
                <td>${comp.label}</td>
                <td>${comp.material.name}</td>
                <td>${areaMm2.toFixed(4)}</td>
                <td>${formatHeatLoad(comp.heatLoad)}</td>
                <td>${fraction.toFixed(1)}%</td>
            `;
            breakdownTbody.appendChild(tr);
        }

        // Temperature profile
        const profile = computeTemperatureProfile(components, length, T_cold, T_hot, 200);
        renderTemperatureProfile('temp-profile-chart', profile.x, profile.T);

        // Material conductivity plot
        const conductivityColors = ['#ff9f43', '#4fc3f7', '#66bb6a'];
        const plotMaterials = [
            { material: innerMat, label: 'Inner: ' + innerMat.name, color: conductivityColors[0] },
            { material: dielMat, label: 'Dielectric: ' + dielMat.name, color: conductivityColors[1] },
            { material: outerMat, label: 'Outer: ' + outerMat.name, color: conductivityColors[2] }
        ];
        renderConductivityPlot('conductivity-chart', plotMaterials, T_cold, T_hot);
        document.getElementById('conductivity-chart-container').style.display = '';

        // References below conductivity plot
        const refsEl = document.getElementById('conductivity-refs');
        const seen = new Set();
        const refLines = [];
        for (const { material } of plotMaterials) {
            if (!seen.has(material.name)) {
                seen.add(material.name);
                refLines.push('<strong>' + material.name + ':</strong> ' + material.source);
            }
        }
        refsEl.innerHTML = refLines.join('<br>');

        // Show results
        resultsDisplay.className = 'results-visible';
    }

    // --- Event listeners ---

    presetSelect.addEventListener('change', () => loadPreset(presetSelect.value));
    geometryModeSelect.addEventListener('change', updateGeometryFields);
    calculateBtn.addEventListener('click', calculate);

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
