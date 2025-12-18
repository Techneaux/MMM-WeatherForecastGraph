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
  // Retry settings
  maxRetries: 3,
  retryDelayMs: 5000,

  start: function () {
    Log.log(`Starting node_helper for: ${this.name}`);
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "CONFIG") {
      const instanceId = payload.instanceId;

      // Check if this instance is already registered
      if (this.instances[instanceId]) {
        return; // Already running, skip
      }

      // Register this instance
      this.instances[instanceId] = payload;

      // Start fetching for this instance
      this.fetchData(instanceId);
      this.scheduleUpdate(instanceId);
    }
  },

  scheduleUpdate: function (instanceId) {
    const config = this.instances[instanceId];
    if (!config) return;

    setInterval(() => {
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

      // Step 4: Send to frontend with instanceId for filtering
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

    // Extract raw precipitation periods (don't expand - keep original time spans)
    const precipitationPeriods = this.extractPrecipitationPeriods(
      properties.quantitativePrecipitation?.values || [],
      now,
      hoursToShow,
      units
    );

    // Find the starting hour (current hour)
    const startHour = new Date(now);
    startHour.setMinutes(0, 0, 0);

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

  extractPrecipitationPeriods: function (values, now, hoursToShow, units) {
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

      periods.push({
        startIndex: startIndex,
        endIndex: endIndex,
        amount_mm: item.value,
        amount_inches: units === "imperial" ? this.mmToInches(item.value) : item.value
      });
    }

    return periods;
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
