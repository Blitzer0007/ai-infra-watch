/** URL-only view state. Never serializes position values, notes or editing drafts. */
export const HOLDING_FILTERS = ['All','Up today','Down today','Below your buy price','Needs attention'] as const;
export const HOLDING_SORTS = ['Symbol','Return %','Today','Value','Attention'] as const;
export type HoldingFilter = typeof HOLDING_FILTERS[number];
export type HoldingSort = typeof HOLDING_SORTS[number];
export const validHoldingSymbol = (value:unknown):value is string => typeof value==='string'&&/^[A-Z][A-Z0-9.-]{0,14}$/.test(value);
export function readHoldingNavigation(params:URLSearchParams) {
  const filter=params.get('portfolio_status'),sort=params.get('portfolio_sort'),detail=params.get('portfolio_detail');
  return {filter:HOLDING_FILTERS.find(value=>value===filter)||'All',sort:HOLDING_SORTS.find(value=>value===sort)||'Symbol',
    detail:params.get('portfolio_tab')==='holdings'&&validHoldingSymbol(detail)?detail:null};
}
export function writeHoldingNavigation(params:URLSearchParams,view:{filter:HoldingFilter;sort:HoldingSort;detail:string|null}) {
  const next=new URLSearchParams(params);
  if(view.filter==='All')next.delete('portfolio_status');else next.set('portfolio_status',view.filter);
  if(view.sort==='Symbol')next.delete('portfolio_sort');else next.set('portfolio_sort',view.sort);
  if(next.get('portfolio_tab')==='holdings'&&validHoldingSymbol(view.detail))next.set('portfolio_detail',view.detail);else next.delete('portfolio_detail');
  return next;
}
