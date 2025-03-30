const API_BASE_URL = ""; 
let lapTimesChart = null;
let comparisonChart = null;
let currentStandingsType = 'driver';

document.addEventListener("DOMContentLoaded", () => {
    initializeDashboard();
});

async function initializeDashboard() {
    console.log("Initializing dashboard...");
    updateTimestamp();
    initializeLapTimesChart();
    
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
    }
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

async function fetchStandings() {
    try {
        showLoading('standings', `Loading ${currentStandingsType} standings...`);
        const response = await fetch(`/standings?type=${currentStandingsType}`);
        const { status, data } = await response.json();

        if (!response.ok || status === "error") {
            throw new Error(data?.message || "Failed to load standings");
        }

        if (!data.standings || data.standings.length === 0) {
            renderEmptyState('standings', 
                data.message || `No ${currentStandingsType} standings available for ${data.season}`
            );
        } else {
            renderStandingsTable(data.standings);
        }

    } catch (error) {
        console.error('Standings error:', error);
        showError('standings', error.message);
        setTimeout(fetchStandings, 5000); // Retry after 5 seconds
    }
}

function renderEmptyState(elementId, message) {
    const container = document.getElementById(elementId);
    container.innerHTML = `
        <div class="empty-state">
            <p>${message}</p>
            <button onclick="fetchStandings()">Try Again</button>
        </div>
    `;
}
function renderStandingsTable(standings, type) {
    const container = document.getElementById("standings");
    if (!standings || !standings.length) {
        container.innerHTML = `<p class="no-data">No ${type} standings available</p>`;
        return;
    }

    const headers = type === 'driver' 
        ? ['Pos', 'Driver', 'Team', 'Points', 'Wins']
        : ['Pos', 'Team', 'Nationality', 'Points', 'Wins'];

    container.innerHTML = `
        <table class="standings-table">
            <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
            <tbody>
                ${standings.map(item => `
                    <tr>
                        <td>${item.position}</td>
                        ${type === 'driver' ? `
                            <td>${item.Driver.givenName} ${item.Driver.familyName}</td>
                            <td>${item.Constructors[0]?.name || 'N/A'}</td>
                        ` : `
                            <td>${item.Constructor.name}</td>
                            <td>${item.Constructor.nationality}</td>
                        `}
                        <td>${item.points}</td>
                        <td>${item.wins}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function initializeLapTimesChart() {
    console.log("Initializing lap times chart...");
    const ctx = document.getElementById('lapChart').getContext('2d');
    lapTimesChart = new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [] },
        options: {
            responsive: true,
            plugins: {
                title: { display: true, text: 'Lap Times Comparison' }
            },
            scales: {
                y: { reverse: true } // Faster times at top
            }
        }
    });
}

async function fetchLapTimes() {
    try {
        showLoading('lapChart', 'Loading lap times...');
        console.log("Fetching lap times...");
        
        const response = await fetch('/lap_times', {
            headers: {
                'Accept': 'application/json'
            }
        });
        
        console.log("Lap times response status:", response.status);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log("Lap times data received:", data);
        
        const race = data.MRData?.RaceTable?.Races?.[0];
        if (!race?.Laps) throw new Error("No lap times data available");
        
        renderLapTimesChart(race);
        updateTimestamp();
    } catch (error) {
        console.error('Lap times error:', error);
        showError('lapChart', `Failed to load lap times: ${error.message}`);
        setTimeout(fetchLapTimes, 5000);
    }
}

function renderLapTimesChart(raceData) {
    const laps = raceData.Laps;
    const datasets = [];
    const lapNumbers = laps.map(lap => lap.number);
    
    const drivers = {};
    laps.forEach((lap, index) => {
        lap.Timings?.forEach(timing => {
            const driverId = timing.driverId.toLowerCase();
            if (!drivers[driverId]) {
                drivers[driverId] = {
                    name: formatDriverName(timing.driverId),
                    times: Array(laps.length).fill(null),
                    color: getDriverColor(driverId)
                };
            }
            drivers[driverId].times[index] = convertToSeconds(timing.time);
        });
    });
    
    Object.values(drivers).forEach(driver => {
        if (driver.times.some(time => time !== null)) {
            datasets.push({
                label: driver.name,
                data: driver.times,
                borderColor: driver.color,
                backgroundColor: `${driver.color}80`,
                borderWidth: 2,
                fill: false
            });
        }
    });
    
    lapTimesChart.data.labels = lapNumbers;
    lapTimesChart.data.datasets = datasets;
    lapTimesChart.options.plugins.title.text = `Lap Times - ${raceData.raceName}`;
    lapTimesChart.update();
}

