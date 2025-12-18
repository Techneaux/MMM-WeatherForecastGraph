# Plan: MMM-WeatherForecastGraph Module

## Overview
A new MagicMirror module that displays 48-hour weather graphs (temperature, wind, precipitation) by consuming the `OPENWEATHER_FORECAST_WEATHER_UPDATE` notification broadcast by MMM-OpenWeatherForecast.

---

## Module Structure

```
MMM-WeatherForecastGraph/
├── MMM-WeatherForecastGraph.js   # Main module file
├── MMM-WeatherForecastGraph.css  # Styling
├── package.json                   # Dependencies (chart.js)
└── README.md                      # Documentation
```

---

## Data Source

Listens for `OPENWEATHER_FORECAST_WEATHER_UPDATE` notification. The payload contains:

```javascript
payload.hourly[0..47] = {
  dt: 1702843200,           // Unix timestamp
  temp: 35.5,               // Temperature (in configured units)
  wind_speed: 15,           // Wind speed (in configured units)
  wind_gust: 25,            // Wind gust (in configured units)
  pop: 0.8,                 // Probability of precipitation (0-1)
  humidity: 65,             // Humidity %
  pressure: 1013,           // Pressure in hPa
  wind_deg: 180,            // Wind direction in degrees
  feels_like: 32,           // Feels like temperature
  weather: [{id, main, description, icon}]  // Weather condition
}
```

---

## Chart Design

**Library**: Chart.js v4.4
**Layout**: Stacked (three separate charts)

### Chart 1: Temperature
- Line chart
- Y-axis: Temperature (°F or °C based on source module config)
- X-axis: Hours (0-48)
- Color: Orange/red gradient

### Chart 2: Wind
- Bar chart for wind speed, overlay for gusts
- Y-axis: Speed (mph or km/h)
- X-axis: Hours (0-48)
- Colors: Blue bars, darker blue for gusts

### Chart 3: Precipitation
- Bar chart
- Y-axis: Probability (0-100%)
- X-axis: Hours (0-48)
- Color: Blue/cyan

---

## Configuration Options

```javascript
{
  module: "MMM-WeatherForecastGraph",
  position: "bottom_center",
  config: {
    width: 600,              // Chart width in pixels
    height: 300,             // Total height (divided among charts)
    showTemperature: true,
    showWind: true,
    showPrecipitation: true,
    showGridLines: true,
    animateCharts: false,    // Disable for performance on Pi
    updateFadeSpeed: 500,
    hoursToShow: 48,         // Can limit to 24 if preferred
    temperatureColor: "#FFA500",
    windColor: "#4682B4",
    gustColor: "#1E3A5F",
    precipitationColor: "#00CED1",
  }
}
```

---

## Implementation

### MMM-WeatherForecastGraph.js

