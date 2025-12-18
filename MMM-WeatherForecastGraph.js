/* MagicMirror² Module: MMM-WeatherForecastGraph
 * Displays 48-hour weather forecast graphs for temperature, wind, and precipitation.
 * Fetches data directly from weather.gov API.
 */

Module.register("MMM-WeatherForecastGraph", {
  defaults: {
    latitude: null,
    longitude: null,
    updateInterval: 900000, // 15 minutes
    units: "imperial", // or "metric"
    width: 800,
    height: 450,
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
    precipitationColor: "#00CED1",
    precipitationAmountColor: "#1E90FF"
  },

  weatherData: null,
  precipitationPeriods: [],
  charts: {},
  // Flag to prevent duplicate chart renders during async DOM updates
  renderPending: false,
  // Error message from API failures
  errorMessage: null,

  getStyles: function () {
    return [this.file("MMM-WeatherForecastGraph.css")];
  },

  getScripts: function () {
    return [
      this.file("node_modules/chart.js/dist/chart.umd.js"),
      this.file("node_modules/chartjs-plugin-annotation/dist/chartjs-plugin-annotation.min.js")
    ];
  },

  start: function () {
    Log.info("Starting module: " + this.name);
    // Validate config bounds
    this.config.hoursToShow = Math.max(1, Math.min(48, this.config.hoursToShow));

    // Validate required config
    if (!this.config.latitude || !this.config.longitude) {
      Log.error(this.name + ": latitude and longitude are required in config");
      return;
    }

    // Send config to node_helper to initiate data fetching
    this.sendSocketNotification("CONFIG", {
      ...this.config,
      instanceId: this.identifier
    });
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

  socketNotificationReceived: function (notification, payload) {
    if (payload.instanceId !== this.identifier) return;

    if (notification === "WEATHER_GRAPH_DATA") {
      this.errorMessage = null;
      this.weatherData = payload.data;
      this.precipitationPeriods = payload.data.precipitationPeriods || [];
      this.updateDom(this.config.updateFadeSpeed);
    } else if (notification === "WEATHER_GRAPH_ERROR") {
      this.errorMessage = payload.error;
      this.updateDom(this.config.updateFadeSpeed);
    }
  },

  getDom: function () {
    const wrapper = document.createElement("div");
    wrapper.className = "weather-graph-wrapper";
    wrapper.style.width = this.config.width + "px";

    // Show config error if lat/lon not set
    if (!this.config.latitude || !this.config.longitude) {
      wrapper.innerHTML = "<span class='dimmed'>Please configure latitude and longitude in config.js</span>";
      return wrapper;
    }

    // Show API error if fetch failed
    if (this.errorMessage) {
      wrapper.innerHTML = "<span class='dimmed'>Weather API error: " + this.errorMessage + "</span>";
      return wrapper;
    }

    if (!this.weatherData || !this.weatherData.hourly) {
      wrapper.innerHTML = "<span class='dimmed'>Loading weather data...</span>";
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

    // Render charts after DOM fade animation completes
    // Use updateFadeSpeed + buffer to ensure DOM is fully ready
    if (!this.renderPending) {
      this.renderPending = true;
      setTimeout(() => {
        this.renderPending = false;
        this.renderCharts();
      }, this.config.updateFadeSpeed + 100);
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
    const canvas = document.getElementById(this.identifier + "-temp-chart");
    if (!canvas) return;

    const datasets = [
      {
        label: "Temperature",
        data: hours.map((h) => h.temp),
        borderColor: this.config.temperatureColor,
        backgroundColor: this.config.temperatureColor + "33", // 33 hex = ~20% opacity
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

    this.charts.temp = new Chart(canvas, {
      type: "line",
      data: {
        labels: labels,
        datasets: datasets
      },
      options: this.getChartOptions("Temperature")
    });
  },

  renderWindChart: function (hours, labels) {
    const canvas = document.getElementById(this.identifier + "-wind-chart");
    if (!canvas) return;

    this.charts.wind = new Chart(canvas, {
      type: "bar",
      data: {
        labels: labels,
        // Gust bars wider (0.9) to appear behind narrower wind speed bars (0.7)
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
    const canvas = document.getElementById(this.identifier + "-precip-chart");
    if (!canvas) return;

    // Build annotations for precipitation amount periods
    const annotations = {};
    // Fixed height of 30 (30% of y-axis 0-100 scale) - label shows the amount value
    const fixedHeight = 30;

    this.precipitationPeriods.forEach((period, idx) => {
      // Format label based on units: inches (") or mm
      const unitSymbol = period.units === "imperial" ? '"' : "mm";
      const labelContent = period.amount.toFixed(2) + unitSymbol;

      annotations["precip" + idx] = {
        type: "box",
        xMin: period.startIndex - 0.5,
        xMax: period.endIndex - 0.5,
        yMin: 0,
        yMax: fixedHeight,
        backgroundColor: this.config.precipitationAmountColor + "66", // 66 hex = 40% opacity
        borderColor: this.config.precipitationAmountColor,
        borderWidth: 1,
        label: {
          display: period.amount >= period.displayThreshold,
          content: labelContent,
          color: "#fff",
          font: { size: 9, weight: "bold" },
          position: "center"
        }
      };
    });

    const baseOptions = this.getChartOptions("Precipitation");
    const self = this;

    this.charts.precip = new Chart(canvas, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Chance %",
            data: hours.map((h) => (h.pop || 0) * 100),
            backgroundColor: this.config.precipitationColor + "99", // 99 hex = 60% opacity
            borderWidth: 0,
            barPercentage: 0.8,
            categoryPercentage: 0.9
          }
        ]
      },
      options: {
        ...baseOptions,
        plugins: {
          ...baseOptions.plugins,
          legend: {
            display: true,
            position: "right",
            labels: {
              color: "#999",
              font: { size: 10 },
              boxWidth: 20,
              padding: 5,
              generateLabels: function (chart) {
                const original = Chart.defaults.plugins.legend.labels.generateLabels(chart);
                if (self.precipitationPeriods.length > 0) {
                  original.push({
                    text: "Amount",
                    fillStyle: self.config.precipitationAmountColor + "66",
                    strokeStyle: self.config.precipitationAmountColor,
                    lineWidth: 1,
                    hidden: false
                  });
                }
                return original;
              }
            }
          },
          annotation: {
            annotations: annotations
          }
        },
        scales: {
          ...baseOptions.scales,
          y: {
            ...baseOptions.scales.y,
            min: 0,
            max: 100,
            title: {
              display: true,
              text: "Chance %",
              color: "#999",
              font: { size: 10 }
            }
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
          // Show legend for multi-dataset charts (Temperature with feels-like, Wind with gusts)
          display: (title === "Temperature" && this.config.showFeelsLike) || title === "Wind",
          position: "right",
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
          },
          grace: "5%"
        }
      }
    };
  },

  formatHour: function (timestamp) {
    if (timestamp == null || isNaN(timestamp)) return "--";
    const date = new Date(timestamp * 1000);
    if (isNaN(date.getTime())) return "--";
    const hour = date.getHours();
    // Show weekday abbreviation at midnight as day marker
    if (hour === 0) {
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      return days[date.getDay()];
    }
    const ampm = hour >= 12 ? "p" : "a";
    const hour12 = hour % 12 || 12;
    return hour12 + ampm;
  }
});
