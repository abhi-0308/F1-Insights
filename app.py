from flask import Flask, jsonify, request, render_template
import requests
import json
from datetime import datetime
from flask_cors import CORS
import time
import logging
import os

app = Flask(__name__)

# Configure CORS
CORS(app, resources={
    r"/*": {
        "origins": "*",
        "methods": ["GET", "OPTIONS"],
        "allow_headers": ["Content-Type", "Accept"]
    }
})

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Constants
CURRENT_YEAR = 2024
PREVIOUS_YEAR = CURRENT_YEAR - 1
ERGAST_API_BASE = "https://ergast.com/api/f1"
CACHE_EXPIRY = 300  # 5 minutes
REQUEST_TIMEOUT = 20

# Cache storage
cache = {}

@app.route('/')
def home():
    return render_template("index.html")

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

def get_ergast_data(endpoint, year=None):
    """Fetch data from Ergast API with proper URL construction"""
    base_url = ERGAST_API_BASE
    if year:
        base_url = f"{ERGAST_API_BASE}/{year}"
    
    url = f"{base_url}/{endpoint}.json".replace("//", "/")  # Remove duplicate slashes
    cache_key = f"{year}_{endpoint}" if year else endpoint
    
    try:
        # Check cache first
        cached_data = get_cached_data(cache_key)
        if cached_data:
            return cached_data
            
        response = requests.get(url, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
        data = response.json()
        
        # Cache the response
        return cache_response(cache_key, data)
    except requests.exceptions.RequestException as e:
        logger.error(f"API Error ({url}): {str(e)}")
        return None

@app.route('/standings', methods=['GET'])
def get_standings():
    standings_type = request.args.get('type', 'driver')
    try:
        # Try multiple years in order
        for year in [CURRENT_YEAR, PREVIOUS_YEAR, CURRENT_YEAR-2]:
            data = get_ergast_data(f"{standings_type}Standings", year)
            
            if data and data.get('MRData', {}).get('StandingsTable', {}).get('StandingsLists'):
                standings = data['MRData']['StandingsTable']['StandingsLists'][0]
                results = standings.get(f"{standings_type.title()}Standings", [])
                
                if results:
                    # Return ALL drivers (not just the first one)
                    return jsonify({
                        "status": "success",
                        "data": {
                            "standings": results,  # This now contains all drivers
                            "season": standings['season'],
                            "round": standings.get('round', 'N/A')
                        }
                    })

        return jsonify({
            "status": "success",
            "data": {
                "standings": [],
                "season": CURRENT_YEAR,
                "message": "No standings data available for recent seasons"
            }
        }), 200
    except Exception as e:
        logger.error(f"Standings error: {str(e)}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@app.route('/lap_times', methods=['GET'])
def get_lap_times():
    """Get lap times for multiple drivers from last race"""
    try:
        # Try seasons in reverse chronological order
        for year in [2023, 2022]:  # Only use years with known complete data
            # Get the last race results first
            race_data = get_ergast_data("last/results", year)
            
            if not race_data or not race_data['MRData']['RaceTable']['Races']:
                continue
                
            race = race_data['MRData']['RaceTable']['Races'][0]
            season = race['season']
            race_id = race['round']
            
            # Get top 5 drivers
            top_drivers = [result['Driver']['driverId'] for result in race['Results'][:5]]
            lap_data = {}
            
            for driver_id in top_drivers:
                try:
                    # Correct URL format: /api/f1/{season}/{round}/drivers/{id}/laps.json
                    endpoint = f"{race_id}/drivers/{driver_id}/laps"
                    driver_laps = get_ergast_data(endpoint, season)  # Pass season as year parameter
                    
                    if driver_laps and driver_laps['MRData']['RaceTable']['Races']:
                        laps = driver_laps['MRData']['RaceTable']['Races'][0].get('Laps', [])
                        if laps:
                            lap_data[driver_id] = [{
                                'lap': int(lap['number']),
                                'time': convert_time_to_seconds(lap['Timings'][0]['time']),
                                'position': int(lap['Timings'][0]['position'])
                            } for lap in laps if 'Timings' in lap and len(lap['Timings']) > 0]
                except Exception as e:
                    logger.warning(f"Failed to get laps for {driver_id}: {str(e)}")
                    continue

            if lap_data:
                return jsonify({
                    'race': {
                        'name': race['raceName'],
                        'round': race_id,
                        'season': season,
                        'date': race['date'],
                        'circuit': race['Circuit']['circuitName']
                    },
                    'laps': {
                        'labels': [f"Lap {i+1}" for i in range(len(next(iter(lap_data.values()))))],
                        'drivers': [
                            {
                                'id': driver_id,
                                'name': get_driver_info(driver_id)['name'],
                                'color': get_driver_info(driver_id)['color'],
                                'times': [lap['time'] for lap in laps],
                                'positions': [lap['position'] for lap in laps]
                            }
                            for driver_id, laps in lap_data.items()
                        ]
                    }
                })
        
        return jsonify({
            "error": "No lap time data available",
            "available_seasons": [2023, 2022],
            "note": "Ergast API has limited lap time data. Try specific race endpoints."
        }), 404

    except Exception as e:
        logger.error(f"Lap times error: {str(e)}")
        return jsonify({
            "error": str(e),
            "message": "Failed to fetch lap times"
        }), 500
    
def convert_time_to_seconds(time_str):
    """Convert lap time string (1:23.456) to seconds (83.456)"""
    try:
        if ':' in time_str:
            minutes, rest = time_str.split(':')
            seconds = float(rest)
            return int(minutes) * 60 + seconds
        return float(time_str)
    except:
        return 0.0

@app.route('/driver_comparison/<driver1>/<driver2>', methods=['GET'])
def get_driver_comparison(driver1, driver2):
    """Compare two drivers with enhanced response structure"""
    try:
        logger.info(f"Comparing drivers {driver1} vs {driver2}")
        
        current_data = compare_drivers_in_season(driver1, driver2, CURRENT_YEAR)
        if current_data and current_data['races']:
            return jsonify({
                "status": "success",
                "data": current_data
            })
        
        previous_data = compare_drivers_in_season(driver1, driver2, PREVIOUS_YEAR)
        if previous_data and previous_data['races']:
            return jsonify({
                "status": "success",
                "data": previous_data
            })
            
        return jsonify({
            "status": "success",
            "data": {
                "driver1": get_driver_info(driver1),
                "driver2": get_driver_info(driver2),
                "races": [],
                "message": "No common races found for these drivers"
            }
        })
        
    except Exception as e:
        logger.error(f"Comparison error: {str(e)}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

def compare_drivers_in_season(driver1, driver2, year):
    """Compare drivers in a specific season with better data validation"""
    driver1_data = get_ergast_data(f"drivers/{driver1}/results", year)
    driver2_data = get_ergast_data(f"drivers/{driver2}/results", year)
    
    if not driver1_data or not driver2_data:
        return None
    
    driver1_races = {}
    for race in driver1_data['MRData']['RaceTable'].get('Races', []):
        try:
            driver1_races[race['raceName']] = race
        except KeyError:
            continue
    
    driver2_races = {}
    for race in driver2_data['MRData']['RaceTable'].get('Races', []):
        try:
            driver2_races[race['raceName']] = race
        except KeyError:
            continue
    
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
        except (KeyError, IndexError) as e:
            logger.warning(f"Skipping race {race_name} due to error: {str(e)}")
            continue
    
    if not common_races:
        return None
    
    return {
        'driver1': get_driver_info(driver1),
        'driver2': get_driver_info(driver2),
        'races': sorted(common_races, key=lambda x: x['date'], reverse=True),
        'season': year
    }

def get_driver_info(driver_id):
    """Get standardized driver information with team colors"""
    team_colors = {
        'red_bull': '#0600EF',
        'mercedes': '#00D2BE',
        'ferrari': '#DC0000',
        'mclaren': '#FF8700',
        'alpine': '#0090FF',
        'aston_martin': '#006F62',
        'haas': '#FFFFFF',
        'alfa': '#900000',
        'alphatauri': '#2B4562',
        'williams': '#005AFF'
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
        'fernando_alonso': 'aston_martin',
        'kevin_magnussen': 'haas',
        'valtteri_bottas': 'alfa',
        'yuki_tsunoda': 'alphatauri',
        'alexander_albon': 'williams'
    }
    
    return {
        'id': driver_id,
        'name': driver_id.replace('_', ' ').title(),
        'team': driver_teams.get(driver_id, 'unknown'),
        'color': team_colors.get(driver_teams.get(driver_id, ''), '#777777')
    }

def process_driver_result(result):
    """Process a driver's race result with better error handling"""
    try:
        return {
            'position': result.get('position', 'N/A'),
            'points': float(result.get('points', 0)),
            'status': result.get('status', ''),
            'grid': result.get('grid', 'N/A'),
            'laps': result.get('laps', 'N/A')
        }
    except Exception as e:
        logger.warning(f"Error processing driver result: {str(e)}")
        return {
            'position': 'N/A',
            'points': 0,
            'status': 'N/A',
            'grid': 'N/A',
            'laps': 'N/A'
        }

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)