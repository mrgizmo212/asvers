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
      date: z.string().optional().describe('Only for specific dates. The date of the requested open/close in the format YYYY-MM-DD. Defaults to the current date and can be omitted.'),
      includeLastQuote: z.boolean().optional(),
      includeLastTrade: z.boolean().optional(),
      includePrevDay: z.boolean().optional(),
      includeMin: z.boolean().optional(),
      // New parameters for aggregate bars
      multiplier: z.number().optional(),
      timespan: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      adjusted: z.boolean().optional(),
      sort: z.string().optional(),
      limit: z.number().optional(),
    });
  }

  getApiKey() {
    const apiKey = getEnvironmentVariable(this.envVar);
    if (!apiKey && !this.override) {
      throw new Error(`Missing ${this.envVar} environment variable.`);
    }
    return apiKey;
  }

  async getStockDailyOpenClose(stocksTicker, date) {
    const endpoint = `/v1/open-close/${stocksTicker}/${date}`;
    const url = `${this.baseUrl}${endpoint}?apiKey=${this.apiKey}`;
    return this.fetchData(url);
  }

  async getStockPreviousClose(stocksTicker) {
    const endpoint = `/v2/aggs/ticker/${stocksTicker}/prev`;
    const url = `${this.baseUrl}${endpoint}?apiKey=${this.apiKey}`;
    return this.fetchData(url);
  }

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

  async getStockAggregates(stocksTicker, multiplier, timespan, from, to, adjusted = true, sort = 'asc', limit = 5000) {
    const endpoint = `/v2/aggs/ticker/${stocksTicker}/range/${multiplier}/${timespan}/${from}/${to}`;
    let queryParams = `?apiKey=${this.apiKey}&adjusted=${adjusted}&sort=${sort}&limit=${limit}`;
    const url = `${this.baseUrl}${endpoint}${queryParams}`;
    return this.fetchData(url);
  }

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

  // Method to format aggregate bars results into a simple table format
  formatAggregatesAsTable(aggregates) {
    let table = 'Volume | VWAP | Open | Close | High | Low | Timestamp | Transactions\n';
    table += '-------|------|------|-------|------|-----|-----------|--------------\n';

    aggregates.results.forEach(result => {
        table += `${result.v} | ${result.vw} | ${result.o} | ${result.c} | ${result.h} | ${result.l} | ${new Date(result.t).toLocaleString()} | ${result.n}\n`;
    });

    return table;
  }

  async _call(input) {
    const validationResult = this.schema.safeParse(input);
    if (!validationResult.success) {
      throw new Error(`Validation failed: ${JSON.stringify(validationResult.error.issues)}`);
    }

    let { stocksTicker, date, includeLastQuote, includeLastTrade, includePrevDay, includeMin } = validationResult.data;

    if (!date) {
      date = this.formatDate(new Date());
    }

    let results = {};

    try {
      if (input.stocksTicker && date) {
        results.dailyOpenClose = await this.getStockDailyOpenClose(stocksTicker, date);
      }
      if (input.stocksTicker) {
        results.previousClose = await this.getStockPreviousClose(stocksTicker);
        results.tickerData = await this.getStockTickerData(stocksTicker, includeLastQuote, includeLastTrade, includePrevDay, includeMin);
      }
      if (input.multiplier && input.timespan && input.from && input.to) {
        const aggregatesResult = await this.getStockAggregates(stocksTicker, input.multiplier, input.timespan, input.from, input.to, input.adjusted, input.sort, input.limit);
        results.aggregates = this.formatAggregatesAsTable(aggregatesResult);
      }
    } catch (error) {
      results.error = error.message ?? `An error occurred using ${this.name}`;
    }

    return JSON.stringify(results);
  }
}

module.exports = PolygonDataFetcher;
