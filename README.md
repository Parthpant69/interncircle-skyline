# Skyline | Live Weather

InternCircle Fullstack Web Development, Project 04. Skyline uses the Open-Meteo geocoding and forecast APIs to show current conditions and five forecast days for a city.

## Run locally

Open `index.html` using VS Code Live Server or another local HTTP server. The app is built with HTML, CSS, and JavaScript. It needs an internet connection for weather data.

Search by city name with Enter or the Search button, or use a suggested city. You can qualify a city with a country, for example “Paris, France”. The app remembers your last successful search in the same browser.

## Error-handling note for submission

I validate the city before making a request and disable the search controls while a lookup is running. I check each HTTP response before parsing JSON and display separate messages for an unknown city, a network problem, a timeout, or an unavailable weather service. A failed lookup keeps the last successful forecast visible.

## InternCircle submission

Include a public live app link, a public code link, and the error-handling note above.

## Data sources

- [Open-Meteo Forecast API](https://open-meteo.com/en/docs)
- [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api)
