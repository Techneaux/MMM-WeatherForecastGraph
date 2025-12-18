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
    precipitationAmountColor: "#1E90FF",
    snowAmountColor: "#87CEEB"  // Light sky blue for snow
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
      this.file("node_modules/chartjs-plugin-annotation/dist/chartjs-plugin-annotation.min.js"),
      this.file("node_modules/chartjs-plugin-datalabels/dist/chartjs-plugin-datalabels.min.js")
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

  // Plugin to force fixed legend width for chart alignment
  legendFixedWidthPlugin: {
    id: "legendFixedWidth",
    beforeInit: function (chart) {
      const originalFit = chart.legend.fit;
      chart.legend.fit = function () {
        originalFit.call(this);
        this.width = 100; // Fixed width for all legends
      };
    }
  },

  renderCharts: function () {
    if (!this.weatherData || !this.weatherData.hourly) return;

    // Ensure plugins are registered (may not auto-register in MagicMirror context)
    if (window.ChartAnnotation && !Chart.registry.plugins.get("annotation")) {
      Chart.register(window.ChartAnnotation);
    }
    if (window.ChartDataLabels && !Chart.registry.plugins.get("datalabels")) {
      Chart.register(window.ChartDataLabels);
    }
    if (!Chart.registry.plugins.get("legendFixedWidth")) {
      Chart.register(this.legendFixedWidthPlugin);
    }

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
        backgroundColor: "transparent",
        tension: 0.3,
        fill: false,
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

    const tempOptions = this.getChartOptions("Temperature");
    tempOptions.plugins.datalabels = {
      display: function(context) {
        // Show label every 4 hours to align with x-axis ticks
        return context.dataIndex % 4 === 0;
      },
      color: '#999',
      anchor: 'end',
      align: 'top',
      offset: 2,
      font: { size: 9 },
      formatter: function(value) {
        return value !== null ? Math.round(value) + '°' : '';
      }
    };
    // Add midnight vertical line annotations
    tempOptions.plugins.annotation = {
      annotations: this.getMidnightAnnotations(hours)
    };

    this.charts.temp = new Chart(canvas, {
      type: "line",
      data: {
        labels: labels,
        datasets: datasets
      },
      options: tempOptions
    });
  },

  renderWindChart: function (hours, labels) {
    const canvas = document.getElementById(this.identifier + "-wind-chart");
    if (!canvas) return;

    const windOptions = this.getChartOptions("Wind");
    windOptions.plugins.datalabels = {
      display: function(context) {
        // Show label every 4 hours to align with x-axis ticks
        // Only show for first dataset (Wind Speed) to avoid clutter
        return context.dataIndex % 4 === 0 && context.datasetIndex === 0;
      },
      color: '#999',
      anchor: 'end',
      align: 'top',
      offset: 2,
      font: { size: 9 },
      formatter: function(value) {
        return value !== null ? Math.round(value) : '';
      }
    };
    // Add midnight vertical line annotations
    windOptions.plugins.annotation = {
      annotations: this.getMidnightAnnotations(hours)
    };

    this.charts.wind = new Chart(canvas, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Wind Speed",
            data: hours.map((h) => h.wind_speed),
            borderColor: this.config.windColor,
            backgroundColor: "transparent",
            tension: 0.3,
            fill: false,
            pointRadius: 0,
            borderWidth: 2
          },
          {
            label: "Wind Gust",
            data: hours.map((h) => h.wind_gust || null),
            borderColor: this.config.gustColor,
            backgroundColor: "transparent",
            tension: 0.3,
            fill: false,
            pointRadius: 0,
            borderWidth: 2,
            borderDash: [5, 5]
          }
        ]
      },
      options: windOptions
    });
  },

  renderPrecipitationChart: function (hours, labels) {
    const canvas = document.getElementById(this.identifier + "-precip-chart");
    if (!canvas) return;

    // Build annotations: midnight lines + precipitation amount boxes
    const annotations = this.getMidnightAnnotations(hours);
    // Fixed height of 30 (30% of y-axis 0-100 scale) - label shows the amount value
    const fixedHeight = 30;

    this.precipitationPeriods.forEach((period, idx) => {
      // Only show box if amount is above display threshold
      if (period.amount < period.displayThreshold) return;

      // Format label based on units: inches (") or mm
      const unitSymbol = period.units === "imperial" ? '"' : "mm";
      const labelContent = period.amount.toFixed(2) + unitSymbol;

      // Use different colors for rain vs snow
      const isSnow = period.type === "snow";
      const boxColor = isSnow ? this.config.snowAmountColor : this.config.precipitationAmountColor;

      annotations["precip" + idx] = {
        type: "box",
        xMin: period.startIndex - 0.5,
        xMax: period.endIndex - 0.5,
        yMin: 0,
        yMax: fixedHeight,
        backgroundColor: boxColor + "66", // 66 hex = 40% opacity
        borderColor: boxColor,
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
          datalabels: { display: false },
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
                // Check if we have rain or snow periods to show in legend
                const hasRain = self.precipitationPeriods.some(p => p.type === "rain");
                const hasSnow = self.precipitationPeriods.some(p => p.type === "snow");

                if (hasRain) {
                  original.push({
                    text: "Rain",
                    fillStyle: self.config.precipitationAmountColor + "66",
                    strokeStyle: self.config.precipitationAmountColor,
                    lineWidth: 1,
                    hidden: false
                  });
                }
                if (hasSnow) {
                  original.push({
                    text: "Snow",
                    fillStyle: self.config.snowAmountColor + "66",
                    strokeStyle: self.config.snowAmountColor,
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
          x: {
            ...baseOptions.scales.x,
            offset: false,  // Align grid lines with labels like line charts
            grid: {
              ...baseOptions.scales.x.grid,
              offset: false
            }
          },
          y: {
            ...baseOptions.scales.y,
            min: 0,
            max: 100
          }
        }
      }
    });
  },

  getMidnightIndices: function (hours) {
    const indices = [];
    hours.forEach((h, idx) => {
      const date = new Date(h.dt * 1000);
      if (date.getHours() === 0) {
        indices.push(idx);
      }
    });
    return indices;
  },

  getMidnightAnnotations: function (hours) {
    const annotations = {};
    this.getMidnightIndices(hours).forEach((idx, i) => {
      annotations["midnight" + i] = {
        type: "line",
        xMin: idx,
        xMax: idx,
        borderColor: "#555",
        borderWidth: 1,
        borderDash: [4, 4]
      };
    });
    return annotations;
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
            font: { size: 10 },
            autoSkip: false,
            maxRotation: 0,
            callback: function (value, index) {
              const label = this.getLabelForValue(value);
              // Check if this is a day name (Sat contains 'a', so can't use includes check)
              const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
              const isDayLabel = dayNames.includes(label);
              // At midnight, show day name on second line (first line blank)
              if (isDayLabel) {
                return ["", label];
              }
              // Show regular hours every 4 hours
              if (index % 4 === 0) {
                return label;
              }
              return null;
            }
          }
        },
        y: {
          afterFit: function (scaleInstance) {
            scaleInstance.width = 40;  // Fixed width to align all charts
          },
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
