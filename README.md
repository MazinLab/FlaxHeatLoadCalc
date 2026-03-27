# Cryogenic Flex Cable Heat Load Calculator

A web-based calculator for computing steady-state thermal conduction through cryogenic flex coaxial cables from 0.1 to 300 K.

**Live at: https://mazinlab.github.io/FlaxHeatLoadCalc/**

## Features

- Heat load calculation via numerical integration of Fourier's law
- Support for coaxial (annular outer conductor) and ribbon (flat foil outer conductor) cable geometries
- 18 built-in materials with piecewise k(T) fits stitching sub-kelvin and NIST data
- Cable presets for FLAX v1/v2, CryoCoax SC-086/50-SCN-CN, and generic copper semi-rigid
- Temperature profile T(x) along the cable via ODE solution
- Log-log material thermal conductivity plot with data source citations
- Per-component heat load breakdown (inner conductor, dielectric, outer conductor)

## Physics

### Heat Load Calculation

The calculator computes steady-state heat conduction through a cable with three parallel thermal paths: the inner conductor, the dielectric insulation, and the outer conductor. Each component contributes independently to the total heat flow.

For a single component with cross-sectional area *A*, length *L*, and temperature-dependent thermal conductivity *k(T)*, Fourier's law in the steady state gives:

```
Q = (A / L) * integral from T_cold to T_hot of k(T) dT
```

The total heat load per trace is the sum over all three components:

```
Q_total = (1/L) * sum_i [ A_i * integral k_i(T) dT ]
```

This is equivalent to defining a cable thermal conductance function G(T) = sum_i A_i * k_i(T), as used in Smith et al. (2020), and integrating:

```
Q_total = (1/L) * integral from T_cold to T_hot of G(T) dT
```

The integrals are evaluated using adaptive Simpson quadrature with Richardson extrapolation.

### Temperature Profile

At steady state the heat flux Q is constant along the cable. The temperature profile T(x) is found by inverting the relationship between position and temperature. Defining a fractional coordinate s = x/L:

```
ds/dT = G(T) / (Q * L)
```

This ODE is integrated from T_cold (s=0) to T_hot (s=1) using the trapezoidal rule on a fine temperature grid, building a T-to-s lookup table. The result is inverted by binary search to obtain T at uniformly spaced positions along the cable. This captures the nonlinear temperature distribution that arises from the strong temperature dependence of k(T) at cryogenic temperatures.

### Cable Geometry

Two geometry modes are supported:

**Coaxial** (semi-rigid cables): The inner conductor is a round wire of diameter *d*. The dielectric is a cylindrical annulus of radial thickness *t_d*. The outer conductor is an annular tube of radial thickness *t_o*. Cross-sectional areas follow from the radii:
- Inner: pi * (d/2)^2
- Dielectric: pi * ((d/2 + t_d)^2 - (d/2)^2)
- Outer: pi * ((d/2 + t_d + t_o)^2 - (d/2 + t_d)^2)

**Ribbon** (flex cables like FLAX): The inner conductor and dielectric are still round (insulated wire), but the outer conductor is a flat foil shared across traces. Per trace, the outer conductor cross-section is:
- Outer: trace_pitch * foil_thickness * num_foil_layers

For FLAX cables this is typically 3556 um pitch * 25.4 um foil * 2 layers (top and bottom).

### Material Thermal Conductivity

Each material stores piecewise k(T) fits covering 0.1 to 300 K:

- **Main fit (typically 1-300 K):** NIST 8th-degree log-log polynomials, log10(k) = sum of a_i * log10(T)^i, or NIST rational polynomials for copper.
- **Sub-kelvin fit (typically 0.05-4 K):** Power-law fits k = a * T^b from literature measurements (Daal et al. 2019, Kushino et al. 2005, Lakeshore, etc.).
- **Stitching:** In the overlap region between the two fits, the conductivity is blended in log-space using linear interpolation in log10(k) vs log10(T).

For superconducting materials (NbTi, Nb) below their critical temperatures, the electronic thermal conductivity is exponentially suppressed and phonon transport dominates. The sub-kelvin fits capture this regime.

FEP dielectric data is approximated using PTFE, following the approach in Smith et al. (2024), as cryogenic FEP thermal conductivity data is not well documented in the literature.

## Materials

**Conductors:** NbTi, Nb (RRR~40), Cu (RRR 50/100/150/300/500), Al 6061-T6, Phosphor Bronze, Manganin, CuNi (C7150), 304 Stainless Steel, Ag-plated 304 SS, Nichrome

**Dielectrics:** PTFE (Teflon), FEP (PTFE proxy), Kapton (Polyimide), G-10

Full data source citations are displayed below the k(T) plot for the currently selected materials.

## References

- Smith, J.P., Mazin, B.A., et al. (2024). "FLAX: A Flexible Coaxial Ribbon Cable for Cryogenic Readout." IEEE Trans. Appl. Supercond. [10.1109/TASC.2024.3349538](https://ieeexplore.ieee.org/document/10381740)
- Smith, J.P., et al. (2020). "Flexible Coaxial Ribbon Cable for Sub-Kelvin Microwave Readout." [arXiv:2007.06496](https://arxiv.org/abs/2007.06496)
- Daal, M., et al. (2019). "Cryogenic thermal conductivity measurements on candidate structural and wiring materials for use in sub-Kelvin instruments." Cryogenics 98, 47-59.
- Kushino, A., et al. (2005). "Thermal conduction measurement of miniature coaxial cables between 0.3 and 4.5 K." Cryogenics 45(9), 637-640.
- Koechlin, F. & Bonin, B. (1995). "Parametrisation of the Niobium Thermal Conductivity in the Superconducting State." Proc. 7th Workshop on RF Superconductivity, SRF95F24.
- Duthil, P. (2015). "Material Properties at Low Temperature." [arXiv:1501.07100](https://arxiv.org/abs/1501.07100)
- NIST Cryogenic Materials Database: https://trc.nist.gov/cryogenics/materials/materialproperties.htm

## Usage

Single-page static site with no build step. Open `index.html` in a browser or visit the GitHub Pages deployment. All computation runs client-side in JavaScript.

## License

MIT
