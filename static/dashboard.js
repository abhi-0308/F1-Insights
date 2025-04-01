const API_BASE_URL = ""; // Relative URL since we're serving from same origin
let lapTimesChart = null;
let comparisonChart = null;
let currentStandingsType = 'driver';

document.addEventListener("DOMContentLoaded", () => {
    initializeDashboard();
});

async function initializeDashboard() {
    console.log("Initializing dashboard...");
    updateTimestamp();
    initializeEmptyCharts();
    
    // Event listeners
    document.getElementById('compareDrivers').addEventListener('click', compareDrivers);
    document.getElementById('refreshStandings').addEventListener('click', fetchStandings);
    document.getElementById('refreshLapTimes').addEventListener('click', fetchLapTimes);
    document.getElementById('driverStandingsBtn').addEventListener('click', () => switchStandingsType('driver'));
    document.getElementById('constructorStandingsBtn').addEventListener('click', () => switchStandingsType('constructor'));
    
    try {
        await Promise.all([
            fetchStandings(),
            fetchLapTimes(),
            populateDriverDropdowns()
        ]);
    } catch (error) {
        console.error("Initialization error:", error);
        showError('standings', 'Failed to initialize dashboard');
    }
}

function initializeEmptyCharts() {
    // Initialize empty lap times chart
    const lapCtx = document.getElementById('lapChart').getContext('2d');
    lapTimesChart = new Chart(lapCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: []
        },
        options: getChartOptions('Lap Times Comparison')
    });

    // Hide the fallback now that chart is initialized
    document.getElementById('lapChartFallback').style.display = 'none';
}

function getChartOptions(title) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            title: {
                display: true,
                text: title,
                font: { 
                    size: 18,
                    weight: 'bold'
                }
            },
            tooltip: {
                callbacks: {
                    label: function(context) {
                        return `${context.dataset.label}: ${context.raw.toFixed(3)}s`;
                    }
                }
            },
            legend: {
                position: 'top',
                labels: {
                    usePointStyle: true,
                    pointStyle: 'circle',
                    padding: 20,
                    font: {
                        size: 12
                    }
                }
            }
        },
        scales: {
            x: {
                title: {
                    display: true,
                    text: 'Lap Number',
                    font: {
                        weight: 'bold'
                    }
                },
                grid: {
                    display: false
                }
            },
            y: {
                title: {
                    display: true,
                    text: 'Lap Time (seconds)',
                    font: {
                        weight: 'bold'
                    }
                },
                reverse: true,
                ticks: {
                    callback: function(value) {
                        return value.toFixed(1);
                    }
                }
            }
        },
        interaction: {
            intersect: false,
            mode: 'index'
        },
        animation: {
            duration: 1000
        }
    };
}

async function fetchStandings() {
    const endpoint = `/standings?type=${currentStandingsType}&_=${Date.now()}`;
    showLoading('standings', 'Loading standings data...');
    
    try {
        const response = await fetch(endpoint);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status === 'error') {
            throw new Error(data.message);
        }
        
        renderStandingsTable(data.data.standings, currentStandingsType);
        updateTimestamp();
    } catch (error) {
        console.error('Standings error:', error);
        showError('standings', `Failed to load standings: ${error.message}`);
        
        // Fallback to hardcoded data
        renderStandingsTable([{
            position: "1",
            Driver: { givenName: "Max", familyName: "Verstappen" },
            Constructors: [{ name: "Red Bull" }],
            points: "25",
            wins: "1"
        }], 'driver');
    }
}

