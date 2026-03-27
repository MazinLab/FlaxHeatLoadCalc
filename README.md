# Cryogenic Flex Cable Heat Load Calculator

A web-based calculator for computing steady-state thermal conduction and RF transmission loss (S21) through cryogenic coaxial cables from 0.1 to 300 K.

**Live at: https://mazinlab.github.io/FlaxHeatLoadCalc/**

## Features

- Heat load calculation via numerical integration of Fourier's law
- RF cable loss (S21) from 10 MHz to 18 GHz with conductor and dielectric loss breakdown
- Support for coaxial (annular outer conductor) and ribbon (flat foil outer conductor) geometries
- Silver plating model: separate base and plating layers for thermal conductivity, skin-depth-aware RF loss
- 22 built-in materials with piecewise k(T) and resistivity fits
- 8 cable presets including FLAX, Maybell CuNi, CryoCoax, and generic copper
- Temperature profile T(x) along the cable
- Log-log material thermal conductivity k(T) plot with data source citations
- Per-component heat load breakdown with silver plating contributions

## Physics

### Heat Load Calculation

The calculator computes steady-state heat conduction through a cable with parallel thermal paths. For plated conductors (e.g., silver-plated stainless steel), the base metal and plating are treated as separate parallel conduction paths with distinct cross-sectional areas and thermal conductivities.

For a single component with cross-sectional area *A*, length *L*, and temperature-dependent thermal conductivity *k(T)*, Fourier's law in the steady state gives:

```
Q = (A / L) * integral from T_cold to T_hot of k(T) dT
```

The total heat load per trace is the sum over all components:

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

### RF Cable Loss (S21)

The cable is modeled as a coaxial TEM transmission line with Z_0 = 50 Ohm. Total attenuation per unit length has two contributions:

**Conductor loss** from the skin effect:

```
alpha_c = (Rs_inner/a + Rs_outer/b) / (4 * pi * Z_0)
```

where Rs = sqrt(pi * mu_0 * f * rho(T)) is the surface resistance, *a* is the inner conductor radius, and *b* is the outer conductor inner radius. For superconductors (NbTi, Nb) below their critical temperature Tc, Rs = 0 (zero conductor loss). Above Tc, the normal-state resistivity is used.

**Dielectric loss** from the loss tangent:

```
alpha_d = pi * f * sqrt(epsilon_r) * tan(delta) / c
```

**Integration along the cable:** Since the cable has a temperature gradient, the attenuation is integrated along the cable using the temperature profile T(x):

```
S21(f) = -8.686 * integral from 0 to L of alpha_total(f, T(x)) dx   [dB]
```

The trapezoidal rule is used over the discrete T(x) profile points. For silver-plated conductors, the RF surface resistance uses the plating material's resistivity since the skin depth at GHz frequencies (~1 um) is typically smaller than the plating thickness.

The S21 plot shows total transmission loss with separate inner conductor, outer conductor, and dielectric loss curves. Loss values at 4 GHz and 8 GHz are displayed below the plot.

### Cable Geometry

Two geometry modes are supported:

**Coaxial** (semi-rigid cables): The inner conductor is a round wire of diameter *d*. The dielectric is a cylindrical annulus of radial thickness *t_d*. The outer conductor is an annular tube of radial thickness *t_o*. Cross-sectional areas follow from the radii:
- Inner: pi * (d/2)^2
- Dielectric: pi * ((d/2 + t_d)^2 - (d/2)^2)
- Outer: pi * ((d/2 + t_d + t_o)^2 - (d/2 + t_d)^2)

**Ribbon** (flex cables like FLAX): The inner conductor and dielectric are still round (insulated wire), but the outer conductor is a flat foil shared across traces. Per trace, the outer conductor cross-section is:
- Outer: trace_pitch * foil_thickness * num_foil_layers

For FLAX cables this is typically 3556 um pitch x 25.4 um foil x 2 layers (top and bottom).

### Silver Plating Model

For plated conductors (e.g., Ag-plated CuNi, Ag-plated SS304), the plating thickness is user-configurable (default 3 um). The plating is modeled as a separate thermal conduction path in parallel with the base metal, with its cross-sectional area computed from the conductor geometry and plating thickness. This is important because silver has much higher thermal conductivity than the base alloy, and even a few microns of plating can significantly increase heat load at low temperatures while dramatically reducing RF loss.

