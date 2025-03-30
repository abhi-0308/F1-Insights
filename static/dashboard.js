const API_BASE_URL = "";
let lapTimesChart = null;
let comparisonChart = null;
let currentStandingsType = 'driver';

document.addEventListener("DOMContentLoaded", () => {
    initializeDashboard();
});

async function initializeDashboard() {
    updateTimestamp();
    initializeLapTimesChart();
    
    // Event listeners
    document.getElementById('compareDrivers').addEventListener('click', compareDrivers);
    document.getElementById('refreshStandings').addEventListener('click', fetchStandings);
    document.getElementById('refreshLapTimes').addEventListener('click', fetchLapTimes);
    document.getElementById('driverStandingsBtn').addEventListener('click', () => switchStandingsType('driver'));
    document.getElementById('constructorStandingsBtn').addEventListener('click', () => switchStandingsType('constructor'));
    
    // Initial data load
    await fetchStandings();
    await fetchLapTimes();
    await populateDriverDropdowns();
}

function updateTimestamp() {
    document.getElementById('updateTime').textContent = new Date().toLocaleString();
}

function switchStandingsType(type) {
    currentStandingsType = type;
    
    // Update button states
    document.getElementById('driverStandingsBtn').classList.toggle('active', type === 'driver');
    document.getElementById('driverStandingsBtn').classList.toggle('secondary', type !== 'driver');
    document.getElementById('constructorStandingsBtn').classList.toggle('active', type === 'constructor');
    document.getElementById('constructorStandingsBtn').classList.toggle('secondary', type !== 'constructor');
    
    // Update title
    document.querySelector('.standings-section .section-title').textContent = 
        type === 'driver' ? 'Current Driver Standings' : 'Current Constructor Standings';
    
    fetchStandings();
}

async function fetchStandings() {
    try {
        showLoading('standings', `Loading ${currentStandingsType} standings...`);
        const endpoint = currentStandingsType === 'driver' ? 'standings?type=driver' : 'standings?type=constructor';
        const response = await fetch(`${API_BASE_URL}/${endpoint}`);
        
        if (!response.ok) throw new Error(`Failed to fetch ${currentStandingsType} standings`);
        
        const data = await response.json();
        const standingsList = data.MRData?.StandingsTable?.StandingsLists?.[0];
        
        if (!standingsList) throw new Error(`No ${currentStandingsType} standings data available`);
        
        if (currentStandingsType === 'driver') {
            renderStandingsTable(standingsList.DriverStandings, 'driver');
        } else {
            renderStandingsTable(standingsList.ConstructorStandings, 'constructor');
        }
        
        updateTimestamp();
    } catch (error) {
        console.error('Standings error:', error);
        showError('standings', `Error loading ${currentStandingsType} standings. Please try again later.`);
    }
}

function renderStandingsTable(standings, type) {
    const standingsContainer = document.getElementById("standings");
    
    if (type === 'driver') {
        standingsContainer.innerHTML = `
            <table class="standings-table">
                <thead>
                    <tr>
                        <th>Pos</th>
                        <th>Driver</th>
                        <th>Team</th>
                        <th>Points</th>
                        <th>Wins</th>
                    </tr>
                </thead>
                <tbody>
                    ${standings.map(driver => `
                        <tr>
                            <td>${driver.position}</td>
                            <td>${driver.Driver.givenName} ${driver.Driver.familyName}</td>
                            <td>${driver.Constructors[0].name}</td>
                            <td>${driver.points}</td>
                            <td>${driver.wins}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } else {
        standingsContainer.innerHTML = `
            <table class="standings-table">
                <thead>
                    <tr>
                        <th>Pos</th>
                        <th>Team</th>
                        <th>Nationality</th>
                        <th>Points</th>
                        <th>Wins</th>
                    </tr>
                </thead>
                <tbody>
                    ${standings.map(constructor => `
                        <tr>
                            <td>${constructor.position}</td>
                            <td>${constructor.Constructor.name}</td>
                            <td>${constructor.Constructor.nationality}</td>
                            <td>${constructor.points}</td>
                            <td>${constructor.wins}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }
}


function initializeLapTimesChart() {
    const ctx = document.getElementById('lapChart').getContext('2d');
    lapTimesChart = new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Lap Times Comparison',
                    font: { size: 18 }
                }
            },
            scales: {
                x: { title: { display: true, text: 'Lap Number' } },
                y: { title: { display: true, text: 'Lap Time (seconds)' }, reverse: true }
            }
        }
    });
}

