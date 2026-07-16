// Top Alert Zones — accessible horizontal CSS bars (no chart library).
// Shows the five zones with the most DetectionAlerts over the last seven Singapore
// days, descending, with the real count beside each bar. Long zone names wrap/truncate
// accessibly (the full name stays available via title + the bar's aria-label).
const TopAlertZonesChart = ({ data = [] }) => {
  const zones = Array.isArray(data) ? data : [];
  const max = zones.reduce((m, z) => Math.max(m, Number(z.count) || 0), 0) || 1;

  return (
    <section className="analytics-panel" aria-labelledby="top-zones-heading">
      <div className="analytics-panel-head">
        <h3 id="top-zones-heading">Top Alert Zones</h3>
        <span className="analytics-subtle" aria-hidden="true">Last 7 days</span>
      </div>

      {zones.length === 0 ? (
        <p className="analytics-empty">No detection-alert history in the last seven days.</p>
      ) : (
        <ul className="zones-list">
          {zones.map((z) => {
            const count = Number(z.count) || 0;
            return (
              <li className="zone-row" key={z.zone}>
                <span className="zone-name" title={z.zone}>{z.zone}</span>
                <span className="zone-bar-track" aria-hidden="true">
                  <span className="zone-bar" style={{ width: `${(count / max) * 100}%` }} />
                </span>
                <span className="zone-count" aria-label={`${z.zone}: ${count} alerts`}>{count}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export default TopAlertZonesChart;
