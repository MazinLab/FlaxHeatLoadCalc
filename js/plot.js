/**
 * Chart.js wrapper for the temperature profile plot.
 */

let profileChart = null;

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
