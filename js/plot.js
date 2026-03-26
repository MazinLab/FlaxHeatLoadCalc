/**
 * Chart.js wrappers for temperature profile and material conductivity plots.
 */

let profileChart = null;
let conductivityChart = null;

/**
 * Render (or update) the temperature profile plot.
 * @param {string} canvasId - Canvas element ID
 * @param {number[]} x - Position along cable [m]
 * @param {number[]} T - Temperature [K]
 */
function renderTemperatureProfile(canvasId, x, T) {
    const ctx = document.getElementById(canvasId).getContext('2d');

    // Convert x to cm if length < 1 m for readability, else keep m
    const maxX = x[x.length - 1];
    let xLabel, xData;
    if (maxX < 1.0) {
        xLabel = 'Position (cm)';
        xData = x.map(v => v * 100);
    } else {
        xLabel = 'Position (m)';
        xData = x;
    }

    // Choose T display unit
    let tLabel, tData;
    const maxT = T[T.length - 1];
    if (maxT < 1.0) {
        tLabel = 'Temperature (mK)';
        tData = T.map(v => v * 1000);
    } else {
        tLabel = 'Temperature (K)';
        tData = T;
    }

    const data = xData.map((xi, i) => ({ x: xi, y: tData[i] }));

    if (profileChart) {
        profileChart.data.datasets[0].data = data;
        profileChart.options.scales.x.title.text = xLabel;
        profileChart.options.scales.y.title.text = tLabel;
        profileChart.update();
        return;
    }

    profileChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: 'T(x)',
                data: data,
                borderColor: '#4fc3f7',
                backgroundColor: 'rgba(79, 195, 247, 0.1)',
                fill: true,
                pointRadius: 0,
                borderWidth: 2,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            return `T = ${ctx.parsed.y.toFixed(3)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: xLabel, color: '#8899aa' },
                    ticks: { color: '#8899aa' },
                    grid: { color: 'rgba(42, 58, 74, 0.5)' }
                },
                y: {
                    type: 'linear',
                    title: { display: true, text: tLabel, color: '#8899aa' },
                    ticks: { color: '#8899aa' },
                    grid: { color: 'rgba(42, 58, 74, 0.5)' }
                }
            }
        }
    });
}

/**
 * Render (or update) the material thermal conductivity plot.
 * Shows k(T) for up to 3 materials on a log-log scale over the given temperature range.
 *
 * @param {string} canvasId - Canvas element ID
 * @param {Array<{material: object, label: string, color: string}>} materials
 * @param {number} T_cold - Lower temperature bound [K]
 * @param {number} T_hot - Upper temperature bound [K]
 * @param {number} [nPoints=200] - Number of sample points
 */
function renderConductivityPlot(canvasId, materials, T_cold, T_hot, nPoints = 200) {
    const ctx = document.getElementById(canvasId).getContext('2d');

    // Generate log-spaced temperature points
    const logMin = Math.log10(T_cold);
    const logMax = Math.log10(T_hot);
    const temps = [];
    for (let i = 0; i < nPoints; i++) {
        temps.push(Math.pow(10, logMin + (logMax - logMin) * i / (nPoints - 1)));
    }

    const datasets = materials.map(({ material, label, color }) => ({
        label: label,
        data: temps.map(T => ({ x: T, y: getThermalConductivity(material, T) })),
        borderColor: color,
        backgroundColor: 'transparent',
        pointRadius: 0,
        borderWidth: 2,
        tension: 0.1
    }));

    if (conductivityChart) {
        conductivityChart.data.datasets = datasets;
        conductivityChart.options.scales.x.min = T_cold;
        conductivityChart.options.scales.x.max = T_hot;
        conductivityChart.update();
        return;
    }

    conductivityChart = new Chart(ctx, {
        type: 'line',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: '#8899aa',
                        font: { family: "'Space Mono', monospace", size: 10 },
                        boxWidth: 16,
                        padding: 12
                    }
                },
                tooltip: {
                    callbacks: {
                        title: function(items) {
                            return 'T = ' + items[0].parsed.x.toPrecision(3) + ' K';
                        },
                        label: function(ctx) {
                            return ctx.dataset.label + ': ' + ctx.parsed.y.toExponential(2) + ' W/(m\u00B7K)';
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'logarithmic',
                    min: T_cold,
                    max: T_hot,
                    title: { display: true, text: 'Temperature (K)', color: '#8899aa' },
                    ticks: { color: '#8899aa' },
                    grid: { color: 'rgba(42, 58, 74, 0.5)' }
                },
                y: {
                    type: 'logarithmic',
                    title: { display: true, text: 'k(T)  [W/(m\u00B7K)]', color: '#8899aa' },
                    ticks: { color: '#8899aa' },
                    grid: { color: 'rgba(42, 58, 74, 0.5)' }
                }
            }
        }
    });
}
