'use strict';

const API = {
  geocoding: 'https://geocoding-api.open-meteo.com/v1/search',
  forecast: 'https://api.open-meteo.com/v1/forecast'
};
const STORAGE_KEY = 'skyline.last-city.v1';
const DAYS = 5;
const REQUEST_TIMEOUT = 12000;
const CONDITIONS = {
  0: ['Clear', 'clear'], 1: ['Mainly clear', 'clear'], 2: ['Partly cloudy', 'partly'],
  3: ['Overcast', 'cloud'], 45: ['Fog', 'fog'], 48: ['Freezing fog', 'fog'],
  51: ['Light drizzle', 'rain'], 53: ['Drizzle', 'rain'], 55: ['Heavy drizzle', 'rain'],
  56: ['Light freezing drizzle', 'rain'], 57: ['Freezing drizzle', 'rain'],
  61: ['Light rain', 'rain'], 63: ['Rain', 'rain'], 65: ['Heavy rain', 'rain'],
  66: ['Light freezing rain', 'rain'], 67: ['Heavy freezing rain', 'rain'],
  71: ['Light snow', 'snow'], 73: ['Snow', 'snow'], 75: ['Heavy snow', 'snow'],
  77: ['Snow grains', 'snow'], 80: ['Light rain showers', 'rain'],
  81: ['Rain showers', 'rain'], 82: ['Heavy rain showers', 'rain'],
  85: ['Light snow showers', 'snow'], 86: ['Heavy snow showers', 'snow'],
  95: ['Thunderstorm', 'thunder'], 96: ['Thunderstorm with hail', 'thunder'],
  97: ['Heavy thunderstorm', 'thunder'], 99: ['Thunderstorm with heavy hail', 'thunder']
};

const form = document.querySelector('#search-form');
const input = document.querySelector('#city');
const searchButton = document.querySelector('#search-button');
const status = document.querySelector('#search-status');
const announcement = document.querySelector('#announcement');
const emptyState = document.querySelector('#empty-state');
const results = document.querySelector('#weather-results');
const currentCard = document.querySelector('#current-card');
const forecastList = document.querySelector('#forecast-list');
const suggestionButtons = document.querySelectorAll('button[data-city]');
let searching = false;

class WeatherError extends Error {}
class CityNotFoundError extends WeatherError {}

async function requestJson(endpoint, params, serviceError) {
  const url = new URL(endpoint);
  url.search = new URLSearchParams(params).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new WeatherError(serviceError);
    try {
      return await response.json();
    } catch (error) {
      if (controller.signal.aborted) throw error;
      throw new WeatherError(serviceError);
    }
  } catch (error) {
    if (controller.signal.aborted) {
      throw new WeatherError('The weather service took too long to respond. Try again.');
    }
    if (error instanceof WeatherError) throw error;
    throw new WeatherError('Network problem. Check your connection and try again.');
  } finally {
    clearTimeout(timeout);
  }
}

async function findCity(name) {
  const error = 'City search is temporarily unavailable. Try again.';
  const data = await requestJson(API.geocoding, { name, count: '1', language: 'en', format: 'json' }, error);
  if (!data || typeof data !== 'object' || data.error || (data.results !== undefined && !Array.isArray(data.results))) {
    throw new WeatherError(error);
  }
  const match = data.results?.[0];
  if (!match) throw new CityNotFoundError(`City not found: ${name}. Check the spelling or add the country.`);
  if (typeof match.name !== 'string' || !match.name || !Number.isFinite(match.latitude) || !Number.isFinite(match.longitude)) {
    throw new WeatherError(error);
  }
  const region = [...new Set([match.admin1, match.country])]
    .filter(part => typeof part === 'string' && part && part !== match.name)
    .join(', ');
  return { name: match.name, region, lat: match.latitude, lon: match.longitude };
}

async function getWeather(lat, lon) {
  const error = 'The forecast is temporarily unavailable. Try again.';
  const data = await requestJson(API.forecast, {
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,weather_code,is_day,apparent_temperature,relative_humidity_2m,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    forecast_days: String(DAYS),
    timezone: 'auto',
    temperature_unit: 'celsius',
    wind_speed_unit: 'kmh'
  }, error);
  const daily = data?.daily;
  if (!Number.isFinite(data?.current?.temperature_2m) ||
      !['time', 'weather_code', 'temperature_2m_max', 'temperature_2m_min']
        .every(key => Array.isArray(daily?.[key]) && daily[key].length >= DAYS) ||
      !daily.time.slice(0, DAYS).every(date => typeof date === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)))) {
    throw new WeatherError(error);
  }
  return data;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function conditionFor(code, isDay = 1) {
  const known = Number.isInteger(code) ? CONDITIONS[code] : undefined;
  const [label, icon] = known ?? ['Condition unavailable', 'unknown'];
  if (isDay === 0 && icon === 'clear') return { label, icon: 'night' };
  if (isDay === 0 && icon === 'partly') return { label, icon: 'partly night' };
  return { label, icon };
}