async function fetchLapTimes() {
    try {
        showLoading('lapChart', 'Loading lap times...');
        const response = await fetch(`${API_BASE_URL}/lap_times`);
        
        if (!response.ok) throw new Error('Failed to fetch lap times');
        
        const data = await response.json();
        const race = data.MRData?.RaceTable?.Races?.[0];
        
        if (!race || !race.Laps) throw new Error('No lap times data available');
        
        renderLapTimesChart(race);
        updateTimestamp();
    } catch (error) {
        console.error('Lap times error:', error);
        showError('lapChart', 'Error loading lap times. Please try again later.');
    }
}

function renderLapTimesChart(raceData) {
    const laps = raceData.Laps;
    const datasets = [];
    const lapNumbers = laps.map(lap => lap.number);
    
    // Process each driver's lap times
    const drivers = {};
    laps.forEach(lap => {
        lap.Timings.forEach(timing => {
            const driverId = timing.driverId.toLowerCase();
            if (!drivers[driverId]) {
                drivers[driverId] = {
                    name: formatDriverName(timing.driverId),
                    times: Array(laps.length).fill(null),
                    color: getDriverColor(driverId)
                };
            }
            const lapIndex = parseInt(lap.number) - 1;
            drivers[driverId].times[lapIndex] = convertToSeconds(timing.time);
        });
    });
    
    // Create datasets for chart
    Object.values(drivers).forEach(driver => {
        datasets.push({
            label: driver.name,
            data: driver.times,
            borderColor: driver.color,
            backgroundColor: `${driver.color}80`,
            borderWidth: 2,
            fill: false
        });
    });
    
    // Update chart
    lapTimesChart.data.labels = lapNumbers;
    lapTimesChart.data.datasets = datasets;
    lapTimesChart.options.plugins.title.text = `Lap Times - ${raceData.raceName}`;
    lapTimesChart.update();
}

async function populateDriverDropdowns() {
    try {
        const response = await fetch(`${API_BASE_URL}/standings?type=driver`);
        if (!response.ok) return;
        
        const data = await response.json();
        const standings = data.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings;
        if (!standings) return;
        
        const select1 = document.getElementById('driver1Select');
        const select2 = document.getElementById('driver2Select');
        
        // Clear existing options except first
        select1.innerHTML = '<option value="">Select Driver 1</option>';
        select2.innerHTML = '<option value="">Select Driver 2</option>';
        
        standings.forEach(driver => {
            const driverId = driver.Driver.driverId;
            const optionText = `${driver.Driver.givenName} ${driver.Driver.familyName}`;
            
            const option1 = document.createElement('option');
            option1.value = driverId;
            option1.textContent = optionText;
            select1.appendChild(option1);
            
            const option2 = document.createElement('option');
            option2.value = driverId;
            option2.textContent = optionText;
            select2.appendChild(option2);
        });
    } catch (error) {
        console.error('Error populating driver dropdowns:', error);
    }
}

function compareDrivers() {
    const driver1 = document.getElementById("driver1Select").value;
    const driver2 = document.getElementById("driver2Select").value;
    
    if (!driver1 || !driver2) {
        showError("comparisonContainer", "Please select two drivers to compare");
        return;
    }
    
    if (driver1 === driver2) {
        showError("comparisonContainer", "Please select two different drivers");
        return;
    }
    
    fetchDriverComparison(driver1, driver2);
}

async function fetchDriverComparison(driver1, driver2) {
    try {
        showLoading('comparisonContainer', 'Loading comparison data...');
        const response = await fetch(`${API_BASE_URL}/driver_comparison/${driver1}/${driver2}`);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to fetch comparison data');
        }
        
        const data = await response.json();
        
        if (data.error) throw new Error(data.error);
        if (!data.races || data.races.length === 0) {
            throw new Error('No common races found for these drivers');
        }
        
        renderDriverComparison(data);
    } catch (error) {
        console.error('Comparison error:', error);
        showComparisonError(error.message, driver1, driver2);
    }
}

// [Previous code remains the same until the renderDriverComparison function]

