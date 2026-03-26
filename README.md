# Cryogenic Flex Cable Heat Load Calculator

A web-based calculator for computing steady-state thermal conduction through cryogenic flex coaxial cables from 0.1 to 300 K.

**Live at: https://mazinlab.github.io/FlaxHeatLoadCalc/**

## Features

- Heat load calculation via numerical integration of Q = (A/L) * integral k(T) dT
- Support for coaxial (annular outer conductor) and ribbon (flat foil outer conductor) cable geometries
- 18 built-in materials with piecewise k(T) fits stitching sub-kelvin and NIST data
- Cable presets for FLAX v1/v2, CryoCoax SC-086/50-SCN-CN, and generic copper semi-rigid
- Temperature profile T(x) along the cable via ODE solution
- Log-log material thermal conductivity plot with data source citations
- Per-component heat load breakdown (inner conductor, dielectric, outer conductor)

## Materials

**Conductors:** NbTi, Nb, Cu (RRR 50/100/150/300/500), Al 6061-T6, Phosphor Bronze, Manganin, CuNi (C7150), 304 Stainless Steel, Ag-plated 304 SS, Nichrome

**Dielectrics:** PTFE (Teflon), FEP (PTFE proxy), Kapton (Polyimide), G-10

Material data sources include NIST Cryogenic Materials Database, Daal et al. 2019 (Cryogenics 98), Kushino et al. 2005, Lakeshore, Touloukian TPRC, and others. Full citations are displayed below the k(T) plot for the selected materials.

## References

- Smith, J.P., Mazin, B.A., et al. (2024). "FLAX: A Flexible Coaxial Ribbon Cable for Cryogenic Readout." IEEE Trans. Appl. Supercond. [10.1109/TASC.2024.3349538](https://ieeexplore.ieee.org/document/10381740)
- Smith, J.P., et al. (2020). "Flexible Coaxial Ribbon Cable for Sub-Kelvin Microwave Readout." [arXiv:2007.06496](https://arxiv.org/abs/2007.06496)
- NIST Cryogenic Materials Database: https://trc.nist.gov/cryogenics/materials/materialproperties.htm

## Usage

Single-page static site with no build step. Open `index.html` in a browser or visit the GitHub Pages deployment. All computation runs client-side in JavaScript.

## License

MIT