function renderStandingsTable(standings, type = 'driver') {
    const container = document.getElementById("standings");
    
    if (!standings || standings.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-circle"></i>
                <p>No standings data available</p>
            </div>
        `;
        return;
    }
    
    // Create table structure
    let html = `
        <table>
            <thead>
                <tr>
                    <th>Pos</th>
                    <th>${type === 'driver' ? 'Driver' : 'Constructor'}</th>
                    <th>${type === 'driver' ? 'Team' : 'Nationality'}</th>
                    <th>Points</th>
                    <th>Wins</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    // Add rows for ALL drivers
    standings.forEach(item => {
        try {
            const position = item.position || "N/A";
            const points = item.points || "0";
            const wins = item.wins || "0";
            
            if (type === 'driver') {
                const driver = item.Driver || {};
                const team = (item.Constructors && item.Constructors[0]) || {};
                html += `
                    <tr>
                        <td>${position}</td>
                        <td>${driver.givenName || ""} ${driver.familyName || ""}</td>
                        <td>${team.name || "Unknown"}</td>
                        <td>${points}</td>
                        <td>${wins}</td>
                    </tr>
                `;
            } else {
                const team = item.Constructor || {};
                html += `
                    <tr>
                        <td>${position}</td>
                        <td>${team.name || "Unknown"}</td>
                        <td>${team.nationality || "N/A"}</td>
                        <td>${points}</td>
                        <td>${wins}</td>
                    </tr>
                `;
            }
        } catch (e) {
            console.error("Error rendering row:", item, e);
            html += "<tr><td colspan='5'>Error loading data</td></tr>";
        }
    });
    
    html += `
            </tbody>
        </table>
    `;
    
    container.innerHTML = html;
}

async function fetchLapTimes() {
    showLoading('lapChart', 'Loading lap times data...');
    
    try {
        const response = await fetch('/lap_times');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        renderLapTimesChart(data);
        updateTimestamp();
    } catch (error) {
        console.error('Lap times error:', error);
        showError('lapChart', `Failed to load lap times: ${error.message}`);
    }
}

function renderLapTimesChart(data) {
    const lapLabels = data.laps.labels;
    const driversData = data.laps.drivers;
    
    // Create datasets for each driver
    const datasets = driversData.map(driver => ({
        label: driver.name,
        data: driver.times,
        borderColor: driver.color,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: driver.color,
        pointBorderColor: '#ffffff',
        tension: 0.1,
        fill: false
    }));
    
    // Update the chart
    lapTimesChart.data.labels = lapLabels;
    lapTimesChart.data.datasets = datasets;
    lapTimesChart.options.plugins.title.text = `Lap Times Comparison - ${data.race.name}`;
    lapTimesChart.update();
}

async function populateDriverDropdowns() {
    try {
        const response = await fetch('/standings?type=driver');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        const standings = data.data?.standings || [];
        
        const select1 = document.getElementById('driver1Select');
        const select2 = document.getElementById('driver2Select');
        
        // Clear existing options
        select1.innerHTML = '<option value="">Select Driver 1</option>';
        select2.innerHTML = '<option value="">Select Driver 2</option>';
        
        // Add ALL drivers to dropdowns
        standings.forEach(driver => {
            if (driver.Driver && driver.Driver.driverId) {
                const option = document.createElement('option');
                option.value = driver.Driver.driverId;
                option.textContent = `${driver.Driver.givenName} ${driver.Driver.familyName}`;
                select1.appendChild(option.cloneNode(true));
                select2.appendChild(option);
            }
        });
    } catch (error) {
        console.error('Dropdown population error:', error);
        
        // Fallback options if API fails
        const fallbackDrivers = [
            { id: 'max_verstappen', name: 'Max Verstappen' },
            { id: 'sergio_perez', name: 'Sergio Perez' },
            { id: 'lewis_hamilton', name: 'Lewis Hamilton' },
            { id: 'george_russell', name: 'George Russell' },
            { id: 'charles_leclerc', name: 'Charles Leclerc' },
            { id: 'carlos_sainz', name: 'Carlos Sainz' }
        ];
        
        const select1 = document.getElementById('driver1Select');
        const select2 = document.getElementById('driver2Select');
        
        fallbackDrivers.forEach(driver => {
            const option = document.createElement('option');
            option.value = driver.id;
            option.textContent = driver.name;
            select1.appendChild(option.cloneNode(true));
            select2.appendChild(option);
        });
    }
}

async function compareDrivers() {
    const driver1 = document.getElementById('driver1Select').value;
    const driver2 = document.getElementById('driver2Select').value;
    
    if (!driver1 || !driver2) {
        showError('comparisonContainer', 'Please select two drivers');
        return;
    }
    
    if (driver1 === driver2) {
        showError('comparisonContainer', 'Please select different drivers');
        return;
    }
    
    try {
        showLoading('comparisonContainer', 'Loading comparison data...');
        const response = await fetch(`/driver_comparison/${driver1}/${driver2}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status === 'error') {
            throw new Error(data.message);
        }
        
        renderDriverComparison(data.data);
        updateTimestamp();
    } catch (error) {
        console.error('Comparison error:', error);
        showComparisonError(error.message, driver1, driver2);
    }
}

function renderDriverComparison(data) {
    const container = document.getElementById('comparisonContainer');
    
    // If no races found but we have driver info
    if (!data.races || data.races.length === 0) {
        container.innerHTML = `
            <div class="comparison-content">
                <div class="comparison-header">
                    <h3>${data.driver1.name} vs ${data.driver2.name}</h3>
                    <div class="driver-badges">
                        <span class="driver-badge" style="background:${data.driver1.color}">
                            ${data.driver1.name}
                        </span>
                        <span class="driver-badge" style="background:${data.driver2.color}">
                            ${data.driver2.name}
                        </span>
                    </div>
                </div>
                <div class="empty-state">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>No common races found for these drivers in ${data.season}</p>
                </div>
            </div>
        `;
        return;
    }
    
    // Calculate comparison stats
    let driver1Wins = 0;
    let driver2Wins = 0;
    let draws = 0;
    
    data.races.forEach(race => {
        const pos1 = parseInt(race.driver1.position) || 99;
        const pos2 = parseInt(race.driver2.position) || 99;
        
        if (pos1 < pos2) driver1Wins++;
        else if (pos2 < pos1) driver2Wins++;
        else draws++;
    });
    
    container.innerHTML = `
        <div class="comparison-content">
            <div class="comparison-header">
                <h3>${data.driver1.name} vs ${data.driver2.name}</h3>
                <div class="driver-badges">
                    <span class="driver-badge" style="background:${data.driver1.color}">
                        ${data.driver1.name}
                    </span>
                    <span class="driver-badge" style="background:${data.driver2.color}">
                        ${data.driver2.name}
                    </span>
                </div>
                <div class="comparison-stats">
                    <div class="stat-box" style="border-color: ${data.driver1.color}">
                        <span class="stat-value">${driver1Wins}</span>
                        <span class="stat-label">Wins</span>
                    </div>
                    <div class="stat-box">
                        <span class="stat-value">${draws}</span>
                        <span class="stat-label">Draws</span>
                    </div>
                    <div class="stat-box" style="border-color: ${data.driver2.color}">
                        <span class="stat-value">${driver2Wins}</span>
                        <span class="stat-label">Wins</span>
                    </div>
                </div>
            </div>
            
            <div class="comparison-chart-container">
                <canvas id="comparisonChart"></canvas>
            </div>
            
            <div class="race-results">
                <h4>Head-to-head results (${data.races.length} races in ${data.season})</h4>
                <div class="results-grid">
                    ${data.races.map(race => `
                        <div class="race-result ${getResultClass(race.driver1.position,race.driver2.position)}">
                            <div class="race-info">
                                <span class="race-name">${race.name}</span>
                                <span class="race-date">${formatDate(race.date)}</span>
                                <span class="circuit-name">${race.circuit}</span>
                            </div>
                            <div class="driver-result driver1">
                                <span class="driver-name">${data.driver1.name}</span>
                                <span class="driver-position">P${race.driver1.position} (${race.driver1.points} pts)</span>
                            </div>
                            <div class="driver-result driver2">
                                <span class="driver-name">${data.driver2.name}</span>
                                <span class="driver-position">P${race.driver2.position} (${race.driver2.points} pts)</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
    
    // Initialize comparison chart
    renderComparisonChart(data, driver1Wins, driver2Wins, draws);
}

function renderComparisonChart(data, driver1Wins, driver2Wins, draws) {
    const ctx = document.getElementById('comparisonChart').getContext('2d');
    
    if (comparisonChart) {
        comparisonChart.destroy();
    }
    
    comparisonChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: [
                `${data.driver1.name} Wins`,
                'Draws',
                `${data.driver2.name} Wins`
            ],
            datasets: [{
                data: [driver1Wins, draws, driver2Wins],
                backgroundColor: [
                    data.driver1.color,
                    '#FFC107',
                    data.driver2.color
                ],
                borderColor: '#ffffff',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Head-to-Head Results',
                    font: {
                        size: 16,
                        weight: 'bold'
                    }
                },
                legend: {
                    position: 'right',
                    labels: {
                        usePointStyle: true,
                        padding: 20
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const total = driver1Wins + driver2Wins + draws;
                            const percentage = Math.round((context.raw / total) * 100);
                            return `${context.label}: ${context.raw} (${percentage}%)`;
                        }
                    }
                }
            },
            cutout: '70%',
            animation: {
                animateScale: true,
                animateRotate: true
            }
        }
    });
}

function switchStandingsType(type) {
    currentStandingsType = type;
    
    // Update button styles
    const driverBtn = document.getElementById('driverStandingsBtn');
    const constructorBtn = document.getElementById('constructorStandingsBtn');
    
    if (type === 'driver') {
        driverBtn.classList.add('active');
        driverBtn.classList.remove('secondary');
        constructorBtn.classList.add('secondary');
        constructorBtn.classList.remove('active');
    } else {
        constructorBtn.classList.add('active');
        constructorBtn.classList.remove('secondary');
        driverBtn.classList.add('secondary');
        driverBtn.classList.remove('active');
    }
    
    // Update title
    document.querySelector('.standings-section .section-title').textContent = 
        `${type === 'driver' ? 'Driver' : 'Constructor'} Standings`;
    
    // Fetch new data
    fetchStandings();
}

function getResultClass(pos1, pos2) {
    if (pos1 === pos2) return 'draw';
    return parseInt(pos1) < parseInt(pos2) ? 'win' : 'loss';
}

function formatDate(dateString) {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
}

function updateTimestamp() {
    const now = new Date();
    document.getElementById('updateTime').textContent = 
        `${now.toLocaleDateString()} at ${now.toLocaleTimeString()}`;
}

function showLoading(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = `
            <div class="loading-state">
                <div class="spinner"></div>
                <p>${message}</p>
            </div>
        `;
    }
}

function showError(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-triangle"></i>
                <p>${message}</p>
                <button class="retry-button" onclick="retryLoading('${elementId}')">
                    <i class="fas fa-sync-alt"></i> Retry
                </button>
            </div>
        `;
    }
}

function showComparisonError(message, driver1, driver2) {
    const container = document.getElementById('comparisonContainer');
    container.innerHTML = `
        <div class="comparison-error">
            <h3>${formatDriverName(driver1)} vs ${formatDriverName(driver2)}</h3>
            <div class="error-message">
                <i class="fas fa-exclamation-triangle"></i>
                <p>${message}</p>
                <button class="retry-button" onclick="retryComparison()">
                    <i class="fas fa-sync-alt"></i> Try Again
                </button>
            </div>
        </div>
    `;
}

function formatDriverName(driverId) {
    return driverId.split('_').map(name => 
        name.charAt(0).toUpperCase() + name.slice(1)
    ).join(' ');
}

// Global functions for retry buttons
window.retryLoading = function(elementId) {
    if (elementId === 'standings') fetchStandings();
    else if (elementId === 'lapChart') fetchLapTimes();
};

window.retryComparison = function() {
    const driver1 = document.getElementById('driver1Select').value;
    const driver2 = document.getElementById('driver2Select').value;
    if (driver1 && driver2) fetchDriverComparison(driver1, driver2);
};