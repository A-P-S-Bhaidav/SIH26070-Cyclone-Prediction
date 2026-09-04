import os
import pandas as pd
import numpy as np
import tropycal.tracks as tracks

def compute_imd_category(vmax):
    # TD(<34), CS(34-47), SCS(48-63), VSCS(64-89), ESCS(90-119), SuCS(>=120)
    if vmax < 34: return 0 # TD
    elif vmax <= 47: return 1 # CS
    elif vmax <= 63: return 2 # SCS
    elif vmax <= 89: return 3 # VSCS
    elif vmax <= 119: return 4 # ESCS
    else: return 5 # SuCS

def process_storm_data():
    os.makedirs('/Users/admin/Documents/Cyclone_Project/ml_pipeline/data', exist_ok=True)
    print("Loading IBTrACS dataset...")
    # Load IBTrACS
    dataset = tracks.TrackDataset(basin='north_indian', source='ibtracs', include_btk=False)
    
    storms_data = []
    
    print("Processing storms from 1990 to 2024...")
    # Iterate over all storms
    for storm_id in dataset.keys:
        year_str = storm_id[-4:]
        if not year_str.isdigit():
            continue
        year = int(year_str)
        if year < 1990 or year > 2024:
            continue
            
        try:
            storm = dataset.get_storm(storm_id)
            storm_name = storm.name
        except Exception:
            continue
            
        df = storm.to_dataframe()[['time', 'lat', 'lon', 'vmax', 'mslp']].copy()
        
        # Filter valid
        df = df.dropna(subset=['lat', 'lon', 'vmax'])
        if len(df) < 4:
            continue
            
        df['storm_id'] = storm_id
        df['storm_name'] = storm_name
        df['year'] = year
        df['month'] = [t.month for t in df['time']]
        
        # Sort by time
        df = df.sort_values('time').reset_index(drop=True)
        
        # Compute past changes and future targets
        df['vmax_t-6h'] = df['vmax'].shift(1)
        df['vmax_t-12h'] = df['vmax'].shift(2)
        df['mslp_t-6h'] = df['mslp'].shift(1)
        
        df['delta_lat'] = df['lat'] - df['lat'].shift(1)
        df['delta_lon'] = df['lon'] - df['lon'].shift(1)
        
        df['vmax_t+24h'] = df['vmax'].shift(-4) # assuming 6h intervals
        df['delta_vmax_24h'] = df['vmax_t+24h'] - df['vmax']
        df['ri_label'] = (df['delta_vmax_24h'] >= 30).astype(int)
        
        # Track displacement
        df['lat_t+6h'] = df['lat'].shift(-1)
        df['lon_t+6h'] = df['lon'].shift(-1)
        df['lat_t+12h'] = df['lat'].shift(-2)
        df['lon_t+12h'] = df['lon'].shift(-2)
        df['lat_t+24h'] = df['lat'].shift(-4)
        df['lon_t+24h'] = df['lon'].shift(-4)
        
        # IMD category
        df['imd_category'] = df['vmax'].apply(compute_imd_category)
        
        storms_data.append(df)
            
    if not storms_data:
        print("No data found!")
        return
        
    all_data = pd.concat(storms_data, ignore_index=True)
    out_file = '/Users/admin/Documents/Cyclone_Project/ml_pipeline/data/ibtracs_nio.csv'
    all_data.to_csv(out_file, index=False)
    
    print(f"Data saved to {out_file}")
    print(f"Total records: {len(all_data)}")
    print(f"RI events: {all_data['ri_label'].sum()}")
    print("Summary Stats:")
    print(all_data[['vmax', 'mslp', 'ri_label']].describe())

if __name__ == "__main__":
    process_storm_data()
