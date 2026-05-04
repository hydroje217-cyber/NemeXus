function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function metricForReading(reading) {
  if (reading.site_type === 'CHLORINATION') {
    return reading.totalizer
      ? `${Number(reading.totalizer).toLocaleString()} totalizer`
      : 'Chlorination reading';
  }

  if (reading.flowrate_m3hr) {
    return `${Number(reading.flowrate_m3hr).toLocaleString()} m3/hr`;
  }

  return 'Deepwell reading';
}

export default function ReadingsScreen({ title = 'Readings', meta, readings }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h3>{title}</h3>
        <span>{meta ?? `${readings.length} recent`}</span>
      </div>

      {!readings.length ? (
        <div className="empty-state">No readings found.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Site</th>
                <th>Type</th>
                <th>Submitted By</th>
                <th>Reading Time</th>
                <th>Metric</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {readings.map((reading) => (
                <tr key={`${reading.site_type}-${reading.id}`}>
                  <td>{reading.site?.name || '-'}</td>
                  <td>{reading.site_type}</td>
                  <td>{reading.submitted_profile?.full_name || reading.submitted_profile?.email || '-'}</td>
                  <td>{formatDateTime(reading.reading_datetime || reading.created_at)}</td>
                  <td>{metricForReading(reading)}</td>
                  <td>
                    <span className="badge">{reading.status || 'submitted'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
