/**
 * Cable Preset Definitions and Geometry Utilities
 *
 * Supports two outer-conductor geometry modes:
 *   - 'coaxial': annular ring around the dielectric (standard semi-rigid coax)
 *   - 'ribbon':  flat foil shared across traces (flex ribbon cables like FLAX)
 *
 * In both modes the center conductor and dielectric are round (wire + insulation).
 *
 * Material IDs must match keys in MATERIALS from materials.js.
 * Loaded after materials.js, before ui.js.
 */

const PRESETS = {
    custom: {
        name: '— Custom —',
        description: 'Enter all parameters manually',
        geometry: 'coaxial',
        innerConductor: 'nbti',
        dielectric: 'ptfe',
        outerConductor: 'nbti',
        innerDiameter_um: 127,
        dielectricThickness_um: 203,
        // Coaxial outer conductor
        outerThickness_um: 50.8,
        // Ribbon outer conductor (shown when geometry === 'ribbon')
        tracePitch_um: 3556,
        foilThickness_um: 25.4,
        numFoilLayers: 2,
        numTraces: 1,
        length_m: 0.3048,  // 1 foot
        T_cold_K: 0.1,
        T_hot_K: 1.0
    },
    flax_v2: {
        name: 'FLAX v2 (Smith et al. 2024)',
        description: 'NbTi/FEP flex ribbon, 127 µm center, 203 µm dielectric, 2×25.4 µm NbTi foil, 3556 µm pitch',
        geometry: 'ribbon',
        innerConductor: 'nbti',
        dielectric: 'ptfe',  // FEP proxied as PTFE
        outerConductor: 'nbti',
        innerDiameter_um: 127,
        dielectricThickness_um: 203,
        outerThickness_um: 50.8,
        tracePitch_um: 3556,       // 0.140" center-to-center
        foilThickness_um: 25.4,    // 1 mil per sheet
        numFoilLayers: 2,          // top + bottom foil
        numTraces: 1,
        length_m: 0.3048,
        T_cold_K: 0.1,
        T_hot_K: 1.0
    },
    flax_v1: {
        name: 'FLAX v1 (prior design)',
        description: 'NbTi/PTFE flex ribbon, 76 µm center, 203 µm dielectric, 2×25.4 µm NbTi foil',
        geometry: 'ribbon',
        innerConductor: 'nbti',
        dielectric: 'ptfe',
        outerConductor: 'nbti',
        innerDiameter_um: 76,
        dielectricThickness_um: 203,
        outerThickness_um: 50.8,
        tracePitch_um: 3556,
        foilThickness_um: 25.4,
        numFoilLayers: 2,
        numTraces: 1,
        length_m: 0.3048,
        T_cold_K: 0.1,
        T_hot_K: 1.0
    },
    cryocoax_scn_cn: {
        name: 'SC-086/50-SCN-CN (CuNi coax)',
        description: 'CuNi/PTFE semi-rigid coax, 203 µm center, PTFE dielectric, 0.86 mm OD',
        geometry: 'coaxial',
        innerConductor: 'cuni',
        dielectric: 'ptfe',
        outerConductor: 'cuni',
        innerDiameter_um: 203,
        dielectricThickness_um: 228.5,
        outerThickness_um: 100,
        tracePitch_um: 3556,
        foilThickness_um: 25.4,
        numFoilLayers: 2,
        numTraces: 1,
        length_m: 0.3048,
        T_cold_K: 4.0,
        T_hot_K: 50.0
    },
    copper_semirigid: {
        name: 'Copper Semi-Rigid Coax (generic)',
        description: 'Cu/PTFE semi-rigid, 0.5 mm center, ~0.86 mm OD',
        geometry: 'coaxial',
        innerConductor: 'copper_rrr50',
        dielectric: 'ptfe',
        outerConductor: 'copper_rrr50',
        innerDiameter_um: 500,
        dielectricThickness_um: 250,
        outerThickness_um: 100,
        tracePitch_um: 3556,
        foilThickness_um: 25.4,
        numFoilLayers: 2,
        numTraces: 1,
        length_m: 0.3048,
        T_cold_K: 4.0,
        T_hot_K: 300.0
    }
};

/**
 * Compute cross-sectional areas per trace from cable dimensions.
 *
 * Inner conductor and dielectric are always round (wire + cylindrical insulation).
 * Outer conductor depends on geometry mode:
 *   - 'coaxial': annular ring around dielectric
 *   - 'ribbon': flat foil, area = tracePitch × foilThickness × numFoilLayers
 *
 * @param {string} geometry - 'coaxial' or 'ribbon'
 * @param {number} innerDiameter_um - Center conductor diameter [µm]
 * @param {number} dielectricThickness_um - Dielectric radial thickness [µm]
 * @param {number} outerThickness_um - Outer conductor radial thickness [µm] (coaxial mode)
 * @param {number} tracePitch_um - Center-to-center trace spacing [µm] (ribbon mode)
 * @param {number} foilThickness_um - Thickness of one foil sheet [µm] (ribbon mode)
 * @param {number} numFoilLayers - Number of foil sheets, typically 2 (ribbon mode)
 * @returns {{innerArea: number, dielectricArea: number, outerArea: number}} Areas in m²
 */
function computeAreas(geometry, innerDiameter_um, dielectricThickness_um,
                      outerThickness_um, tracePitch_um, foilThickness_um, numFoilLayers) {
    const um2m = 1e-6;
    const r_inner = (innerDiameter_um / 2) * um2m;
    const r_dielectric = r_inner + dielectricThickness_um * um2m;

    const innerArea = Math.PI * r_inner * r_inner;
    const dielectricArea = Math.PI * (r_dielectric * r_dielectric - r_inner * r_inner);

    let outerArea;
    if (geometry === 'ribbon') {
        outerArea = (tracePitch_um * um2m) * (foilThickness_um * um2m) * numFoilLayers;
    } else {
        const r_outer = r_dielectric + outerThickness_um * um2m;
        outerArea = Math.PI * (r_outer * r_outer - r_dielectric * r_dielectric);
    }

    return { innerArea, dielectricArea, outerArea };
}
