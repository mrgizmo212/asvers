const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { getEnvironmentVariable } = require('@langchain/core/utils/env');
const fetch = require('node-fetch');

class PolygonDataFetcher extends Tool {
  static lc_name() {
    return 'PolygonDataFetcher';
  }

  constructor(fields = {}) {
    super(fields);
    this.envVar = 'POLYGON_API_KEY';
    this.override = fields.override ?? false;
    this.apiKey = fields.apiKey ?? this.getApiKey();
    this.baseUrl = 'https://api.polygon.io';
    this.name = 'polygon_data_fetcher';

    this.schema = z.object({
      action: z.enum(['getStockDailyOpenClose', 'getStockPreviousClose', 'getStockTickerData']),
      stocksTicker: z.string().min(1),
      date: z.string().optional(),
      includeLastQuote: z.boolean().optional(),
      includeLastTrade: z.boolean().optional(),
      includePrevDay: z.boolean().optional(),
      includeMin: z.boolean().optional(),
    });
  }

  getApiKey() {
    const apiKey = getEnvironmentVariable(this.envVar);
    if (!apiKey && !this.override) {
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
  async getStockTickerData(
    stocksTicker, includeLastQuote = false, includeLastTrade = false, includePrevDay = false, includeMin = false,
  ) {
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

  async _call(input) {
    const validationResult = this.schema.safeParse(input);
    if (!validationResult.success) {
      throw new Error(`Validation failed: ${JSON.stringify(validationResult.error.issues)}`);
    }

    const { action, stocksTicker, date, includeLastQuote, includeLastTrade, includePrevDay, includeMin } = validationResult.data;
    
    switch (action) {
      case 'getStockDailyOpenClose':
        return await this.getStockDailyOpenClose(stocksTicker, date);
      case 'getStockPreviousClose':
        return await this.getStockPreviousClose(stocksTicker);
      case 'getStockTickerData':
        return await this.getStockTickerData(stocksTicker, includeLastQuote, includeLastTrade, includePrevDay, includeMin);
      default:
        throw new Error('Invalid action specified');
    }
  }
}

module.exports = PolygonDataFetcher;
