# MMM-WeatherForecastGraph

A MagicMirror² module that displays 48-hour weather forecast graphs for temperature, wind, and precipitation. Fetches data directly from the weather.gov API (no API key required).

## Screenshot

*Screenshot placeholder*

## Features

- Temperature chart with actual and "feels like" temperatures
- Wind chart showing wind speed and gusts
- Precipitation chart showing probability AND expected amounts
- Precipitation amounts displayed as spanning bars over their forecast periods
- No external API key required (uses free weather.gov API)
- US locations only (weather.gov coverage)

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
    latitude: 40.7128,    // Required: Your latitude
    longitude: -74.0060,  // Required: Your longitude
    units: "imperial"     // "imperial" (°F, mph) or "metric" (°C, km/h)
  }
}
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `latitude` | Number | `null` | **Required**: Your location's latitude |
| `longitude` | Number | `null` | **Required**: Your location's longitude |
| `units` | String | `"imperial"` | `"imperial"` (°F, mph, inches) or `"metric"` (°C, km/h, mm) |
| `updateInterval` | Number | `900000` | Data refresh interval in ms (default: 15 minutes) |
| `width` | Number | `800` | Chart width in pixels |
| `height` | Number | `450` | Total height for all charts combined (divided among visible charts) |
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
| `precipitationColor` | String | `"#00CED1"` | Color for precipitation chance bars (dark turquoise) |
| `precipitationAmountColor` | String | `"#1E90FF"` | Color for precipitation amount bars (dodger blue) |

## Charts

### Temperature Chart
- Line chart showing actual temperature (solid line) and "feels like" temperature (dashed line)
- Units based on your `units` configuration

### Wind Chart
- Bar chart showing wind speed and wind gusts
- Gusts displayed as wider bars behind wind speed bars

### Precipitation Chart
- **Teal bars**: Probability of precipitation (0-100%) - hourly
- **Blue spanning rectangles**: Expected precipitation amounts, spanning their actual forecast periods (e.g., 6-hour blocks)
- Amount labels shown on rectangles (e.g., "0.52"")

## Example Configurations

### Basic (NYC)
```javascript
{
  module: "MMM-WeatherForecastGraph",
  position: "bottom_center",
  config: {
    latitude: 40.7128,
    longitude: -74.0060
  }
}
```

### 24-hour forecast with metric units
```javascript
{
  module: "MMM-WeatherForecastGraph",
  position: "bottom_center",
  config: {
    latitude: 34.0522,
    longitude: -118.2437,
    units: "metric",
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
    latitude: 41.8781,
    longitude: -87.6298,
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
    latitude: 47.6062,
    longitude: -122.3321,
    temperatureColor: "#FF5733",
    feelsLikeColor: "#C70039",
    windColor: "#3498DB",
    gustColor: "#1A5276",
    precipitationColor: "#2ECC71",
    precipitationAmountColor: "#27AE60"
  }
}
```

## Finding Your Coordinates

You can find your latitude and longitude at:
- [latlong.net](https://www.latlong.net/)
- Google Maps (right-click on location)

## Dependencies

- [Chart.js](https://www.chartjs.org/) v4.4+ (installed automatically via npm)
- [chartjs-plugin-annotation](https://www.chartjs.org/chartjs-plugin-annotation/) v3.0+ (installed automatically via npm)

## Data Source

This module fetches data directly from the [National Weather Service API](https://www.weather.gov/documentation/services-web-api) (weather.gov). No API key is required, but this means the module only works for US locations.

## License

MIT License
