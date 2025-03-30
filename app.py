from flask import Flask, jsonify, request, render_template
import requests
from datetime import datetime
from flask_cors import CORS
import time
import logging

app = Flask(__name__)

CORS(app, resources={
    r"/*": {
        "origins": "*",
        "methods": ["GET", "OPTIONS"],
        "allow_headers": ["Content-Type", "Accept"]
    }
})

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.route('/')
def home():
    return render_template("index.html")

CURRENT_YEAR = datetime.now().year
PREVIOUS_YEAR = CURRENT_YEAR - 1
ERGAST_API_BASE = "https://ergast.com/api/f1"
CACHE_EXPIRY = 300 
REQUEST_TIMEOUT = 20  

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
    """Fetch data from Ergast API with enhanced error handling"""
    url = f"{ERGAST_API_BASE}/{year}/{endpoint}.json"
    cached = get_cached_data(url)
    if cached:
        logger.info(f"Returning cached data for {url}")
        return cached
    
    try:
        logger.info(f"Fetching from Ergast API: {url}")
        response = requests.get(url, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
        data = response.json()
        
        if not data.get('MRData'):
            raise ValueError("Invalid API response structure")
            
        return cache_response(url, data)
    except requests.exceptions.RequestException as e:
        logger.error(f"API request failed: {str(e)}")
        return None
    except ValueError as e:
        logger.error(f"Data validation failed: {str(e)}")
        return None

@app.route('/standings', methods=['GET'])
def get_standings():
    """Get current driver or constructor standings with better error handling"""
    standings_type = request.args.get('type', 'driver')
    logger.info(f"Fetching {standings_type} standings")
    
    try:
        if standings_type == 'driver':
            data = get_ergast_data("driverStandings")
            if not data or not data['MRData']['StandingsTable']['StandingsLists']:
                logger.info("No current driver standings, trying previous year")
                data = get_ergast_data("driverStandings", PREVIOUS_YEAR)
        else:
            data = get_ergast_data("constructorStandings")
            if not data or not data['MRData']['StandingsTable']['StandingsLists']:
                logger.info("No current constructor standings, trying previous year")
                data = get_ergast_data("constructorStandings", PREVIOUS_YEAR)
        
        if not data:
            raise Exception("Failed to fetch standings data from both current and previous year")
            
        standings_list = data['MRData']['StandingsTable']['StandingsLists'][0]
        if standings_type == 'driver':
            results = standings_list['DriverStandings']
        else:
            results = standings_list['ConstructorStandings']
            
        return jsonify({
            "status": "success",
            "data": {
                "standings": results,
                "season": standings_list['season'],
                "type": standings_type
            }
        })
    except Exception as e:
        logger.error(f"Standings error: {str(e)}")
        return jsonify({
            "status": "error",
            "message": str(e),
            "type": standings_type
        }), 500

@app.route('/lap_times', methods=['GET'])
def get_lap_times():
    """Get lap times from last race with enhanced response"""
    try:
        logger.info("Fetching lap times")
        data = get_ergast_data("last/laps")
        if not data or not data['MRData']['RaceTable']['Races']:
            logger.info("No current lap times, trying previous year")
            data = get_ergast_data("last/laps", PREVIOUS_YEAR)
        
        if not data:
            raise Exception("No lap times data available")
            
        race = data['MRData']['RaceTable']['Races'][0]
        
        processed_laps = []
        for lap in race.get('Laps', []):
            processed_lap = {
                "number": lap['number'],
                "timings": []
            }
            for timing in lap.get('Timings', []):
                processed_lap['timings'].append({
                    "driverId": timing['driverId'],
                    "position": timing['position'],
                    "time": timing['time']
                })
            processed_laps.append(processed_lap)
            
        return jsonify({
            "status": "success",
            "data": {
                "raceName": race['raceName'],
                "date": race['date'],
                "circuit": race['Circuit']['circuitName'],
                "laps": processed_laps
            }
        })
    except Exception as e:
        logger.error(f"Lap times error: {str(e)}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

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
            "status": "error",
            "message": "No common races found for these drivers",
            "data": {
                "driver1": get_driver_info(driver1),
                "driver2": get_driver_info(driver2)
            }
        }), 404
        
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
    """Get standardized driver information with more drivers"""
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
    app.run(debug=False)  