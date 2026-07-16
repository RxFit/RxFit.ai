// Shared helper for fetching Replit connector credentials.
// NOTE: the /api/v2/connection endpoint currently returns zero items when the
// `connector_names` query filter is supplied, so we fetch all connections and
// filter client-side by connector name (and optionally environment).
export async function getConnectionSettings(
  connectorName: string,
  environment?: 'development' | 'production',
): Promise<any | undefined> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!hostname || !xReplitToken) {
    throw new Error('Replit connector credentials not available (missing hostname or identity token)');
  }

  const response = await fetch(`https://${hostname}/api/v2/connection?include_secrets=true`, {
    headers: {
      'Accept': 'application/json',
      'X_REPLIT_TOKEN': xReplitToken,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch connector settings: ${response.status}`);
  }

  const data = await response.json();
  const items: any[] = data.items ?? [];
  const matches = items.filter((item) => item.connector_name === connectorName);
  if (environment) {
    const envMatch = matches.find((item) => item.environment === environment);
    if (envMatch) return envMatch;
  }
  return matches[0];
}
