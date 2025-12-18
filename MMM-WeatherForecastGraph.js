/* MagicMirror² Module: MMM-WeatherForecastGraph
 * Displays 48-hour weather forecast graphs for temperature, wind, and precipitation.
 * Consumes data from OPENWEATHER_FORECAST_WEATHER_UPDATE notification.
 */

Module.register("MMM-WeatherForecastGraph", {
  defaults: {
    width: 600,
    height: 300,
    showTemperature: true,
    showFeelsLike: true,
    showWind: true,
    showPrecipitation: true,
    showGridLines: true,
    animateCharts: false,
    updateFadeSpeed: 500,
    hoursToShow: 48,
    temperatureColor: "#FFA500",
    feelsLikeColor: "#FF6347",
    windColor: "#4682B4",
    gustColor: "#1E3A5F",
    precipitationColor: "#00CED1"
  },

  weatherData: null,
  charts: {},
  renderPending: false,

  getStyles: function () {
    return [this.file("MMM-WeatherForecastGraph.css")];
  },

  getScripts: function () {
    return [this.file("node_modules/chart.js/dist/chart.umd.js")];
  },

  start: function () {
    Log.info("Starting module: " + this.name);
    // Validate config bounds
    this.config.hoursToShow = Math.max(1, Math.min(48, this.config.hoursToShow));
  },

  suspend: function () {
    Log.info(this.name + ": Suspending, destroying charts");
    this.destroyAllCharts();
  },

  resume: function () {
    Log.info(this.name + ": Resuming");
    if (this.weatherData) {
      this.updateDom(this.config.updateFadeSpeed);
    }
  },

  notificationReceived: function (notification, payload, sender) {
    if (notification === "OPENWEATHER_FORECAST_WEATHER_UPDATE") {
      this.weatherData = payload;
      this.updateDom(this.config.updateFadeSpeed);
    }
  },

  getDom: function () {
    const wrapper = document.createElement("div");
    wrapper.className = "weather-graph-wrapper";
    wrapper.style.width = this.config.width + "px";

    if (!this.weatherData || !this.weatherData.hourly) {
      wrapper.innerHTML = "<span class='dimmed'>Waiting for weather data...</span>";
      return wrapper;
    }

    const chartHeight = this.calculateChartHeight();

    if (this.config.showTemperature) {
      const container = this.createChartContainer("temp", chartHeight);
      wrapper.appendChild(container);
    }

    if (this.config.showWind) {
      const container = this.createChartContainer("wind", chartHeight);
      wrapper.appendChild(container);
    }

    if (this.config.showPrecipitation) {
      const container = this.createChartContainer("precip", chartHeight);
      wrapper.appendChild(container);
    }

    // Render charts after DOM is updated using requestAnimationFrame
    if (!this.renderPending) {
      this.renderPending = true;
      requestAnimationFrame(() => {
        this.renderCharts();
        this.renderPending = false;
      });
    }

    return wrapper;
  },

  createChartContainer: function (type, height) {
    const container = document.createElement("div");
    container.className = "chart-container";
    const canvas = document.createElement("canvas");
    canvas.id = this.identifier + "-" + type + "-chart";
    canvas.width = this.config.width;
    canvas.height = height;
    container.appendChild(canvas);
    return container;
  },

  calculateChartHeight: function () {
    let visibleCharts = 0;
    if (this.config.showTemperature) visibleCharts++;
    if (this.config.showWind) visibleCharts++;
    if (this.config.showPrecipitation) visibleCharts++;
    return visibleCharts > 0 ? Math.floor(this.config.height / visibleCharts) : this.config.height;
  },

  destroyAllCharts: function () {
    Object.keys(this.charts).forEach((key) => {
      if (this.charts[key]) {
        this.charts[key].destroy();
        this.charts[key] = null;
      }
    });
  },

  renderCharts: function () {
    if (!this.weatherData || !this.weatherData.hourly) return;

    // Destroy existing charts first to prevent memory leaks
    this.destroyAllCharts();

    const hours = this.weatherData.hourly.slice(0, this.config.hoursToShow);
    const labels = hours.map((h) => this.formatHour(h.dt));

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

  renderTemperatureChart: function (hours, labels) {
    const ctx = document.getElementById(this.identifier + "-temp-chart");
    if (!ctx) return;

    const datasets = [
      {
        label: "Temperature",
        data: hours.map((h) => h.temp),
        borderColor: this.config.temperatureColor,
        backgroundColor: this.config.temperatureColor + "33",
        tension: 0.3,
        fill: true,
        pointRadius: 0,
        borderWidth: 2
      }
    ];

    if (this.config.showFeelsLike) {
      datasets.push({
        label: "Feels Like",
        data: hours.map((h) => h.feels_like),
        borderColor: this.config.feelsLikeColor,
        backgroundColor: "transparent",
        tension: 0.3,
        fill: false,
        pointRadius: 0,
        borderWidth: 2,
        borderDash: [5, 5]
      });
    }

    this.charts.temp = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: datasets
      },
      options: this.getChartOptions("Temperature")
    });
  },

  renderWindChart: function (hours, labels) {
    const ctx = document.getElementById(this.identifier + "-wind-chart");
    if (!ctx) return;

    this.charts.wind = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Wind Gust",
            data: hours.map((h) => h.wind_gust || null),
            backgroundColor: this.config.gustColor,
            borderWidth: 0,
            barPercentage: 0.9,
            categoryPercentage: 0.9
          },
          {
            label: "Wind Speed",
            data: hours.map((h) => h.wind_speed),
            backgroundColor: this.config.windColor,
            borderWidth: 0,
            barPercentage: 0.7,
            categoryPercentage: 0.9
          }
        ]
      },
      options: this.getChartOptions("Wind")
    });
  },

  renderPrecipitationChart: function (hours, labels) {
    const ctx = document.getElementById(this.identifier + "-precip-chart");
    if (!ctx) return;

    const baseOptions = this.getChartOptions("Precipitation");
    this.charts.precip = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Precipitation %",
            data: hours.map((h) => (h.pop || 0) * 100),
            backgroundColor: this.config.precipitationColor,
            borderWidth: 0,
            barPercentage: 0.8,
            categoryPercentage: 0.9
          }
        ]
      },
      options: {
        ...baseOptions,
        scales: {
          ...baseOptions.scales,
          y: {
            ...baseOptions.scales.y,
            min: 0,
            max: 100
          }
        }
      }
    });
  },

  getChartOptions: function (title) {
    return {
      responsive: false,
      maintainAspectRatio: false,
      animation: this.config.animateCharts ? {} : false,
      plugins: {
        legend: {
          display: title === "Temperature" && this.config.showFeelsLike,
          position: "top",
          labels: {
            color: "#999",
            font: { size: 10 },
            boxWidth: 20,
            padding: 5
          }
        },
        title: {
          display: true,
          text: title,
          color: "#999",
          font: { size: 12 }
        }
      },
      scales: {
        x: {
          grid: {
            display: this.config.showGridLines,
            color: "#333"
          },
          ticks: {
            color: "#999",
            maxTicksLimit: 12,
            font: { size: 10 }
          }
        },
        y: {
          grid: {
            display: this.config.showGridLines,
            color: "#333"
          },
          ticks: {
            color: "#999",
            font: { size: 10 }
          }
        }
      }
    };
  },

  formatHour: function (timestamp) {
    if (!timestamp || isNaN(timestamp)) return "--";
    const date = new Date(timestamp * 1000);
    if (isNaN(date.getTime())) return "--";
    const hour = date.getHours();
    const ampm = hour >= 12 ? "p" : "a";
    const hour12 = hour % 12 || 12;
    return hour12 + ampm;
  }
});
