export default function StatusHeader({ status, onRefresh, refreshing }) {
  const lastSeen = status.lastScrapedAt
    ? new Date(status.lastScrapedAt).toLocaleString('en-SG')
    : 'Never'

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22 }}>ActiveSG Slots</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: status.success ? '#666' : '#c00' }}>
          {status.success
            ? `Last updated: ${lastSeen}`
            : `Last check failed — showing stale data from ${lastSeen}`}
        </p>
      </div>
      <button
        onClick={onRefresh}
        disabled={refreshing}
        style={{ padding: '8px 16px', cursor: refreshing ? 'not-allowed' : 'pointer', marginTop: 4 }}
      >
        {refreshing ? 'Refreshing…' : 'Refresh Now'}
      </button>
    </div>
  )
}
