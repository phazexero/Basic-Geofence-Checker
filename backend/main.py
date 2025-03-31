from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import requests
import math
import os
import time
from typing import Optional, Dict, Any, List
from statistics import mean

# Initialize FastAPI app
app = FastAPI(title="High-Precision Geofencing API")

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

class LocationPoint(BaseModel):
    lat: float = Field(..., description="Latitude in decimal degrees")
    lng: float = Field(..., description="Longitude in decimal degrees")
    accuracy: Optional[float] = Field(None, description="Accuracy in meters")
    timestamp: Optional[int] = Field(None, description="Timestamp of the reading")

class LocationCheckRequest(BaseModel):
    building_name: str
    city: Optional[str] = None
    country: Optional[str] = None
    user_location: LocationPoint
    location_history: Optional[List[LocationPoint]] = Field(None, description="Historical location points for improved accuracy")

class BuildingDetails(BaseModel):
    name: str
    lat: float
    lng: float
    formatted_address: str
    type: Optional[str] = None
    osm_id: Optional[str] = None
    osm_type: Optional[str] = None

class LocationCheckResponse(BaseModel):
    is_within_range: bool
    distance: float
    confidence_level: str
    building: BuildingDetails
    location_quality: Dict[str, Any]

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
    """Get the coordinates of a building using OpenStreetMap's Nominatim with enhanced details"""
    
    # Build search query with specific building-related tags
    query = name
    if city:
        query += f", {city}"
    if country:
        query += f", {country}"
    
    # Set custom user agent to respect Nominatim usage policy
    headers = {
        "User-Agent": "GeofencingApp/1.0"
    }
    
    # Use OSM Nominatim API for geocoding with additional parameters
    url = "https://nominatim.openstreetmap.org/search"
    params = {
        "q": query,
        "format": "json",
        "limit": 5,  # Get top 5 results to find buildings
        "addressdetails": 1,
        "extratags": 1,  # Get additional tags like building type
        "namedetails": 1
    }
    
    response = requests.get(url, params=params, headers=headers)
    
    if response.status_code != 200:
        raise HTTPException(status_code=500, detail="Error communicating with geocoding service")
    
    data = response.json()
    
    if not data:
        raise HTTPException(status_code=404, detail=f"Location '{query}' not found")
    
    # Try to find a building in the results
    building_result = None
    for place in data:
        # Prioritize results that are buildings
        if place.get("class") == "building" or "building" in place.get("type", ""):
            building_result = place
            break
    
    # If no specific building found, use the first result
    place = building_result if building_result else data[0]
    
    # Format address from address components
    address_parts = []
    if "address" in place:
        address = place["address"]
        for key in ["house_number", "road", "suburb", "city", "town", "state", "country"]:
            if key in address:
                address_parts.append(address[key])
    
    formatted_address = ", ".join(address_parts) if address_parts else place.get("display_name", "")
    
    # Extract building type if available
    building_type = None
    if "extratags" in place:
        building_type = place["extratags"].get("building")
    
    return {
        "name": name,
        "lat": float(place["lat"]),
        "lng": float(place["lon"]),
        "formatted_address": formatted_address,
        "type": building_type,
        "osm_id": place.get("osm_id"),
        "osm_type": place.get("osm_type")
    }

def assess_location_quality(current_location, location_history=None):
    """
    Assess the quality and reliability of the location data
    """
    quality = {
        "accuracy": current_location.accuracy if current_location.accuracy else "Unknown",
        "confidence": "Low"
    }
    
    if not current_location.accuracy:
        return quality
    
    # Basic assessment based on reported accuracy
    if current_location.accuracy <= 10:
        quality["confidence"] = "High"
    elif current_location.accuracy <= 30:
        quality["confidence"] = "Medium"
    else:
        quality["confidence"] = "Low"
    
    # Enhanced assessment with history if available
    if location_history and len(location_history) >= 3:
        # Calculate location stability
        recent_points = location_history[-3:]
        lat_variance = variance([p.lat for p in recent_points])
        lng_variance = variance([p.lng for p in recent_points])
        
        # Low variance indicates stable readings
        if lat_variance < 0.0000001 and lng_variance < 0.0000001:
            quality["stability"] = "High"
            # Boost confidence if readings are stable
            if quality["confidence"] == "Medium":
                quality["confidence"] = "High"
        else:
            quality["stability"] = "Low"
            
        # Include average accuracy from recent readings
        accuracy_values = [p.accuracy for p in recent_points if p.accuracy]
        if accuracy_values:
            quality["average_accuracy"] = mean(accuracy_values)
    
    return quality

def variance(data):
    """Calculate the variance of a list of numbers"""
    if not data or len(data) < 2:
        return 0
    mean_val = mean(data)
    return sum((x - mean_val) ** 2 for x in data) / len(data)

def get_confidence_level(distance, threshold=100, quality=None):
    """
    Determine the confidence level of the geofencing result based on distance and accuracy
    """
    if quality and quality.get("accuracy") and quality["accuracy"] != "Unknown":
        accuracy = float(quality["accuracy"])
        
        # If accuracy radius overlaps with the geofence boundary
        distance_diff = abs(distance - threshold)
        
        if distance <= threshold:
            # Inside the boundary
            if distance + accuracy > threshold:
                return "Likely inside, but uncertain"
            else:
                return "Definitely inside"
        else:
            # Outside the boundary
            if distance - accuracy < threshold:
                return "Likely outside, but uncertain"
            else:
                return "Definitely outside"
    
    # Fallback without accuracy information
    return "Inside" if distance <= threshold else "Outside"

@app.post("/api/building", response_model=BuildingDetails)
async def get_building(request: BuildingRequest):
    """Get the location details of a building by name with enhanced precision"""
    try:
        # Add a small delay to respect Nominatim usage policy
        time.sleep(1)
        building = get_building_location(request.name, request.city, request.country)
        return building
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/check-location", response_model=LocationCheckResponse)
async def check_location(request: LocationCheckRequest):
    """
    Check if a user is within 100 meters of the specified building with high precision
    """
    try:
        # Get building location
        building = get_building_location(request.building_name, request.city, request.country)
        
        # Calculate distance between user and building
        distance = haversine_distance(
            request.user_location.lat, request.user_location.lng,
            building["lat"], building["lng"]
        )
        
        # Assess location quality for confidence calculation
        location_quality = assess_location_quality(
            request.user_location, 
            request.location_history
        )
        
        # Check if within range (100 meters)
        is_within_range = distance <= 100
        
        # Get confidence level based on distance and accuracy
        confidence_level = get_confidence_level(distance, 100, location_quality)
        
        return {
            "is_within_range": is_within_range,
            "distance": round(distance, 2),
            "confidence_level": confidence_level,
            "building": building,
            "location_quality": location_quality
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)