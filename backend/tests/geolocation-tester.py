import gps

def get_gps_location():
    session = gps.gps(mode=gps.WATCH_ENABLE)
    while True:
        report = session.next()
        if report['class'] == 'TPV':  # Time Position Velocity class
            latitude = getattr(report, 'lat', None)
            longitude = getattr(report, 'lon', None)
            if latitude and longitude:
                return latitude, longitude

print(get_gps_location())
