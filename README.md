# nhs-conditions
Example API implementation and NLP using Node. Exposes an HTTP API that allows searching for conditions in natural language, returning the most appropriate NHS pages.

load-nhs-data.js scrapes the site and caches the information locally

nhs-search-server.js runs an HTTP API that takes queries and redirects to the most appropriate NHS page