```javascript
Module.register("MMM-WeatherForecastGraph", {
  defaults: {
    width: 600,
    height: 300,
    showTemperature: true,
    showWind: true,
    showPrecipitation: true,
    showGridLines: true,
    animateCharts: false,
    updateFadeSpeed: 500,
    hoursToShow: 48,
    temperatureColor: "#FFA500",
    windColor: "#4682B4",
    gustColor: "#1E3A5F",
    precipitationColor: "#00CED1",
  },

  weatherData: null,
  charts: {},

  getStyles() {
    return ["MMM-WeatherForecastGraph.css"];
  },

  getScripts() {
    return ["modules/MMM-WeatherForecastGraph/node_modules/chart.js/dist/chart.umd.js"];
  },

  start() {
    Log.info("Starting module: " + this.name);
  },

  notificationReceived(notification, payload) {
    if (notification === "OPENWEATHER_FORECAST_WEATHER_UPDATE") {
      this.weatherData = payload;
      this.updateDom(this.config.updateFadeSpeed);
    }
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "weather-graph-wrapper";
    wrapper.style.width = this.config.width + "px";

    if (!this.weatherData) {
      wrapper.innerHTML = "<span class='dimmed'>Waiting for weather data...</span>";
      return wrapper;
    }

    // Create canvas elements for each enabled chart
    if (this.config.showTemperature) {
      const container = document.createElement("div");
      container.className = "chart-container";
      const canvas = document.createElement("canvas");
      canvas.id = this.identifier + "-temp-chart";
      canvas.width = this.config.width;
      canvas.height = this.config.height / 3;
      container.appendChild(canvas);
      wrapper.appendChild(container);
    }

    if (this.config.showWind) {
      const container = document.createElement("div");
      container.className = "chart-container";
      const canvas = document.createElement("canvas");
      canvas.id = this.identifier + "-wind-chart";
      canvas.width = this.config.width;
      canvas.height = this.config.height / 3;
      container.appendChild(canvas);
      wrapper.appendChild(container);
    }

    if (this.config.showPrecipitation) {
      const container = document.createElement("div");
      container.className = "chart-container";
      const canvas = document.createElement("canvas");
      canvas.id = this.identifier + "-precip-chart";
      canvas.width = this.config.width;
      canvas.height = this.config.height / 3;
      container.appendChild(canvas);
      wrapper.appendChild(container);
    }

    // Render charts after DOM is updated
    setTimeout(() => this.renderCharts(), 100);

    return wrapper;
  },

  renderCharts() {
    if (!this.weatherData?.hourly) return;

    const hours = this.weatherData.hourly.slice(0, this.config.hoursToShow);
    const labels = hours.map(h => this.formatHour(h.dt));

    if (this.config.showTemperature) {
      this.renderTemperatureChart(hours, labels);
    }
    if (this.config.showWind) {
      this.renderWindChart(hours, labels);
    }
    if (this.config.showPrecipitation) {
      this.renderPrecipitationChart(hours, labels);
    }
  },

  renderTemperatureChart(hours, labels) {
    const ctx = document.getElementById(this.identifier + "-temp-chart");
    if (!ctx) return;

    if (this.charts.temp) this.charts.temp.destroy();

    this.charts.temp = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [{
          label: "Temperature",
          data: hours.map(h => h.temp),
          borderColor: this.config.temperatureColor,
          backgroundColor: this.config.temperatureColor + "33",
          tension: 0.3,
          fill: true,
          pointRadius: 0
        }]
      },
      options: this.getChartOptions("Temperature")
    });
  },

  renderWindChart(hours, labels) {
    const ctx = document.getElementById(this.identifier + "-wind-chart");
    if (!ctx) return;

    if (this.charts.wind) this.charts.wind.destroy();

    this.charts.wind = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Wind Gust",
            data: hours.map(h => h.wind_gust || null),
            backgroundColor: this.config.gustColor,
            borderWidth: 0
          },
          {
            label: "Wind Speed",
            data: hours.map(h => h.wind_speed),
            backgroundColor: this.config.windColor,
            borderWidth: 0
          }
        ]
      },
      options: this.getChartOptions("Wind")
    });
  },

  renderPrecipitationChart(hours, labels) {
    const ctx = document.getElementById(this.identifier + "-precip-chart");
    if (!ctx) return;

    if (this.charts.precip) this.charts.precip.destroy();

    this.charts.precip = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [{
          label: "Precipitation %",
          data: hours.map(h => (h.pop || 0) * 100),
          backgroundColor: this.config.precipitationColor,
          borderWidth: 0
        }]
      },
      options: {
        ...this.getChartOptions("Precipitation"),
        scales: {
          ...this.getChartOptions("Precipitation").scales,
          y: {
            ...this.getChartOptions("Precipitation").scales.y,
            min: 0,
            max: 100
          }
        }
      }
    });
  },

  getChartOptions(title) {
    return {
      responsive: false,
      maintainAspectRatio: false,
      animation: this.config.animateCharts ? {} : false,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: title,
          color: "#999",
          font: { size: 12 }
        }
      },
      scales: {
        x: {
          grid: { display: this.config.showGridLines, color: "#333" },
          ticks: { color: "#999", maxTicksLimit: 12 }
        },
        y: {
          grid: { display: this.config.showGridLines, color: "#333" },
          ticks: { color: "#999" }
        }
      }
    };
  },

  formatHour(timestamp) {
    const date = new Date(timestamp * 1000);
    const hour = date.getHours();
    const ampm = hour >= 12 ? "p" : "a";
    const hour12 = hour % 12 || 12;
    return hour12 + ampm;
  }
});
```

---

### MMM-WeatherForecastGraph.css

```css
.weather-graph-wrapper {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chart-container {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 5px;
  padding: 5px;
}

.weather-graph-wrapper .dimmed {
  color: #666;
  font-size: 14px;
}
```

---

### package.json

```json
{
  "name": "mmm-weatherforecastgraph",
  "version": "1.0.0",
  "description": "MagicMirror module for displaying 48-hour weather forecast graphs",
  "main": "MMM-WeatherForecastGraph.js",
  "repository": {
    "type": "git",
    "url": "https://github.com/YOUR_USERNAME/MMM-WeatherForecastGraph"
  },
  "keywords": ["MagicMirror", "weather", "chart", "graph", "forecast"],
  "author": "",
  "license": "MIT",
  "dependencies": {
    "chart.js": "^4.4.0"
  }
}
```

---

## Installation

```bash
cd ~/MagicMirror/modules
git clone https://github.com/YOUR_USERNAME/MMM-WeatherForecastGraph
cd MMM-WeatherForecastGraph
npm install
```

Add to `config/config.js`:
```javascript
{
  module: "MMM-WeatherForecastGraph",
  position: "bottom_center",  // or any position
  config: {
    width: 600,
    height: 300,
    hoursToShow: 48
  }
}
```

**Requires**: MMM-OpenWeatherForecast module running to provide weather data via notification.

---

## Summary

- **New repository**: `MMM-WeatherForecastGraph`
- **Chart library**: Chart.js v4.4
- **Layout**: Stacked (3 separate charts)
- **Data source**: `OPENWEATHER_FORECAST_WEATHER_UPDATE` notification from MMM-OpenWeatherForecast
- **No node_helper needed**: Pure frontend module, no API calls
- **Files to create**: 4 files (~200 lines total)
