// Inline API key - WARNING: key is embedded in client code
const OWM_KEY = 'f091f2310d4773492da4d4d144fda620';
const GEO_API = 'https://api.openweathermap.org/geo/1.0/direct';
const ONECALL_API = 'https://api.openweathermap.org/data/3.0/onecall';

const DAILY_CLIENT_LIMIT = 900; // client-side per-device guard

// Utility: elements
const cityInput = document.getElementById('city-input');
const searchBtn = document.getElementById('search-btn');
const gpsBtn = document.getElementById('gps-btn');
const statusEl = document.getElementById('status');
const weatherEl = document.getElementById('weather');
const unitMetric = document.getElementById('unit-metric');
const unitImperial = document.getElementById('unit-imperial');

let lastCoords = null; // {lat, lon, label}

function getUnits(){ return localStorage.getItem('owm_units') || 'metric'; }
function setUnits(u){ localStorage.setItem('owm_units', u); }

// Init
registerSW();
attachListeners();

function attachListeners(){
  searchBtn.addEventListener('click', () => handleCitySearch());
  gpsBtn.addEventListener('click', () => getWeatherByGPS());
  cityInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleCitySearch();
  });
  // units toggle
  const u = getUnits();
  if (u === 'imperial') unitImperial.checked = true; else unitMetric.checked = true;
  unitMetric.addEventListener('change', () => { setUnits('metric'); if (lastCoords) fetchAndRender(lastCoords.lat, lastCoords.lon, lastCoords.label); });
  unitImperial.addEventListener('change', () => { setUnits('imperial'); if (lastCoords) fetchAndRender(lastCoords.lat, lastCoords.lon, lastCoords.label); });
}

function setStatus(msg, cls){
  statusEl.textContent = msg || '';
  statusEl.className = cls || '';
}

function debounce(fn, wait){
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

async function handleCitySearch(){
  const city = cityInput.value.trim();
  if (!city) { setStatus('Please enter a city.', 'error'); return; }
  setStatus('Searching city...', 'loading');

  try{
    const coords = await geocodeCity(city);
    if (!coords) { setStatus('City not found.', 'error'); return; }
    await fetchAndRender(coords.lat, coords.lon, coords.name || city);
  }catch(err){
    console.error(err);
    setStatus('Error looking up city.', 'error');
  }
}

async function geocodeCity(city){
  const url = `${GEO_API}?q=${encodeURIComponent(city)}&limit=1&appid=${OWM_KEY}`;
  const resp = await fetch(url);
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!data || data.length === 0) return null;
  return {
    name: data[0].name + (data[0].country ? ', ' + data[0].country : ''),
    lat: data[0].lat,
    lon: data[0].lon
  };
}

function getDailyCounter(){
  try{
    const raw = localStorage.getItem('owm_daily_count');
    if (!raw) return {date: today(), count:0};
    const obj = JSON.parse(raw);
    if (obj.date !== today()) return {date: today(), count:0};
    return obj;
  }catch(e){return {date: today(), count:0};}
}

function incrementDailyCounter(){
  const obj = getDailyCounter();
  obj.count = (obj.count||0) + 1;
  obj.date = today();
  localStorage.setItem('owm_daily_count', JSON.stringify(obj));
}

function today(){
  const d = new Date(); return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}

async function getWeatherByGPS(){
  setStatus('Getting location...', 'loading');
  if (!navigator.geolocation){ setStatus('Geolocation not supported.', 'error'); return; }

  navigator.geolocation.getCurrentPosition(async (pos) =>{
    const lat = pos.coords.latitude; const lon = pos.coords.longitude;
    await fetchAndRender(lat, lon, 'Your location');
  }, (err) => {
    console.error(err);
    setStatus('Location access denied or unavailable.', 'error');
  }, {timeout:10000});
}

async function fetchAndRender(lat, lon, label){
  setStatus('Loading weather...', 'loading');
  weatherEl.innerHTML = '';
  lastCoords = {lat, lon, label};
  try{
    const data = await fetchOneCall(lat, lon);
    if (!data) { setStatus('Weather data unavailable.', 'error'); return; }
    renderWeather(data, label);
    setStatus('', '');
  }catch(err){
    console.error(err);
    setStatus('Failed to load weather.', 'error');
  }
}

// Caching policy: current 10min, hourly 1h, daily 6h
function cacheKey(lat, lon){ return `owm_${lat.toFixed(3)}_${lon.toFixed(3)}_${getUnits()}`; }

function getCached(lat, lon){
  try{
    const key = cacheKey(lat,lon);
    const raw = localStorage.getItem(key); if (!raw) return null;
    const obj = JSON.parse(raw); return obj;
  }catch(e){ return null; }
}

function setCached(lat, lon, data){
  try{
    const key = cacheKey(lat,lon);
    const obj = {ts: Date.now(), data};
    localStorage.setItem(key, JSON.stringify(obj));
  }catch(e){/* ignore */}
}

