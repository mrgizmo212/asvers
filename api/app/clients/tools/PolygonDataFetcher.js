const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { getEnvironmentVariable } = require('@langchain/core/utils/env');
const fetch = require('node-fetch'); // Assuming node-fetch is used for HTTP requests

class PolygonDataFetcher extends Tool {
  static lc_name() {
    return 'PolygonDataFetcher';
  }

  constructor(fields = {}) {
    super(fields);
    this.envVar = 'POLYGON_API_KEY';
    this.apiKey = fields.apiKey ?? this.getApiKey();
    this.baseUrl = 'https://api.polygon.io';
  }

  getApiKey() {
    const apiKey = getEnvironmentVariable(this.envVar);
    if (!apiKey) {
      throw new Error(`Missing ${this.envVar} environment variable.`);
    }
    return apiKey;
  }

  // Example method to fetch daily open/close for a stock
  async getStockDailyOpenClose(stocksTicker, date) {
    const endpoint = `/v1/open-close/${stocksTicker}/${date}`;
    const url = `${this.baseUrl}${endpoint}?apiKey=${this.apiKey}`;
    return this.fetchData(url);
  }

  // Example method to fetch previous day's OHLC for a stock
  async getStockPreviousClose(stocksTicker) {
    const endpoint = `/v2/aggs/ticker/${stocksTicker}/prev`;
    const url = `${this.baseUrl}${endpoint}?apiKey=${this.apiKey}`;
    return this.fetchData(url);
  }

  // Method to fetch the most up-to-date market data for a single traded stock ticker
  async getStockTickerData(stocksTicker, includeLastQuote = false, includeLastTrade = false, includePrevDay = false, includeMin = false) {
    const endpoint = `/v2/snapshot/locale/us/markets/stocks/tickers/${stocksTicker}`;
    let queryParams = `?apiKey=${this.apiKey}`;
    queryParams += includeLastQuote ? '&includeLastQuote=true' : '';
    queryParams += includeLastTrade ? '&includeLastTrade=true' : '';
    queryParams += includePrevDay ? '&includePrevDay=true' : '';
    queryParams += includeMin ? '&includeMin=true' : '';
    const url = `${this.baseUrl}${endpoint}${queryParams}`;
    return this.fetchData(url);
  }

  // General method to perform fetch operations
  async fetchData(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}: ${await response.text()}`);
    }
    return response.json();
  }

  // Additional methods for other endpoints can be added here following the same pattern
}

module.exports = PolygonDataFetcher;