### Material Thermal Conductivity

Each material stores piecewise k(T) fits covering 0.1 to 300 K:

- **Main fit (typically 1-300 K):** NIST 8th-degree log-log polynomials, log10(k) = sum of a_i * log10(T)^i, or NIST rational polynomials for copper.
- **Sub-kelvin fit (typically 0.05-4 K):** Power-law fits k = a * T^b from literature measurements (Daal et al. 2019, Kushino et al. 2005, Lakeshore, etc.).
- **Stitching:** In the overlap region between the two fits, the conductivity is blended in log-space using linear interpolation in log10(k) vs log10(T).

For superconducting materials (NbTi, Nb) below their critical temperatures, the electronic thermal conductivity is exponentially suppressed and phonon transport dominates. The sub-kelvin fits capture this regime.

FEP dielectric data is approximated using PTFE, following the approach in Smith et al. (2024), as cryogenic FEP thermal conductivity data is not well documented in the literature.

## Materials

**Conductors:** NbTi, Nb (RRR~40), Cu (RRR 50/100/150/300/500), Al 6061-T6, Phosphor Bronze, Ag-plated Phosphor Bronze, Manganin, CuNi (C7150), CuNi (Maybell), Ag-plated CuNi, Silver (Ag), 304 Stainless Steel, Ag-plated 304 SS, Nichrome

**Dielectrics:** PTFE (Teflon), FEP (PTFE proxy), Kapton (Polyimide), G-10

Each conductor includes electrical resistivity data for the RF loss calculation, and each dielectric includes relative permittivity (epsilon_r) and loss tangent (tan delta). Full data source citations are displayed below the k(T) and S21 plots for the currently selected materials.

## Cable Presets

| Preset | Inner | Dielectric | Outer | Geometry |
|--------|-------|------------|-------|----------|
| FLAX v2 (Smith et al. 2024) | NbTi | PTFE | NbTi | Ribbon |
| FLAX v1 (prior design) | NbTi | PTFE | NbTi | Ribbon |
| Maybell CuNi/CuNi | CuNi | PTFE | CuNi | Ribbon |
| SC-086/50-CN-CN | CuNi | PTFE | CuNi | Coaxial |
| SC-086/50-SCN-CN | Ag-plated CuNi | PTFE | CuNi | Coaxial |
| SC-219/50-SSS-SS | Ag-plated SS304 | PTFE | SS304 | Coaxial |
| Copper Semi-Rigid | Cu RRR=50 | PTFE | Cu RRR=50 | Coaxial |

## References

- Smith, J.P., Mazin, B.A., et al. (2024). "FLAX: A Flexible Coaxial Ribbon Cable for Cryogenic Readout." IEEE Trans. Appl. Supercond. [10.1109/TASC.2024.3349538](https://ieeexplore.ieee.org/document/10381740)
- Smith, J.P., et al. (2020). "Flexible Coaxial Ribbon Cable for Sub-Kelvin Microwave Readout." [arXiv:2007.06496](https://arxiv.org/abs/2007.06496)
- Pozar, D.M. (2012). *Microwave Engineering*, 4th ed. Wiley. (Coaxial line attenuation, eq. 2.163)
- Daal, M., et al. (2019). "Cryogenic thermal conductivity measurements on candidate structural and wiring materials for use in sub-Kelvin instruments." Cryogenics 98, 47-59.
- Kushino, A., et al. (2005). "Thermal conduction measurement of miniature coaxial cables between 0.3 and 4.5 K." Cryogenics 45(9), 637-640.
- Koechlin, F. & Bonin, B. (1995). "Parametrisation of the Niobium Thermal Conductivity in the Superconducting State." Proc. 7th Workshop on RF Superconductivity, SRF95F24.
- Duthil, P. (2015). "Material Properties at Low Temperature." [arXiv:1501.07100](https://arxiv.org/abs/1501.07100)
- Kuroda, T., et al. (2018). "Thermal conductance and high-frequency properties of cryogenic semi-rigid coaxial cables." J. Low Temp. Phys. 193, 611-617.
- NIST Cryogenic Materials Database: https://trc.nist.gov/cryogenics/materials/materialproperties.htm

## Usage

Single-page static site with no build step. Open `index.html` in a browser or visit the GitHub Pages deployment. All computation runs client-side in JavaScript.

## License

MIT
