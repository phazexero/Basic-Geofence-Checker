import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [buildingName, setBuildingName] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [building, setBuilding] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [checkResult, setCheckResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mapUrl, setMapUrl] = useState(null);

  // Backend API URL
  const API_URL = 'http://localhost:8000/api';

  // Get building information by name
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

  // Get user's current geolocation
  const getUserLocation = () => {
    setError(null);
    
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
        setLoading(false);
      },
      (err) => {
        setError(`Error getting location: ${err.message}`);
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
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
          user_lat: userLocation.lat,
          user_lng: userLocation.lng,
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

  // Effect to get user location when component mounts
  useEffect(() => {
    getUserLocation();
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Geofencing App</h1>
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
          {!userLocation ? (
            <button onClick={getUserLocation} disabled={loading}>
              {loading ? 'Getting Location...' : 'Get My Location'}
            </button>
          ) : (
            <div className="info-card">
              <p>Latitude: {userLocation.lat.toFixed(6)}</p>
              <p>Longitude: {userLocation.lng.toFixed(6)}</p>
              <p>Accuracy: ±{userLocation.accuracy.toFixed(1)} meters</p>
              <button onClick={getUserLocation} disabled={loading}>
                Refresh Location
              </button>
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
            <div className={`result-card ${checkResult.is_within_range ? 'success' : 'failure'}`}>
              <h2>
                {checkResult.is_within_range 
                  ? '✅ You are at this location!' 
                  : '❌ You are not at this location'}
              </h2>
              <p>Distance: {checkResult.distance} meters</p>
              <p>
                {checkResult.is_within_range 
                  ? 'You are within the 100 meter geofence.' 
                  : 'You are outside the 100 meter geofence.'}
              </p>
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