function renderDriverComparison(data) {
    const container = document.getElementById('comparisonContainer');
    
    // Clear previous results
    container.innerHTML = `
        <div class="comparison-content">
            <div class="comparison-header">
                <h3>${data.driver1.name} vs ${data.driver2.name}</h3>
                <div class="driver-badges">
                    <span class="driver-badge driver1-badge">
                        ${data.driver1.name}
                    </span>
                    <span class="driver-badge driver2-badge">
                        ${data.driver2.name}
                    </span>
                </div>
            </div>
            <div class="comparison-chart-container">
                <canvas id="comparisonChart"></canvas>
            </div>
            <div class="race-results">
                <h4>Head-to-head results (${data.races.length} races)</h4>
                <div class="results-grid">
                    ${data.races.map(race => `
                        <div class="race-result ${getResultClass(race.driver1.position, race.driver2.position)}">
                            <div class="race-info">
                                <span class="race-name">${race.name}</span>
                                <span class="race-date">${formatDate(race.date)}</span>
                            </div>
                            <div class="driver-result">
                                <span class="driver-name driver1-name">
                                    ${data.driver1.name}
                                </span>
                                <span class="driver-position">
                                    P${race.driver1.position} (${race.driver1.points} pts)
                                </span>
                            </div>
                            <div class="driver-result">
                                <span class="driver-name driver2-name">
                                    ${data.driver2.name}
                                </span>
                                <span class="driver-position">
                                    P${race.driver2.position} (${race.driver2.points} pts)
                                </span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
    
    // Initialize or update the chart
    const ctx = document.getElementById('comparisonChart').getContext('2d');
    
    if (comparisonChart) {
        comparisonChart.destroy();
    }
    
    comparisonChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.races.map(race => race.name),
            datasets: [
                {
                    label: data.driver1.name,
                    data: data.races.map(race => race.driver1.points),
                    backgroundColor: '#FF5252',  // Red color
                    borderColor: '#FF0000',
                    borderWidth: 2
                },
                {
                    label: data.driver2.name,
                    data: data.races.map(race => race.driver2.points),
                    backgroundColor: '#4285F4',  // Blue color
                    borderColor: '#3367D6',
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: 'Points Comparison',
                    font: { size: 16 }
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// [Rest of your existing helper functions remain the same]

function renderComparisonChart(data) {
    const ctx = document.getElementById('comparisonChart').getContext('2d');
    
    if (comparisonChart) {
        comparisonChart.destroy();
    }
    
    comparisonChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.races.map(race => race.name),
            datasets: [
                {
                    label: data.driver1.name,
                    data: data.races.map(race => race.driver1.points),
                    backgroundColor: `${data.driver1.color}CC`,
                    borderColor: data.driver1.color,
                    borderWidth: 2
                },
                {
                    label: data.driver2.name,
                    data: data.races.map(race => race.driver2.points),
                    backgroundColor: `${data.driver2.color}CC`,
                    borderColor: data.driver2.color,
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: 'Points Comparison',
                    font: { size: 18 }
                }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

// Helper functions
function formatDriverName(driverId) {
    return driverId.split('_').map(name => 
        name.charAt(0).toUpperCase() + name.slice(1)
    ).join(' ');
}

function getDriverColor(driverId) {
    const teamColors = {
        'max_verstappen': '#0600EF',
        'sergio_perez': '#0600EF',
        'lewis_hamilton': '#00D2BE',
        'george_russell': '#00D2BE',
        'charles_leclerc': '#DC0000',
        'carlos_sainz': '#DC0000',
        'lando_norris': '#FF8700',
        'pierre_gasly': '#0090FF',
        'esteban_ocon': '#0090FF',
        'fernando_alonso': '#006F62'
    };
    return teamColors[driverId] || '#777777';
}

function convertToSeconds(timeString) {
    const [minutes, seconds] = timeString.split(':').map(parseFloat);
    return minutes * 60 + seconds;
}

function formatDate(dateString) {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
}

function getResultClass(pos1, pos2) {
    if (pos1 === pos2) return 'draw';
    return parseInt(pos1) < parseInt(pos2) ? 'win' : 'loss';
}

function showLoading(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = `
            <div class="loading-message">
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
                <p>${message}</p>
                <button onclick="retryLoading('${elementId}')" class="retry-button">Retry</button>
            </div>
        `;
    }
}

function showComparisonError(message, driver1, driver2) {
    const container = document.getElementById('comparisonContainer');
    container.innerHTML = `
        <div class="comparison-error">
            <h3>${formatDriverName(driver1)} vs ${formatDriverName(driver2)}</h3>
            <p class="error-message">${message}</p>
            <div class="suggestions">
                <button onclick="retryComparison()" class="retry-button">Retry</button>
            </div>
        </div>
    `;
}

function retryLoading(elementId) {
    if (elementId === 'standings') {
        fetchStandings();
    } else if (elementId === 'lapChart') {
        fetchLapTimes();
    } else if (elementId === 'comparisonContainer') {
        compareDrivers();
    }
}

function retryComparison() {
    const driver1 = document.getElementById('driver1Select').value;
    const driver2 = document.getElementById('driver2Select').value;
    if (driver1 && driver2) {
        fetchDriverComparison(driver1, driver2);
    }
}

// Make functions available globally
window.retryLoading = retryLoading;
window.retryComparison = retryComparison;