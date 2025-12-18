/* MagicMirror² Node Helper: MMM-WeatherForecastGraph
 * Fetches weather data directly from weather.gov API
 */

const NodeHelper = require("node_helper");
const Log = require("logger");

module.exports = NodeHelper.create({
  // Store configs per instance to support multiple modules with different locations
  instances: {},
  // Cache grid URLs by coordinates (they never change)
  gridUrlCache: {},
  // Cache weather data by coordinates (for fresh page loads)
  dataCache: {},
  // Retry settings
  maxRetries: 3,
  retryDelayMs: 5000,

  start: function () {
    Log.log(`Starting node_helper for: ${this.name}`);
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "CONFIG") {
      const instanceId = payload.instanceId;
      const cacheKey = `${payload.latitude},${payload.longitude}`;

      // Always send cached data immediately if available (for fresh page loads)
      if (this.dataCache[cacheKey]) {
        this.sendSocketNotification("WEATHER_GRAPH_DATA", {
          instanceId: instanceId,
          data: this.dataCache[cacheKey]
        });
      }

      // Only start fetching/intervals if not already running for this instance
      if (!this.instances[instanceId]) {
        this.instances[instanceId] = payload;
        this.fetchData(instanceId);
        this.scheduleUpdate(instanceId);
      }
    }
  },

  scheduleUpdate: function (instanceId) {
    const config = this.instances[instanceId];
    if (!config) return;

    // Store interval ID for potential cleanup to avoid multiple concurrent intervals
    config.updateIntervalId = setInterval(() => {
      this.fetchData(instanceId);
    }, config.updateInterval);
  },

  fetchData: async function (instanceId, retryCount = 0) {
    const config = this.instances[instanceId];
    if (!config) return;

    const { latitude, longitude } = config;

    if (!latitude || !longitude) {
      Log.error(`${this.name}: latitude and longitude are required`);
      return;
    }

    try {
      // Step 1: Get grid URL (from cache or API)
      const cacheKey = `${latitude},${longitude}`;
      let forecastGridDataUrl = this.gridUrlCache[cacheKey];

      if (!forecastGridDataUrl) {
        const pointsUrl = `https://api.weather.gov/points/${latitude},${longitude}`;
        const pointsResponse = await fetch(pointsUrl, {
          headers: { "User-Agent": "MMM-WeatherForecastGraph/1.0" }
        });

        if (!pointsResponse.ok) {
          throw new Error(`Points API error: ${pointsResponse.status}`);
        }

        const pointsData = await pointsResponse.json();
        forecastGridDataUrl = pointsData.properties.forecastGridData;

        // Cache the grid URL
        this.gridUrlCache[cacheKey] = forecastGridDataUrl;
        Log.info(`${this.name}: Cached grid URL for ${cacheKey}`);
      }

      // Step 2: Get hourly forecast data
      const gridResponse = await fetch(forecastGridDataUrl, {
        headers: { "User-Agent": "MMM-WeatherForecastGraph/1.0" }
      });

      if (!gridResponse.ok) {
        throw new Error(`Grid API error: ${gridResponse.status}`);
      }

      const gridData = await gridResponse.json();

      // Step 3: Process the data
      const processedData = this.processWeatherData(gridData.properties, config);

      // Step 4: Cache the data for fresh page loads (reuse cacheKey from Step 1)
      this.dataCache[cacheKey] = processedData;

      // Step 5: Send to frontend with instanceId for filtering
      this.sendSocketNotification("WEATHER_GRAPH_DATA", {
        instanceId: instanceId,
        data: processedData
      });

    } catch (error) {
      Log.error(`${this.name}: Error fetching weather data: ${error.message}`);

      // Retry logic with exponential backoff
      if (retryCount < this.maxRetries) {
        const delay = this.retryDelayMs * Math.pow(2, retryCount);
        Log.info(`${this.name}: Retrying in ${delay}ms (attempt ${retryCount + 1}/${this.maxRetries})`);
        setTimeout(() => {
          this.fetchData(instanceId, retryCount + 1);
        }, delay);
      } else {
        // Send error notification to frontend after all retries exhausted
        this.sendSocketNotification("WEATHER_GRAPH_ERROR", {
          instanceId: instanceId,
          error: error.message
        });
      }
    }
  },

  processWeatherData: function (properties, config) {
    const now = new Date();
    const hoursToShow = config.hoursToShow || 48;
    const units = config.units || "imperial";

    // Expand time series into hourly data
    const tempValues = this.expandTimeSeries(properties.temperature?.values || []);
    const feelsLikeValues = this.expandTimeSeries(properties.apparentTemperature?.values || []);
    const windSpeedValues = this.expandTimeSeries(properties.windSpeed?.values || []);
    const windGustValues = this.expandTimeSeries(properties.windGust?.values || []);
    const popValues = this.expandTimeSeries(properties.probabilityOfPrecipitation?.values || []);

    // Find the starting hour (current hour)
    const startHour = new Date(now);
    startHour.setMinutes(0, 0, 0);

    // Build hourly data first (we need temps for precipitation filtering)
    const hourly = [];
    for (let i = 0; i < hoursToShow; i++) {
      const targetTime = new Date(startHour.getTime() + i * 3600000);

      // Find values for this hour
      const temp = this.findValueAtTime(tempValues, targetTime);
      const feelsLike = this.findValueAtTime(feelsLikeValues, targetTime);
      const windSpeed = this.findValueAtTime(windSpeedValues, targetTime);
      const windGust = this.findValueAtTime(windGustValues, targetTime);
      const pop = this.findValueAtTime(popValues, targetTime);

      hourly.push({
        dt: Math.floor(targetTime.getTime() / 1000),
        temp: units === "imperial" ? this.celsiusToFahrenheit(temp) : Math.round(temp),
        feels_like: units === "imperial" ? this.celsiusToFahrenheit(feelsLike) : Math.round(feelsLike),
        wind_speed: units === "imperial" ? this.kphToMph(windSpeed) : Math.round(windSpeed),
        wind_gust: units === "imperial" ? this.kphToMph(windGust) : Math.round(windGust),
        pop: pop !== null ? pop / 100 : 0
      });
    }

    // Extract rain and snow periods separately, then merge preferring snow
    // (when it's snowing, users care about snow accumulation, not liquid equivalent)
    const rainPeriods = this.extractPrecipitationPeriods(
      properties.quantitativePrecipitation?.values || [],
      now,
      hoursToShow,
      units,
      "rain"
    );

    const snowPeriods = this.extractPrecipitationPeriods(
      properties.snowfallAmount?.values || [],
      now,
      hoursToShow,
      units,
      "snow"
    );

    // Pass hourly data and units to filter out rain when it's freezing
    const precipitationPeriods = this.mergePrecipitationPeriods(rainPeriods, snowPeriods, hourly, units);

    return {
      hourly: hourly,
      precipitationPeriods: precipitationPeriods
    };
  },

  expandTimeSeries: function (values) {
    const expanded = [];

    for (const item of values) {
      if (!item.validTime) continue;

      const [startStr, durationStr] = item.validTime.split("/");
      const startTime = new Date(startStr);
      const hours = this.parseDuration(durationStr);

      for (let h = 0; h < hours; h++) {
        const time = new Date(startTime.getTime() + h * 3600000);
        expanded.push({
          time: time,
          value: item.value
        });
      }
    }

    return expanded;
  },

  // Parse ISO 8601 duration - only supports hours format (e.g., "PT1H", "PT6H")
  // Other duration formats will default to 1 hour
  parseDuration: function (duration) {
    const match = duration.match(/PT(\d+)H/);
    return match ? parseInt(match[1], 10) : 1;
  },

  findValueAtTime: function (expandedValues, targetTime) {
    for (const item of expandedValues) {
      if (item.time.getTime() <= targetTime.getTime() &&
          targetTime.getTime() < item.time.getTime() + 3600000) {
        return item.value;
      }
    }
    // If not found, find closest before
    let closest = null;
    for (const item of expandedValues) {
      if (item.time.getTime() <= targetTime.getTime()) {
        closest = item.value;
      }
    }
    return closest;
  },

  extractPrecipitationPeriods: function (values, now, hoursToShow, units, type = "rain") {
    const periods = [];
    const startHour = new Date(now);
    startHour.setMinutes(0, 0, 0);
    const endTime = new Date(startHour.getTime() + hoursToShow * 3600000);

    for (const item of values) {
      if (!item.validTime || item.value === 0) continue;

      const [startStr, durationStr] = item.validTime.split("/");
      const periodStart = new Date(startStr);
      const hours = this.parseDuration(durationStr);
      const periodEnd = new Date(periodStart.getTime() + hours * 3600000);

      // Check if this period overlaps with our display window
      if (periodEnd <= startHour || periodStart >= endTime) continue;

      // Clip to our display window
      const displayStart = new Date(Math.max(periodStart.getTime(), startHour.getTime()));
      const displayEnd = new Date(Math.min(periodEnd.getTime(), endTime.getTime()));

      // Calculate hour indices for the chart
      const startIndex = Math.floor((displayStart.getTime() - startHour.getTime()) / 3600000);
      const endIndex = Math.floor((displayEnd.getTime() - startHour.getTime()) / 3600000);

      // Calculate display amount based on units
      const amount = units === "imperial" ? this.mmToInches(item.value) : item.value;
      // Different thresholds for rain vs snow (snow amounts are larger)
      // Rain: 0.01" or 0.25mm, Snow: 0.1" or 2.5mm
      const displayThreshold = type === "snow"
        ? (units === "imperial" ? 0.1 : 2.5)
        : (units === "imperial" ? 0.01 : 0.25);

      periods.push({
        startIndex: startIndex,
        endIndex: endIndex,
        amount_mm: item.value,
        amount: amount,
        displayThreshold: displayThreshold,
        units: units,
        type: type
      });
    }

    return periods;
  },

  // Merge rain and snow periods, preferring snow when they overlap
  // (they represent the same precipitation event - snow amount vs liquid equivalent)
  // Also hides rain when temp is at or below freezing (misleading to show rain at 28°F)
  mergePrecipitationPeriods: function (rainPeriods, snowPeriods, hourly, units) {
    // Create map of snow periods by startIndex for quick lookup
    const snowByStart = new Map();
    snowPeriods.forEach(p => snowByStart.set(p.startIndex, p));

    const merged = [];
    const usedSnowIndices = new Set();

    // Freezing threshold: 32°F (imperial) or 0°C (metric)
    const freezingPoint = units === "imperial" ? 32 : 0;

    // For each rain period, if snow exists for same time, use snow instead
    rainPeriods.forEach(rain => {
      const snow = snowByStart.get(rain.startIndex);
      if (snow && snow.amount > 0) {
        merged.push(snow);  // Prefer snow (what users care about)
        usedSnowIndices.add(rain.startIndex);
      } else if (rain.amount > 0) {
        // Check temperature at this hour - skip rain if it's freezing
        const temp = hourly[rain.startIndex]?.temp;
        const isFreezing = temp !== null && temp !== undefined && temp <= freezingPoint;

        if (!isFreezing) {
          merged.push(rain);  // Only show rain if above freezing
        }
        // Below freezing with no snow data: skip (don't show misleading rain)
      }
    });

    // Add any snow periods not overlapping with rain
    snowPeriods.forEach(snow => {
      if (!usedSnowIndices.has(snow.startIndex) && snow.amount > 0) {
        merged.push(snow);
      }
    });

    return merged;
  },

  celsiusToFahrenheit: function (celsius) {
    if (celsius === null || celsius === undefined) return null;
    return Math.round((celsius * 9 / 5) + 32);
  },

  kphToMph: function (kph) {
    if (kph === null || kph === undefined) return null;
    return Math.round(kph * 0.621371);
  },

  mmToInches: function (mm) {
    if (mm === null || mm === undefined) return null;
    return Math.round(mm * 0.0393701 * 100) / 100;
  }
});