async function populateDriverDropdowns() {
    try {
        console.log("Populating driver dropdowns...");
        const response = await fetch('/standings?type=driver');
        
        if (!response.ok) {
            console.warn("Failed to fetch driver standings for dropdowns");
            return;
        }
        
        const data = await response.json();
        const standings = data.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings;
        
        if (!standings) {
            console.warn("No driver standings data for dropdowns");
            return;
        }
        
        const select1 = document.getElementById('driver1Select');
        const select2 = document.getElementById('driver2Select');
        
        select1.innerHTML = '<option value="">Select Driver 1</option>';
        select2.innerHTML = '<option value="">Select Driver 2</option>';
        
        standings.forEach(driver => {
            const option = document.createElement('option');
            option.value = driver.Driver.driverId;
            option.textContent = `${driver.Driver.givenName} ${driver.Driver.familyName}`;
            select1.appendChild(option.cloneNode(true));
            select2.appendChild(option);
        });
    } catch (error) {
        console.error('Dropdown population error:', error);
    }
}

async function fetchDriverComparison(driver1, driver2) {
    try {
        showLoading('comparisonContainer', 'Loading comparison data...');
        console.log(`Comparing ${driver1} vs ${driver2}`);
        
        const response = await fetch(`/driver_comparison/${driver1}/${driver2}`);
        
        console.log("Comparison response status:", response.status);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log("Comparison data received:", data);
        
        if (data.error) throw new Error(data.error);
        if (!data.races?.length) throw new Error('No common races found');
        
        renderDriverComparison(data);
    } catch (error) {
        console.error('Comparison error:', error);
        showComparisonError(error.message, driver1, driver2);
    }
}

function renderDriverComparison(data) {
    const container = document.getElementById('comparisonContainer');
    
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
                                <span class="driver-name">${data.driver1.name}</span>
                                <span class="driver-position">P${race.driver1.position} (${race.driver1.points} pts)</span>
                            </div>
                            <div class="driver-result">
                                <span class="driver-name">${data.driver2.name}</span>
                                <span class="driver-position">P${race.driver2.position} (${race.driver2.points} pts)</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
    
    renderComparisonChart(data);
}

function updateTimestamp() {
    document.getElementById('updateTime').textContent = new Date().toLocaleString();
}

function switchStandingsType(type) {
    currentStandingsType = type;
    document.querySelector('.standings-section .section-title').textContent = 
        `${type === 'driver' ? 'Driver' : 'Constructor'} Standings`;
    fetchStandings();
}

function formatDriverName(driverId) {
    return driverId.split('_').map(name => 
        name.charAt(0).toUpperCase() + name.slice(1)
    ).join(' ');
}

function getDriverColor(driverId) {
    const teamColors = {
        'max_verstappen': '#0600EF', 'sergio_perez': '#0600EF',
        'lewis_hamilton': '#00D2BE', 'george_russell': '#00D2BE',
        'charles_leclerc': '#DC0000', 'carlos_sainz': '#DC0000',
        'lando_norris': '#FF8700',
        'pierre_gasly': '#0090FF', 'esteban_ocon': '#0090FF',
        'fernando_alonso': '#006F62'
    };
    return teamColors[driverId.toLowerCase()] || '#777777';
}

function convertToSeconds(timeString) {
    const [minutes, seconds] = timeString.split(':').map(parseFloat);
    return minutes * 60 + seconds;
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric'
    });
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
                <p>${message}</p>
                <button class="retry-button" onclick="retryLoading('${elementId}')">
                    Retry
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
            <p class="error-message">${message}</p>
            <button class="retry-button" onclick="retryComparison()">
                Try Again
            </button>
        </div>
    `;
}

window.retryLoading = function(elementId) {
    if (elementId === 'standings') fetchStandings();
    else if (elementId === 'lapChart') fetchLapTimes();
    else if (elementId === 'comparisonContainer') compareDrivers();
};

window.retryComparison = function() {
    const driver1 = document.getElementById('driver1Select').value;
    const driver2 = document.getElementById('driver2Select').value;
    if (driver1 && driver2) fetchDriverComparison(driver1, driver2);
};

window.compareDrivers = function() {
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
    
    fetchDriverComparison(driver1, driver2);
};