function isFresh(ts, maxAgeMs){ return (Date.now() - ts) < maxAgeMs; }

async function fetchOneCall(lat, lon){
  // Check client daily limit
  const counter = getDailyCounter();
  if (counter.count >= DAILY_CLIENT_LIMIT) {
    // try cache
    const cached = getCached(lat, lon);
    if (cached) return cached.data;
    throw new Error('Client daily request limit reached');
  }

  const cached = getCached(lat, lon);
  if (cached && isFresh(cached.ts, 10*60*1000)){
    // fresh within 10 minutes
    return cached.data;
  }

  // Build One Call URL - exclude minutely and alerts to reduce payload
  const units = getUnits();
  const url = `${ONECALL_API}?lat=${lat}&lon=${lon}&units=${units}&exclude=minutely,alerts&appid=${OWM_KEY}`;
  const resp = await fetch(url);
  if (!resp.ok){
    // if 4xx/5xx try cache fallback
    if (cached) return cached.data;
    throw new Error('Network error: ' + resp.status);
  }
  const data = await resp.json();
  setCached(lat, lon, data);
  incrementDailyCounter();
  return data;
}

function renderWeather(payload, label){
  // payload contains current, hourly[], daily[]
  const cur = payload.current;
  const hourly = payload.hourly || [];
  const daily = payload.daily || [];

  // update header fields
  const locEl = document.getElementById('location');
  const condEl = document.getElementById('condition');
  const iconEl = document.getElementById('weather-icon');
  const tempEl = document.getElementById('current-temp');
  const detailsEl = document.getElementById('current-details');
  const hourlyEl = document.getElementById('hourly');
  const dailyEl = document.getElementById('daily');

  locEl.textContent = label || '';
  condEl.textContent = cur && cur.weather && cur.weather[0] ? capitalize(cur.weather[0].description) : '';
  if (cur && cur.weather && cur.weather[0]){
    const ic = cur.weather[0].icon;
    iconEl.src = `https://openweathermap.org/img/wn/${ic}@4x.png`;
    iconEl.alt = cur.weather[0].description || 'weather';
  }
  const unitSym = getUnits() === 'metric' ? '°C' : '°F';
  tempEl.textContent = cur ? `${Math.round(cur.temp)}${unitSym}` : '--';

  // details
  detailsEl.innerHTML = '';
  if (cur){
    const feels = document.createElement('div'); feels.textContent = `Feels like: ${Math.round(cur.feels_like)}${unitSym}`;
    const hum = document.createElement('div'); hum.textContent = `Humidity: ${cur.humidity}%`;
    const wind = document.createElement('div'); wind.textContent = `Wind: ${cur.wind_speed} ${getUnits() === 'metric' ? 'm/s' : 'mph'}`;
    detailsEl.appendChild(feels); detailsEl.appendChild(hum); detailsEl.appendChild(wind);
  }

  // hourly
  hourlyEl.innerHTML = '<div class="small">Hourly</div>'; 
  const hwrap = document.createElement('div'); hwrap.className='hourly';
  hourly.slice(0,12).forEach(h =>{
    const it = document.createElement('div'); it.className='item';
    const dt = new Date(h.dt*1000);
    it.innerHTML = `<div class="small">${dt.getHours()}:00</div><div class="temp">${Math.round(h.temp)}${unitSym}</div>`;
    hwrap.appendChild(it);
  });
  hourlyEl.appendChild(hwrap);

  // daily
  dailyEl.innerHTML = '<div class="small">Daily</div>';
  daily.slice(0,7).forEach(d=>{
    const row = document.createElement('div'); row.className='row small';
    const dt = new Date(d.dt*1000);
    row.innerHTML = `<div>${dt.toDateString()}</div><div>${Math.round(d.temp.day)}${unitSym}</div>`;
    dailyEl.appendChild(row);
  });

  // last updated (from cache timestamp if available)
  const key = cacheKey(lastCoords.lat, lastCoords.lon);
  const raw = localStorage.getItem(key);
  let updatedTs = Date.now();
  if (raw) try{ updatedTs = JSON.parse(raw).ts || Date.now(); }catch(e){}
  const updated = document.createElement('div'); updated.className='small';
  updated.textContent = 'Last updated: ' + new Date(updatedTs).toLocaleString();
  weatherEl.innerHTML = '';
  weatherEl.appendChild(document.getElementById('current'));
  weatherEl.appendChild(hourlyEl);
  weatherEl.appendChild(dailyEl);
  weatherEl.appendChild(updated);
}

function capitalize(s){ if (!s) return ''; return s.charAt(0).toUpperCase() + s.slice(1); }

function registerSW(){
  if ('serviceWorker' in navigator){
    navigator.serviceWorker.register('service-worker.js')
      .then(()=>console.log('SW registered'))
      .catch(err=>console.warn('SW failed', err));
  }
}