function iconFor(icon) {
  const node = element('span', `weather-icon ${icon}`);
  node.setAttribute('aria-hidden', 'true');
  node.append(element('i'), element('b'));
  return node;
}

function formatMeasurement(value, unit) {
  return Number.isFinite(value) ? `${Math.round(value)}${unit}` : '—';
}

function metric(label, value, unit) {
  const item = element('div', 'metric');
  item.append(element('dt', '', label), element('dd', '', formatMeasurement(value, unit)));
  return item;
}

function localTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return '';
  const date = new Date(`${value}:00Z`);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
}

function renderWeather(city, weather) {
  const { current, daily } = weather;
  const condition = conditionFor(current.weather_code, current.is_day);
  const overview = element('div', 'current-main');
  overview.append(element('p', 'current-eyebrow', 'Current conditions'), element('h2', 'current-city', city.name));
  if (city.region) overview.append(element('p', 'current-location', city.region));
  const reading = element('div', 'current-reading');
  reading.append(element('p', 'temperature', formatMeasurement(current.temperature_2m, '°C')), iconFor(condition.icon));
  overview.append(reading, element('p', 'current-condition', condition.label));
  const time = localTime(current.time);
  if (time) overview.append(element('p', 'current-time', `As of ${time} local time`));

  const metrics = element('dl', 'metrics');
  metrics.append(
    metric('Feels like', current.apparent_temperature, '°C'),
    metric('Humidity', current.relative_humidity_2m, '%'),
    metric('Wind', current.wind_speed_10m, ' km/h')
  );
  currentCard.replaceChildren(overview, metrics);

  const forecast = daily.time.slice(0, DAYS).map((date, index) => {
    const day = element('li', 'forecast-day');
    const title = element('time', 'forecast-date', new Date(`${date}T12:00:00Z`)
      .toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }));
    title.dateTime = date;
    const outlook = conditionFor(daily.weather_code[index]);
    const temps = element('p', 'forecast-temps');
    temps.append(
      element('span', 'forecast-high', `H ${formatMeasurement(daily.temperature_2m_max[index], '°C')}`),
      element('span', 'forecast-low', `L ${formatMeasurement(daily.temperature_2m_min[index], '°C')}`)
    );
    day.append(title, iconFor(outlook.icon), element('p', 'forecast-condition', outlook.label), temps);
    return day;
  });
  forecastList.replaceChildren(...forecast);
  emptyState.hidden = true;
  results.hidden = false;
}

function setStatus(message = '', kind = '', spoken = message) {
  status.textContent = message;
  status.dataset.kind = kind;
  status.hidden = !message;
  announcement.textContent = spoken;
}

function setLoading(loading) {
  searching = loading;
  searchButton.disabled = loading;
  searchButton.textContent = loading ? 'Searching…' : 'Search';
  suggestionButtons.forEach(button => { button.disabled = loading; });
  results.setAttribute('aria-busy', String(loading));
}

async function searchCity(value, fromRestore = false) {
  if (searching) return;
  const name = value.trim().normalize('NFC');
  if (Array.from(name).length < 2 || !/[\p{L}\p{N}]/u.test(name) || name.length > input.maxLength) {
    input.setAttribute('aria-invalid', 'true');
    setStatus(name.length > input.maxLength ? 'Use 100 characters or fewer.' : 'Enter a city name with at least two characters.', 'error');
    if (!fromRestore) input.focus();
    return;
  }

  input.removeAttribute('aria-invalid');
  setLoading(true);
  setStatus(`Looking up weather for ${name}…`, 'loading');
  try {
    const city = await findCity(name);
    const weather = await getWeather(city.lat, city.lon);
    renderWeather(city, weather);
    setStatus('', '', `Current conditions and five-day forecast loaded for ${city.name}.`);
    try {
      localStorage.setItem(STORAGE_KEY, name);
    } catch {
      // The dashboard still works when this browser blocks storage.
    }
  } catch (error) {
    if (error instanceof CityNotFoundError && input.value.trim() === value.trim()) {
      input.setAttribute('aria-invalid', 'true');
    }
    setStatus(error instanceof WeatherError ? error.message : 'Weather could not be displayed. Try again.', 'error');
  } finally {
    setLoading(false);
    if (!fromRestore && document.activeElement === document.body) input.focus({ preventScroll: true });
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  void searchCity(input.value);
});
input.addEventListener('input', () => {
  input.removeAttribute('aria-invalid');
  if (!searching && status.dataset.kind === 'error') setStatus();
});
for (const button of suggestionButtons) {
  button.addEventListener('click', () => {
    if (searching) return;
    input.value = button.dataset.city;
    void searchCity(input.value);
  });
}

try {
  const lastCity = localStorage.getItem(STORAGE_KEY);
  if (lastCity) {
    input.value = lastCity;
    void searchCity(lastCity, true);
  }
} catch {
  // Storage access is optional.
}
