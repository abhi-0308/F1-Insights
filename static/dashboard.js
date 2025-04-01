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
    
    // Add rows
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
        
        // Add driver options
        standings.forEach(driver => {
            const option = document.createElement('option');
            option.value = driver.Driver.driverId;
            option.textContent = `${driver.Driver.givenName} ${driver.Driver.familyName}`;
            select1.appendChild(option.cloneNode(true));
            select2.appendChild(option);
        });
    } catch (error) {
        console.error('Dropdown population error:', error);
        
        // Fallback options
        const fallbackDrivers = [
            { id: 'max_verstappen', name: 'Max Verstappen' },
            { id: 'lewis_hamilton', name: 'Lewis Hamilton' },
            { id: 'charles_leclerc', name: 'Charles Leclerc' }
        ];
        
        const select1 = document.getElementById('driver1Select');
        const select2 = document.getElementById('driver2Select');
        
        // Add fallback drivers
        fallbackDrivers.forEach(driver => {
            const option = document.createElement('option');
            option.value = driver.id;
            option.textContent = driver.name;
            select1.appendChild(option.cloneNode(true));
            select2.appendChild(option);
        });
    }
}

function showLoading(containerId, message) {
    const container = document.getElementById(containerId);
    container.innerHTML = `<div class="loading"><i class="fas fa-spinner fa-spin"></i> ${message}</div>`;
}

function showError(containerId, message) {
    const container = document.getElementById(containerId);
    container.innerHTML = `<div class="error">${message}</div>`;
}

function switchStandingsType(type) {
    currentStandingsType = type;
    document.getElementById('driverStandingsBtn').classList.toggle('active', type === 'driver');
    document.getElementById('constructorStandingsBtn').classList.toggle('active', type === 'constructor');
    fetchStandings();
}

function updateTimestamp() {
    const updateTimeElement = document.getElementById('updateTime');
    if (updateTimeElement) {
        updateTimeElement.innerHTML = new Date().toLocaleString();
    } else {
        console.error('updateTime element not found!');
    }
}


function getResultClass(driver1Position, driver2Position) {
    if (driver1Position < driver2Position) return 'win';
    if (driver1Position > driver2Position) return 'loss';
    return 'draw';
}
