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
      stocksTicker: z.string().min(1).describe('Specify a case-sensitive stock ticker symbol.'),
      date: z
        .string()
        .optional()
        .describe(
          'Only for specific dates. The date of the requested open/close in the format YYYY-MM-DD. Defaults to the current date and can be omitted.',
        ),
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
    stocksTicker,
    includeLastQuote = false,
    includeLastTrade = false,
    includePrevDay = false,
    includeMin = false,
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

  formatDate(date) {
    const d = new Date(date);
    let month = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    const year = d.getFullYear();

    if (month.length < 2) {
      month = '0' + month;
    }
    if (day.length < 2) {
      day = '0' + day;
    }

    return [year, month, day].join('-');
  }

  async _call(input) {
    const validationResult = this.schema.safeParse(input);
    if (!validationResult.success) {
      throw new Error(`Validation failed: ${JSON.stringify(validationResult.error.issues)}`);
    }

    let { stocksTicker, date, includeLastQuote, includeLastTrade, includePrevDay, includeMin } =
      validationResult.data;

    if (!date) {
      date = this.formatDate(new Date());
    }

    try {
      let results = {};

      try {
        results.dailyOpenClose = await this.getStockDailyOpenClose(stocksTicker, date);
      } catch (error) {
        results.dailyOpenClose = {
          error: error.message ?? `An error occurred using ${this.name}, likely not a trading day`,
        };
      }

      try {
        results.previousClose = await this.getStockPreviousClose(stocksTicker);
      } catch (error) {
        results.previousClose = {
          error: error.message ?? `An error occurred using ${this.name}, likely not a trading day`,
        };
      }

      try {
        results.tickerData = await this.getStockTickerData(
          stocksTicker,
          includeLastQuote,
          includeLastTrade,
          includePrevDay,
          includeMin,
        );
      } catch (error) {
        results.tickerData = { error: error.message ?? `An error occurred using ${this.name}` };
      }

      // Now `results` contains the response from all three methods
      return JSON.stringify(results);
    } catch (error) {
      return JSON.stringify({ error: error.message ?? `An error occurred using ${this.name}` });
    }
  }
}

module.exports = PolygonDataFetcher;
