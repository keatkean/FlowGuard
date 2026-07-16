// Seven-Day Alert Trend — accessible CSS bar chart (no chart library).
// Renders High + Critical DetectionAlert counts for each of the last seven Singapore
// calendar days. Every day is always present (zero-height bars for quiet days). A
// visually-hidden table mirrors the data for screen readers and assistive tech.
const AlertTrendChart = ({ data = [] }) => {
  const days = Array.isArray(data) ? data : [];
  const total = days.reduce((sum, d) => sum + (Number(d.high) || 0) + (Number(d.critical) || 0), 0);
  // Scale bars to the busiest single day so a light week still reads clearly.
  const max = days.reduce((m, d) => Math.max(m, (Number(d.high) || 0) + (Number(d.critical) || 0)), 0) || 1;

  return (
    <section className="analytics-panel" aria-labelledby="alert-trend-heading">
      <div className="analytics-panel-head">
        <h3 id="alert-trend-heading">Seven-Day Alert Trend</h3>
        <div className="analytics-legend" aria-hidden="true">
          <span className="legend-item"><span className="legend-swatch legend-high" /> High</span>
          <span className="legend-item"><span className="legend-swatch legend-critical" /> Critical</span>
        </div>
      </div>

      {days.length === 0 || total === 0 ? (
        <p className="analytics-empty">No high or critical alerts recorded in the last seven days.</p>
      ) : (
        <div
          className="trend-chart"
          role="img"
          aria-label="High and critical detection alerts for each of the last seven Singapore days."
        >
          {days.map((d) => {
            const high = Number(d.high) || 0;
            const critical = Number(d.critical) || 0;
            const dayTotal = high + critical;
            return (
              <div className="trend-day" key={d.date}>
                <span className="trend-count">{dayTotal}</span>
                <div className="trend-bar-stack" aria-hidden="true">
                  <div className="trend-bar trend-bar-critical" style={{ height: `${(critical / max) * 100}%` }} />
                  <div className="trend-bar trend-bar-high" style={{ height: `${(high / max) * 100}%` }} />
                </div>
                <span className="trend-label">{d.label}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Screen-reader data table — carries the exact numeric values behind the bars. */}
      <table className="sr-only">
        <caption>High and critical detection alerts per day (last seven days)</caption>
        <thead>
          <tr><th scope="col">Day</th><th scope="col">High</th><th scope="col">Critical</th></tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={`row-${d.date}`}>
              <th scope="row">{d.label}</th>
              <td>{Number(d.high) || 0}</td>
              <td>{Number(d.critical) || 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};

export default AlertTrendChart;
