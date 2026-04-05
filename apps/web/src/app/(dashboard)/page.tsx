export default function DashboardPage() {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <StatusCard
          title="System Status"
          value="Healthy"
          subtitle="All providers operational"
          color="success"
        />
        <StatusCard
          title="Last Generation"
          value="--"
          subtitle="No scenes generated yet"
          color="muted"
        />
        <StatusCard
          title="Last Publish"
          value="--"
          subtitle="No scenes published yet"
          color="muted"
        />
      </div>

      <div className="mt-8 rounded-lg border border-frame-border bg-frame-surface p-6">
        <h2 className="mb-4 text-lg font-medium">Getting Started</h2>
        <ol className="list-inside list-decimal space-y-2 text-frame-muted">
          <li>Configure your settings (location, theme, market indicator)</li>
          <li>Set up your Samsung Frame TV IP address</li>
          <li>Generate your first preview</li>
          <li>Publish to your TV</li>
        </ol>
      </div>
    </div>
  );
}

function StatusCard({
  title,
  value,
  subtitle,
  color,
}: {
  title: string;
  value: string;
  subtitle: string;
  color: "success" | "warning" | "error" | "muted";
}) {
  const colorMap = {
    success: "text-frame-success",
    warning: "text-frame-warning",
    error: "text-frame-error",
    muted: "text-frame-muted",
  };

  return (
    <div className="rounded-lg border border-frame-border bg-frame-surface p-5">
      <p className="text-sm text-frame-muted">{title}</p>
      <p className={`mt-1 text-xl font-semibold ${colorMap[color]}`}>{value}</p>
      <p className="mt-1 text-xs text-frame-muted">{subtitle}</p>
    </div>
  );
}
