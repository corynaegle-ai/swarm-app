/**
 * MCP Factory API Client
 * Calls mcp-factory service for MCP server design
 */

const MCP_FACTORY_URL = import.meta.env.VITE_MCP_FACTORY_URL || "/api/mcp-factory";

export async function designMcpServer(description, tenantId = "default") {
  const response = await fetch(`${MCP_FACTORY_URL}/api/design`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      description,
      tenant_id: tenantId,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to design MCP server");
  }

  return response.json();
}

export async function getMcpDesignStatus(projectId) {
  const response = await fetch(`${MCP_FACTORY_URL}/api/design/${projectId}/status`);
  if (!response.ok) {
    throw new Error("Failed to get design status");
  }
  return response.json();
}
