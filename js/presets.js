/**
 * Cable Preset Definitions and Geometry Utilities
 *
 * Defines standard cable configurations for common coaxial cables (FLAX variants,
 * CryoCoax, generic copper semi-rigid) and provides geometry calculation.
 *
 * Material IDs must match keys in MATERIALS from materials.js.
 * Loaded after materials.js, before ui.js.
 */

/**
 * Cable preset library.
 * Each preset defines a complete cable configuration: conductor materials,
 * dimensions, number of traces, and thermal boundary conditions.
 */
const PRESETS = {
    custom: {
        name: '— Custom —',
        description: 'Enter all parameters manually',
        innerConductor: 'nbti',
        dielectric: 'ptfe',
        outerConductor: 'nbti',
        innerDiameter_um: 127,
        dielectricThickness_um: 203,
        outerThickness_um: 50.8,
        numTraces: 1,
        length_m: 0.3048,  // 1 foot
        T_cold_K: 0.1,
        T_hot_K: 1.0
    },
    flax_v2: {
        name: 'FLAX v2 (Smith et al. 2024)',
        description: 'NbTi/PTFE flex coax ribbon, 127 µm center, 203 µm dielectric, 2×25.4 µm NbTi foil',
        innerConductor: 'nbti',
        dielectric: 'ptfe',  // FEP proxied as PTFE
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
 * Compute cross-sectional areas from cable dimensions.
 * Assumes coaxial geometry: round center conductor, cylindrical dielectric, annular outer conductor.
 *
 * @param {number} innerDiameter_um - Center conductor diameter in micrometers
 * @param {number} dielectricThickness_um - Dielectric radial thickness in micrometers
 * @param {number} outerThickness_um - Outer conductor radial thickness in micrometers
 * @returns {{innerArea: number, dielectricArea: number, outerArea: number}} Areas in m²
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
