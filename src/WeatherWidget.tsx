// src/WeatherWidget.tsx
//
// Weather widget for Canton, Georgia (Cherokee County).
// Uses National Weather Service API (free, no key needed).
// Shows current conditions, forecast, and severe weather alerts.

import { useEffect, useState, useCallback } from 'react';

// Canton, GA coordinates
const LAT = 34.2370;
const LON = -84.4913;
const NWS_OFFICE = 'FFC';     // Atlanta NWS office
const NWS_GRID_X = 49;
const NWS_GRID_Y = 89;

interface CurrentConditions {
  temperature: number | null;
  feelsLike: number | null;
  description: string;
  humidity: number | null;
  windSpeed: number | null;
  windDirection: string;
  icon: string;
  station: string;
}

interface ForecastPeriod {
  name: string;
  temperature: number;
  tempUnit: string;
  windSpeed: string;
  windDirection: string;
  shortForecast: string;
  isDaytime: boolean;
}

interface WeatherAlert {
  id: string;
  event: string;
  severity: string;
  urgency: string;
  headline: string;
  description: string;
  onset: string;
  expires: string;
}

const ALERT_COLORS: Record<string, string> = {
  Extreme:  '#7f1d1d',
  Severe:   '#dc2626',
  Moderate: '#ea580c',
  Minor:    '#d97706',
  Unknown:  '#6b7280',
};

const ALERT_BG: Record<string, string> = {
  Extreme:  '#fee2e2',
  Severe:   '#fee2e2',
  Moderate: '#ffedd5',
  Minor:    '#fef9c3',
  Unknown:  '#f3f4f6',
};

function windDirArrow(dir: string): string {
  const map: Record<string, string> = {
    N: 'N', NNE: 'NNE', NE: 'NE', ENE: 'ENE',
    E: 'E', ESE: 'ESE', SE: 'SE', SSE: 'SSE',
    S: 'S', SSW: 'SSW', SW: 'SW', WSW: 'WSW',
    W: 'W', WNW: 'WNW', NW: 'NW', NNW: 'NNW',
  };
  return map[dir] ?? dir;
}

function fmtTemp(f: number | null): string {
  if (f === null) return '--';
  return `${Math.round(f)}F`;
}

function celsiusToF(c: number): number {
  return Math.round((c * 9 / 5) + 32);
}

function parseWind(raw: string | null): string {
  if (!raw) return '--';
  // NWS returns wind speed as "X km_h-1" or similar
  const match = raw.match(/(\d+(?:\.\d+)?)/);
  if (!match) return raw;
  const kmh = parseFloat(match[1]);
  const mph = Math.round(kmh * 0.621371);
  return `${mph} mph`;
}

function alertIcon(event: string): string {
  const e = event.toLowerCase();
  if (e.includes('tornado')) return '[TORNADO]';
  if (e.includes('hurricane') || e.includes('tropical')) return '[HURRICANE]';
  if (e.includes('flood')) return '[FLOOD]';
  if (e.includes('thunder') || e.includes('storm')) return '[STORM]';
  if (e.includes('hail')) return '[HAIL]';
  if (e.includes('snow') || e.includes('ice') || e.includes('winter')) return '[WINTER]';
  if (e.includes('wind')) return '[WIND]';
  if (e.includes('heat')) return '[HEAT]';
  if (e.includes('fog')) return '[FOG]';
  return '[ALERT]';
}

