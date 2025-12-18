# MMM-WeatherForecastGraph

A MagicMirror² module that displays 48-hour weather forecast graphs for temperature, wind, and precipitation.

## Screenshot

*Screenshot placeholder*

## Prerequisites

This module requires **MMM-OpenWeatherForecast** to be installed and configured. It listens for the `OPENWEATHER_FORECAST_WEATHER_UPDATE` notification broadcast by that module.

## Installation

```bash
cd ~/MagicMirror/modules
git clone https://github.com/Techneaux/MMM-WeatherForecastGraph
cd MMM-WeatherForecastGraph
npm install
```

## Configuration

Add the following to your `config/config.js` file:

```javascript
{
  module: "MMM-WeatherForecastGraph",
  position: "bottom_center",
  config: {
    width: 600,
    height: 300,
    hoursToShow: 48
  }
}
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `width` | Number | `600` | Chart width in pixels |
| `height` | Number | `300` | Total height for all charts combined (divided among visible charts) |
| `showTemperature` | Boolean | `true` | Show the temperature chart |
| `showFeelsLike` | Boolean | `true` | Show "feels like" temperature line on the temperature chart |
| `showWind` | Boolean | `true` | Show the wind chart |
| `showPrecipitation` | Boolean | `true` | Show the precipitation chart |
| `showGridLines` | Boolean | `true` | Show grid lines on charts |
| `animateCharts` | Boolean | `false` | Enable chart animations (disable for better performance on Raspberry Pi) |
| `updateFadeSpeed` | Number | `500` | DOM update fade animation speed in milliseconds |
| `hoursToShow` | Number | `48` | Number of hours to display (max 48) |
| `temperatureColor` | String | `"#FFA500"` | Color for temperature line (orange) |
| `feelsLikeColor` | String | `"#FF6347"` | Color for feels-like temperature line (tomato red) |
| `windColor` | String | `"#4682B4"` | Color for wind speed bars (steel blue) |
| `gustColor` | String | `"#1E3A5F"` | Color for wind gust bars (dark blue) |
| `precipitationColor` | String | `"#00CED1"` | Color for precipitation bars (dark turquoise) |

## Charts

### Temperature Chart
- Line chart showing actual temperature (solid line) and "feels like" temperature (dashed line)
- Temperature units match your MMM-OpenWeatherForecast configuration

### Wind Chart
- Bar chart showing wind speed and wind gusts
- Gusts displayed as wider bars behind wind speed bars
- Speed units match your MMM-OpenWeatherForecast configuration

### Precipitation Chart
- Bar chart showing probability of precipitation (0-100%)

## Example Configurations

### Minimal (24-hour forecast)
```javascript
{
  module: "MMM-WeatherForecastGraph",
  position: "bottom_center",
  config: {
    hoursToShow: 24
  }
}
```

### Temperature only
```javascript
{
  module: "MMM-WeatherForecastGraph",
  position: "bottom_right",
  config: {
    width: 400,
    height: 150,
    showWind: false,
    showPrecipitation: false
  }
}
```

### Custom colors
```javascript
{
  module: "MMM-WeatherForecastGraph",
  position: "bottom_center",
  config: {
    temperatureColor: "#FF5733",
    feelsLikeColor: "#C70039",
    windColor: "#3498DB",
    gustColor: "#1A5276",
    precipitationColor: "#2ECC71"
  }
}
```

## Dependencies

- [Chart.js](https://www.chartjs.org/) v4.4+ (installed automatically via npm)
- [MMM-OpenWeatherForecast](https://github.com/jclarke0000/MMM-OpenWeatherForecast) (must be installed separately)

## License

MIT License
