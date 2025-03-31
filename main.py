from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
import math
import os
from typing import Optional

# Initialize FastAPI app
app = FastAPI(title="Geofencing API")

# Add CORS middleware to allow frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class BuildingRequest(BaseModel):
    name: str
    city: Optional[str] = None
    country: Optional[str] = None

class LocationCheckRequest(BaseModel):
    building_name: str
    city: Optional[str] = None
    country: Optional[str] = None
    user_lat: float
    user_lng: float

class BuildingResponse(BaseModel):
    name: str
    lat: float
    lng: float
    formatted_address: str

class LocationCheckResponse(BaseModel):
    is_within_range: bool
    distance: float
    building: BuildingResponse

def haversine_distance(lat1, lon1, lat2, lon2):
    """
    Calculate the great circle distance between two points 
    on the earth (specified in decimal degrees)
    """
    # Convert decimal degrees to radians
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    
    # Haversine formula
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))
    r = 6371000  # Radius of earth in meters
    return c * r

def get_building_location(name, city=None, country=None):
    """Get the coordinates of a building using OpenStreetMap's Nominatim"""
    
    # Build search query
    query = name
    if city:
        query += f", {city}"
    if country:
        query += f", {country}"
    
    # Set custom user agent to respect Nominatim usage policy
    headers = {
        "User-Agent": "GeofencingApp/1.0"
    }
    
    # Use OSM Nominatim API for geocoding
    url = "https://nominatim.openstreetmap.org/search"
    params = {
        "q": query,
        "format": "json",
        "limit": 1,
        "addressdetails": 1
    }
    
    response = requests.get(url, params=params, headers=headers)
    
    if response.status_code != 200:
        raise HTTPException(status_code=500, detail="Error communicating with geocoding service")
    
    data = response.json()
    
    if not data:
        raise HTTPException(status_code=404, detail=f"Location '{query}' not found")
    
    place = data[0]
    
    # Format address from address components
    address_parts = []
    if "address" in place:
        address = place["address"]
        for key in ["road", "house_number", "suburb", "city", "state", "country"]:
            if key in address:
                address_parts.append(address[key])
    
    formatted_address = ", ".join(address_parts) if address_parts else place.get("display_name", "")
    
    return {
        "name": name,
        "lat": float(place["lat"]),
        "lng": float(place["lon"]),
        "formatted_address": formatted_address
    }

@app.post("/api/building", response_model=BuildingResponse)
async def get_building(request: BuildingRequest):
    """Get the location details of a building by name"""
    try:
        building = get_building_location(request.name, request.city, request.country)
        return building
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/check-location", response_model=LocationCheckResponse)
async def check_location(request: LocationCheckRequest):
    """
    Check if a user is within 100 meters of the specified building
    """
    try:
        # Get building location
        building = get_building_location(request.building_name, request.city, request.country)
        
        # Calculate distance between user and building
        distance = haversine_distance(
            request.user_lat, request.user_lng,
            building["lat"], building["lng"]
        )
        
        # Check if within range (100 meters)
        is_within_range = distance <= 100
        
        return {
            "is_within_range": is_within_range,
            "distance": round(distance, 2),
            "building": building
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)