export default function WeatherWidget() {
  const [current, setCurrent] = useState<CurrentConditions | null>(null);
  const [forecast, setForecast] = useState<ForecastPeriod[]>([]);
  const [alerts, setAlerts] = useState<WeatherAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null);

  const fetchWeather = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Get current observations from nearest station
      const stationsRes = await fetch(
        `https://api.weather.gov/points/${LAT},${LON}/stations`,
        { headers: { 'User-Agent': 'KayleesHub/1.0 (greenboy22@github)' } }
      );
      if (!stationsRes.ok) throw new Error('Could not reach NWS API');
      const stationsData = await stationsRes.json();
      const stationId = stationsData.features?.[0]?.properties?.stationIdentifier ?? 'KRYY';

      const obsRes = await fetch(
        `https://api.weather.gov/stations/${stationId}/observations/latest`,
        { headers: { 'User-Agent': 'KayleesHub/1.0' } }
      );
      if (obsRes.ok) {
        const obsData = await obsRes.json();
        const props = obsData.properties ?? {};
        const tempC = props.temperature?.value ?? null;
        const tempF = tempC !== null ? celsiusToF(tempC) : null;
        const feelsC = props.heatIndex?.value ?? props.windChill?.value ?? null;
        const feelsF = feelsC !== null ? celsiusToF(feelsC) : null;
        const windMs = props.windSpeed?.value ?? null;
        const windMph = windMs !== null ? Math.round(windMs * 2.237) : null;
        const windDir = props.windDirection?.value ?? null;
        const compassDir = windDir !== null ? degToCompass(windDir) : '--';

        setCurrent({
          temperature: tempF,
          feelsLike: feelsF,
          description: props.textDescription ?? 'Unknown',
          humidity: props.relativeHumidity?.value !== undefined ? Math.round(props.relativeHumidity.value) : null,
          windSpeed: windMph,
          windDirection: compassDir,
          icon: props.icon ?? '',
          station: stationId,
        });
      }

      // 2. Get forecast
      const fcRes = await fetch(
        `https://api.weather.gov/gridpoints/${NWS_OFFICE}/${NWS_GRID_X},${NWS_GRID_Y}/forecast`,
        { headers: { 'User-Agent': 'KayleesHub/1.0' } }
      );
      if (fcRes.ok) {
        const fcData = await fcRes.json();
        const periods = fcData.properties?.periods?.slice(0, 8) ?? [];
        setForecast(periods.map((p: any) => ({
          name: p.name,
          temperature: p.temperature,
          tempUnit: p.temperatureUnit,
          windSpeed: p.windSpeed,
          windDirection: p.windDirection,
          shortForecast: p.shortForecast,
          isDaytime: p.isDaytime,
        })));
      }

      // 3. Get alerts for Cherokee County, GA
      const alertRes = await fetch(
        `https://api.weather.gov/alerts/active?area=GA&zone=GAZ016`,
        { headers: { 'User-Agent': 'KayleesHub/1.0' } }
      );
      if (alertRes.ok) {
        const alertData = await alertRes.json();
        const features = alertData.features ?? [];
        setAlerts(features.map((f: any) => ({
          id: f.id,
          event: f.properties.event,
          severity: f.properties.severity,
          urgency: f.properties.urgency,
          headline: f.properties.headline,
          description: f.properties.description,
          onset: f.properties.onset,
          expires: f.properties.expires,
        })));
      }

      setLastUpdated(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }));
    } catch (err: any) {
      setError('Could not load weather data. NWS may be temporarily unavailable.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWeather();
    // Refresh every 15 minutes
    const interval = setInterval(fetchWeather, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchWeather]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Weather</h1>
          <p>Canton, GA (Cherokee County) -- updates every 15 min{lastUpdated ? ` -- last updated ${lastUpdated}` : ''}</p>
        </div>
        <button className="btn ghost" onClick={fetchWeather} disabled={loading}>
          {loading ? 'Updating...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="brief-item" style={{ borderLeft: '4px solid var(--red)', marginBottom: 12, color: 'var(--red)' }}>
          {error}
        </div>
      )}

      {/* SEVERE WEATHER ALERTS */}
      {alerts.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          {alerts.map(alert => (
            <div
              key={alert.id}
              style={{
                background: ALERT_BG[alert.severity] ?? ALERT_BG.Unknown,
                border: `2px solid ${ALERT_COLORS[alert.severity] ?? ALERT_COLORS.Unknown}`,
                borderRadius: 10,
                padding: 14,
                marginBottom: 8,
                cursor: 'pointer',
              }}
              onClick={() => setExpandedAlert(expandedAlert === alert.id ? null : alert.id)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: ALERT_COLORS[alert.severity] ?? ALERT_COLORS.Unknown }}>
                  {alertIcon(alert.event)}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: ALERT_COLORS[alert.severity] ?? ALERT_COLORS.Unknown }}>
                    {alert.event} -- {alert.severity}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 2 }}>{alert.headline}</div>
                </div>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {expandedAlert === alert.id ? 'Less' : 'More'}
                </span>
              </div>
              {expandedAlert === alert.id && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${ALERT_COLORS[alert.severity]}44` }}>
                  <div style={{ fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--text)' }}>
                    {alert.description?.slice(0, 800)}{(alert.description?.length ?? 0) > 800 ? '...' : ''}
                  </div>
                  {alert.expires && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
                      Expires: {new Date(alert.expires).toLocaleString('en-US')}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* NO ALERTS */}
      {!loading && alerts.length === 0 && (
        <div className="brief-item" style={{ borderLeft: '4px solid var(--green)', marginBottom: 12 }}>
          <span style={{ color: 'var(--green)', fontWeight: 600 }}>No active weather alerts for Cherokee County</span>
        </div>
      )}

      {/* CURRENT CONDITIONS */}
      {current && (
        <section className="panel" style={{ marginBottom: 12 }}>
          <div className="panel-head">
            <h2>Current Conditions</h2>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Station: {current.station}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 42, fontWeight: 900, color: 'var(--purple)' }}>{fmtTemp(current.temperature)}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                {current.description}
              </div>
              {current.feelsLike !== null && (
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Feels like {fmtTemp(current.feelsLike)}</div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 }}>
              {current.humidity !== null && (
                <div style={{ fontSize: 13 }}>
                  <span style={{ color: 'var(--muted)', fontSize: 11 }}>Humidity</span><br />
                  <strong>{current.humidity}%</strong>
                </div>
              )}
              {current.windSpeed !== null && (
                <div style={{ fontSize: 13 }}>
                  <span style={{ color: 'var(--muted)', fontSize: 11 }}>Wind</span><br />
                  <strong>{current.windSpeed} mph {windDirArrow(current.windDirection)}</strong>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{
                width: 80, height: 80, borderRadius: '50%',
                background: 'var(--purple-bg)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 32,
              }}>
                {weatherEmoji(current.description)}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* FORECAST */}
      {forecast.length > 0 && (
        <section className="panel">
          <div className="panel-head"><h2>7-Day Forecast</h2></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {forecast.map((p, i) => (
              <div key={i} style={{
                padding: '10px 12px',
                borderRadius: 8,
                background: p.isDaytime ? 'var(--surface-1)' : 'var(--surface-2)',
                border: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{p.shortForecast}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      Wind: {p.windSpeed} {p.windDirection}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--purple)' }}>
                      {p.temperature}{p.tempUnit}
                    </div>
                    <div style={{ fontSize: 18 }}>{weatherEmoji(p.shortForecast)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {loading && !current && (
        <div style={{ color: 'var(--muted)', textAlign: 'center', padding: 40 }}>
          Loading weather data from National Weather Service...
        </div>
      )}
    </div>
  );
}

function degToCompass(deg: number): string {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

function weatherEmoji(desc: string): string {
  const d = desc.toLowerCase();
  if (d.includes('tornado')) return '🌪';
  if (d.includes('hurricane')) return '🌀';
  if (d.includes('thunder')) return '⛈';
  if (d.includes('hail')) return '🌧';
  if (d.includes('snow') || d.includes('blizzard')) return '❄';
  if (d.includes('ice') || d.includes('sleet') || d.includes('freezing')) return '🌨';
  if (d.includes('rain') || d.includes('shower') || d.includes('drizzle')) return '🌧';
  if (d.includes('fog') || d.includes('mist') || d.includes('haze')) return '🌫';
  if (d.includes('cloud') || d.includes('overcast')) return '☁';
  if (d.includes('partly')) return '⛅';
  if (d.includes('sun') || d.includes('clear') || d.includes('fair') || d.includes('sunny')) return '☀';
  if (d.includes('wind')) return '💨';
  if (d.includes('hot')) return '🌡';
  return '🌤';
}
