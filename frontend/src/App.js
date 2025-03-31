import React, { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
  const [buildingName, setBuildingName] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [building, setBuilding] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [locationHistory, setLocationHistory] = useState([]);
  const [checkResult, setCheckResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mapUrl, setMapUrl] = useState(null);
  const [watchId, setWatchId] = useState(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [locatingProgress, setLocatingProgress] = useState(0);
  const locatingTimer = useRef(null);
  
  // Maximum number of location history points to keep
  const MAX_HISTORY_POINTS = 10;
  
  // Backend API URL
  const API_URL = 'http://localhost:8000/api';

  // Start location progress bar
  const startLocatingProgress = () => {
    setLocatingProgress(0);
    locatingTimer.current = setInterval(() => {
      setLocatingProgress(prev => {
        if (prev >= 100) {
          clearInterval(locatingTimer.current);
          return 100;
        }
        return prev + 10;
      });
    }, 200);
  };

  // Stop location progress bar
  const stopLocatingProgress = () => {
    clearInterval(locatingTimer.current);
    setLocatingProgress(100);
  };

  // Get building information by name with enhanced search
  const searchBuilding = async () => {
    if (!buildingName.trim()) {
      setError('Please enter a building name');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/building`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          name: buildingName,
          city: city || undefined,
          country: country || undefined
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to find building');
      }

      const data = await response.json();
      setBuilding(data);
      setCheckResult(null);
      
      // Generate OpenStreetMap URL
      setMapUrl(`https://www.openstreetmap.org/#map=18/${data.lat}/${data.lng}`);
    } catch (err) {
      setError(err.message);
      setBuilding(null);
      setMapUrl(null);
    } finally {
      setLoading(false);
    }
  };

  // Get user's current geolocation (single snapshot)
  const getUserLocation = () => {
    setError(null);
    
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    setLoading(true);
    startLocatingProgress();
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const newLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: Date.now()
        };
        
        setUserLocation(newLocation);
        
        // Add to location history
        setLocationHistory(prev => {
          const updated = [...prev, newLocation];
          return updated.slice(-MAX_HISTORY_POINTS); // Keep only the latest points
        });
        
        setLoading(false);
        stopLocatingProgress();
      },
      (err) => {
        setError(`Error getting location: ${err.message}`);
        setLoading(false);
        stopLocatingProgress();
      },
      { 
        enableHighAccuracy: true, 
        timeout: 15000, 
        maximumAge: 0 
      }
    );
  };
  
  // Start continuous location monitoring
  const startLocationMonitoring = () => {
    if (watchId !== null) {
      return; // Already monitoring
    }
    
    setError(null);
    setIsMonitoring(true);
    
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      setIsMonitoring(false);
      return;
    }
    
    const id = navigator.geolocation.watchPosition(
      (position) => {
        const newLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: Date.now()
        };
        
        setUserLocation(newLocation);
        
        // Add to location history
        setLocationHistory(prev => {
          const updated = [...prev, newLocation];
          return updated.slice(-MAX_HISTORY_POINTS); // Keep only the latest points
        });
      },
      (err) => {
        setError(`Error monitoring location: ${err.message}`);
        stopLocationMonitoring();
      },
      { 
        enableHighAccuracy: true, 
        timeout: 15000, 
        maximumAge: 0 
      }
    );
    
    setWatchId(id);
  };
  
  // Stop continuous location monitoring
  const stopLocationMonitoring = () => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }
    setIsMonitoring(false);
  };

  // Check if user is within range of the building
  const checkLocation = async () => {
    if (!building || !userLocation) {
      setError('Building and user location are required');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/check-location`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          building_name: buildingName,
          city: city || undefined,
          country: country || undefined,
          user_location: userLocation,
          location_history: locationHistory.length >= 3 ? locationHistory.slice(-3) : undefined
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to check location');
      }

      const data = await response.json();
      setCheckResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Clean up geolocation watch on unmount
  useEffect(() => {
    getUserLocation(); // Get initial location
    
    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
      if (locatingTimer.current) {
        clearInterval(locatingTimer.current);
      }
    };
  }, []);

  // Get confidence level color
  const getConfidenceColor = (confidence) => {
    if (!confidence) return '#f44336';
    
    if (confidence.includes('Definitely inside')) return '#4caf50';
    if (confidence.includes('Likely inside')) return '#8bc34a';
    if (confidence.includes('uncertain')) return '#ffeb3b';
    if (confidence.includes('Likely outside')) return '#ff9800';
    return '#f44336'; // Default for "Definitely outside" or other
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>High-Precision Geofencing</h1>
        <p>Using OpenStreetMap (Open Source)</p>
      </header>
      
      <main className="App-main">
        <section className="search-section">
          <h2>Find Building</h2>
          <div className="form-group">
            <label htmlFor="buildingName">Building Name (required)</label>
            <input
              id="buildingName"
              type="text"
              value={buildingName}
              onChange={(e) => setBuildingName(e.target.value)}
              placeholder="Enter building name (e.g., Empire State Building)"
              disabled={loading}
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="city">City (optional but recommended)</label>
            <input
              id="city"
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Enter city for better results"
              disabled={loading}
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="country">Country (optional but recommended)</label>
            <input
              id="country"
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="Enter country for better results"
              disabled={loading}
            />
          </div>
          
          <button onClick={searchBuilding} disabled={loading} className="primary-button">
            {loading ? 'Searching...' : 'Search Building'}
          </button>
        </section>

        {building && (
          <section className="building-section">
            <h2>Building Information</h2>
            <div className="info-card">
              <h3>{building.name}</h3>
              <p>{building.formatted_address}</p>
              <p>Coordinates: {building.lat.toFixed(6)}, {building.lng.toFixed(6)}</p>
              {building.type && <p>Building type: {building.type}</p>}
              
              {mapUrl && (
                <div className="map-link">
                  <a href={mapUrl} target="_blank" rel="noopener noreferrer">
                    View on OpenStreetMap
                  </a>
                </div>
              )}
            </div>
          </section>
        )}

        <section className="location-section">
          <h2>Your Location</h2>
          <div className="location-options">
            <div className="option-card">
              <h3>One-time Location</h3>
              <p>Get your current position once with high accuracy</p>
              <button 
                onClick={getUserLocation} 
                disabled={loading}
                className={`option-button ${!isMonitoring ? 'active' : ''}`}
              >
                {loading && locatingProgress < 100 ? (
                  <div className="progress-container">
                    <div className="progress-bar" style={{ width: `${locatingProgress}%` }}></div>
                    <span>Getting location...</span>
                  </div>
                ) : 'Get My Location'}
              </button>
            </div>
            
            <div className="option-card">
              <h3>Continuous Monitoring</h3>
              <p>Track location changes in real-time</p>
              {!isMonitoring ? (
                <button 
                  onClick={startLocationMonitoring} 
                  className="option-button"
                >
                  Start Monitoring
                </button>
              ) : (
                <button 
                  onClick={stopLocationMonitoring} 
                  className="option-button active monitoring"
                >
                  Stop Monitoring
                </button>
              )}
            </div>
          </div>
          
          {userLocation && (
            <div className="info-card location-info">
              <div className="location-header">
                <h3>Current Position</h3>
                {isMonitoring && <span className="monitoring-badge">Live</span>}
              </div>
              
              <div className="location-details">
                <div className="location-detail">
                  <label>Latitude:</label>
                  <span>{userLocation.lat.toFixed(6)}</span>
                </div>
                <div className="location-detail">
                  <label>Longitude:</label>
                  <span>{userLocation.lng.toFixed(6)}</span>
                </div>
                <div className="location-detail">
                  <label>Accuracy:</label>
                  <div className="accuracy-meter">
                    <div 
                      className={`accuracy-indicator ${
                        userLocation.accuracy <= 10 ? 'high' : 
                        userLocation.accuracy <= 30 ? 'medium' : 'low'
                      }`}
                    ></div>
                    <span>±{userLocation.accuracy.toFixed(1)} meters</span>
                  </div>
                </div>
                {locationHistory.length > 1 && (
                  <div className="location-detail">
                    <label>Samples:</label>
                    <span>{locationHistory.length} location points</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {building && userLocation && (
          <section className="check-section">
            <button 
              onClick={checkLocation} 
              disabled={loading} 
              className="check-button"
            >
              {loading ? 'Checking...' : 'Check if I\'m at this location'}
            </button>
          </section>
        )}

        {checkResult && (
          <section className="result-section">
            <div 
              className="result-card" 
              style={{
                backgroundColor: getConfidenceColor(checkResult.confidence_level)
              }}
            >
              <div className="result-header">
                <h2>
                  {checkResult.is_within_range 
                    ? '✅ You are at this location!' 
                    : '❌ You are not at this location'}
                </h2>
                <span className="confidence-tag">
                  {checkResult.confidence_level}
                </span>
              </div>
              
              <div className="result-details">
                <div className="result-detail">
                  <strong>Distance:</strong> {checkResult.distance} meters 
                  {checkResult.is_within_range ? 
                    ` (within ${100 - checkResult.distance} meters of boundary)` : 
                    ` (${checkResult.distance - 100} meters beyond boundary)`
                  }
                </div>
                
                <div className="result-detail">
                  <strong>Location Quality:</strong> 
                  <span className={`quality-indicator ${
                    checkResult.location_quality.confidence === "High" ? "high" :
                    checkResult.location_quality.confidence === "Medium" ? "medium" : "low"
                  }`}>
                    {checkResult.location_quality.confidence} confidence
                  </span>
                </div>
                
                {checkResult.location_quality.accuracy !== "Unknown" && (
                  <div className="result-detail">
                    <strong>GPS Accuracy:</strong> ±{checkResult.location_quality.accuracy} meters
                  </div>
                )}
                
                {checkResult.location_quality.stability && (
                  <div className="result-detail">
                    <strong>Signal Stability:</strong> {checkResult.location_quality.stability}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {error && (
          <div className="error-message">
            <p>{error}</p>
          </div>
        )}
      </main>
      
      <footer className="App-footer">
        <p>Powered by OpenStreetMap data © OpenStreetMap contributors</p>
      </footer>
    </div>
  );
}

export default App;