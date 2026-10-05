        if (!res.ok) throw new Error('Verification market data failed for ' + forecast.ticker + ' (HTTP ' + res.status + ')');
        const data = await res.json();
        const points: PricePoint[] = Array.isArray(data.points) ? data.points : [];
        const point = points.find(p => p.date >= forecast.targetDate);
        if (!point || !(forecast.entryPrice > 0) || !(point.price > 0)) continue;
        const actualReturn = (point.price / forecast.entryPrice - 1) * 100;
        const patch = {
          id: forecast.id, status: 'verified', verifiedAt: new Date().toISOString(),
          actualDate: point.date, actualPrice: point.price, actualReturn,
          medianError: actualReturn - forecast.median
        };
        const savedResponse = await fetch('/api/forecast-verification', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch)
        });
        if (!savedResponse.ok) throw new Error('Database verification failed for ' + forecast.ticker + ' (HTTP ' + savedResponse.status + ')');
        const savedBody = await savedResponse.json();
        const verified = savedBody?.forecast || { ...forecast, ...patch };
        const index = updated.findIndex(f => f.id === forecast.id);
        if (index >= 0) updated[index] = verified;
      }
      setForecasts(updated); saveForecasts(updated);
      setVerificationMessage('Verification complete using real market history and the persistent database.');
    } catch (err: any) {
      setVerificationMessage(err?.message || 'Forecast verification failed.');
    } finally { setVerificationBusy(false); }
  };

  const runBacktest = async () => {
    if (loading || history.length < 220 + horizon) return;
    setBacktestBusy(true);
    setBacktestMessage(null);
    try {
      const result = historicalBacktest(history, horizon);
      setBacktest(result);
      setBacktestMessage(
        result.rows.length
          ? 'Backtest complete. Each test date uses only market data available before that date.'
          : 'Not enough historical observations to produce a backtest for this horizon.'
      );
    } catch (err: any) {
      setBacktest(null);
      setBacktestMessage(err?.message || 'Backtest failed.');
    } finally {
      setBacktestBusy(false);
    }
  };

  useEffect(() => {
    if (!loading && history.length >= 220 + horizon && !backtestBusy) {
      void runBacktest();
    }
  }, [selectedStock, horizon, history.length, loading]);

  const runValidationMatrix = async () => {
    if (matrixBusy) return;
    setMatrixBusy(true);
    setMatrix(null);
    setMatrixMessage(null);
    const tickers = ['NVDA','MSFT','MU','AVGO','AMD','TSM','META','NBIS'];
    try {
      const histories = await Promise.all(tickers.map(async ticker => {
        const response = await fetch('/api/company-scale?action=history&symbol=' + encodeURIComponent(ticker) + '&range=5y');
        if (!response.ok) throw new Error(ticker + ' history failed (HTTP ' + response.status + ')');
        const body = await response.json();
        return { ticker, points: Array.isArray(body.points) ? body.points : [] };
      }));
      const summaryRows = histories.flatMap(item => HORIZONS.map(h => ({ ticker: item.ticker, horizon: h.days, summary: historicalBacktest(item.points, h.days) })));
      const summary = summarizeValidationMatrix(summaryRows);
      setMatrix(summary);
      setMatrixMessage('Validation matrix complete: ' + histories.length + ' tickers × ' + HORIZONS.length + ' horizons. Results are descriptive averages across valid ticker/horizon backtests.');
    } catch (err: any) {
      setMatrixMessage(err?.message || 'Validation matrix failed.');