from flask import Flask, jsonify, request, render_template
import requests
from datetime import datetime
from flask_cors import CORS
import time

app = Flask(__name__)
CORS(app, resources={
    r"/*": {
        "origins": "*",  # Allow all origins for now (tighten this later)
        "methods": ["GET", "OPTIONS"],
        "allow_headers": ["Content-Type"]
    }
})
@app.route('/')
def home():
    return render_template("index.html")

# Configuration
CURRENT_YEAR = datetime.now().year
PREVIOUS_YEAR = CURRENT_YEAR - 1
ERGAST_API_BASE = "https://ergast.com/api/f1"  # Fixed typo
CACHE_EXPIRY = 300  # 5 minutes in seconds

# Caching setup
cache = {}

def get_cached_data(key):
    """Check cache for existing data"""
    if key in cache and (time.time() - cache[key]['timestamp']) < CACHE_EXPIRY:
        return cache[key]['data']
    return None

def cache_response(key, data):
    """Store data in cache"""
    cache[key] = {
        'data': data,
        'timestamp': time.time()
    }
    return data

def get_ergast_data(endpoint, year=CURRENT_YEAR):
    """Fetch data from Ergast API with caching"""
    url = f"{ERGAST_API_BASE}/{year}/{endpoint}.json"
    cached = get_cached_data(url)
    if cached:
        return cached
    
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()
        return cache_response(url, data)
    except requests.exceptions.RequestException as e:
        print(f"API request failed: {str(e)}")
        return None

@app.route('/standings', methods=['GET'])
def get_standings():
    """Get current driver or constructor standings"""
    standings_type = request.args.get('type', 'driver')
    
    try:
        if standings_type == 'driver':
            data = get_ergast_data("driverStandings")
            if not data or not data['MRData']['StandingsTable']['StandingsLists']:
                data = get_ergast_data("driverStandings", PREVIOUS_YEAR)
        else:
            data = get_ergast_data("constructorStandings")
            if not data or not data['MRData']['StandingsTable']['StandingsLists']:
                data = get_ergast_data("constructorStandings", PREVIOUS_YEAR)
        
        if not data:
            raise Exception("Failed to fetch standings data")
            
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/lap_times', methods=['GET'])
def get_lap_times():
    """Get lap times from last race"""
    try:
        data = get_ergast_data("last/laps")
        if not data or not data['MRData']['RaceTable']['Races']:
            data = get_ergast_data("last/laps", PREVIOUS_YEAR)
        
        if not data:
            raise Exception("Failed to fetch lap times data")
            
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/driver_comparison/<driver1>/<driver2>', methods=['GET'])
def get_driver_comparison(driver1, driver2):
    try:
        # First try current season
        current_data = compare_drivers_in_season(driver1, driver2, CURRENT_YEAR)
        if current_data and current_data['races']:
            return jsonify(current_data)
        
        # Fallback to previous season
        previous_data = compare_drivers_in_season(driver1, driver2, PREVIOUS_YEAR)
        if previous_data and previous_data['races']:
            return jsonify(previous_data)
            
        return jsonify({
            "error": "No common races found for these drivers",
            "driver1": get_driver_info(driver1),
            "driver2": get_driver_info(driver2)
        }), 404
        
    except Exception as e:
        return jsonify({"error": f"Comparison failed: {str(e)}"}), 500

def compare_drivers_in_season(driver1, driver2, year):
    """Compare drivers in a specific season"""
    driver1_data = get_ergast_data(f"drivers/{driver1}/results", year)
    driver2_data = get_ergast_data(f"drivers/{driver2}/results", year)
    
    if not driver1_data or not driver2_data:
        return None
    
    # Create mappings of races for each driver
    driver1_races = {race['raceName']: race for race in driver1_data['MRData']['RaceTable']['Races']}
    driver2_races = {race['raceName']: race for race in driver2_data['MRData']['RaceTable']['Races']}
    
    # Find common races
    common_races = []
    for race_name in set(driver1_races.keys()) & set(driver2_races.keys()):
        try:
            race1 = driver1_races[race_name]
            race2 = driver2_races[race_name]
            
            common_races.append({
                'name': race_name,
                'date': race1['date'],
                'circuit': race1['Circuit']['circuitName'],
                'driver1': process_driver_result(race1['Results'][0]),
                'driver2': process_driver_result(race2['Results'][0])
            })
        except (KeyError, IndexError):
            continue
    
    return {
        'driver1': get_driver_info(driver1),
        'driver2': get_driver_info(driver2),
        'races': sorted(common_races, key=lambda x: x['date'], reverse=True),
        'season': year
    }

def get_driver_info(driver_id):
    """Get standardized driver information"""
    team_colors = {
        'red_bull': '#0600EF',
        'mercedes': '#00D2BE',
        'ferrari': '#DC0000',
        'mclaren': '#FF8700',
        'alpine': '#0090FF',
        'aston_martin': '#006F62'
    }
    
    driver_teams = {
        'max_verstappen': 'red_bull',
        'sergio_perez': 'red_bull',
        'lewis_hamilton': 'mercedes',
        'george_russell': 'mercedes',
        'charles_leclerc': 'ferrari',
        'carlos_sainz': 'ferrari',
        'lando_norris': 'mclaren',
        'pierre_gasly': 'alpine',
        'esteban_ocon': 'alpine',
        'fernando_alonso': 'aston_martin'
    }
    
    return {
        'id': driver_id,
        'name': driver_id.replace('_', ' ').title(),
        'team': driver_teams.get(driver_id, 'unknown'),
        'color': team_colors.get(driver_teams.get(driver_id, ''), '#777777')
    }

def process_driver_result(result):
    """Process a driver's race result"""
    return {
        'position': result['position'],
        'points': float(result['points']),
        'status': result['status']
    }

if __name__ == '__main__':
    app.run(debug=True, port=5000, host='0.0.0.0')