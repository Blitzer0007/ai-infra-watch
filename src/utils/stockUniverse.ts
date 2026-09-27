import config from '../../data/stock_watchlist.json';

export type StockUniverseEntry = {
  symbol: string;
  name: string;
  group: string;
  theme: string;
  peers: string[];
  geo: string;
};

export const STOCK_UNIVERSE = config.watchlist as StockUniverseEntry[];
export const STOCK_UNIVERSE_SYMBOLS = STOCK_UNIVERSE.map((item) => item.symbol);

export const STOCK_GROUPS = Array.from(
  STOCK_UNIVERSE.reduce((map, item) => {
    const members = map.get(item.group) ?? [];
    members.push(item.symbol);
    map.set(item.group, members);
    return map;
  }, new Map<string, string[]>()).entries(),
);
