/**
 * MCP Factory API Client
 * Calls mcp-factory service for MCP server design and generation
 */

import { apiCall } from '../utils/api';

const MCP_FACTORY_BASE = import.meta.env.VITE_MCP_FACTORY_URL || "/api/mcp-factory";

// Design MCP server (creates Swarm tickets)
export async function designMcpServer(description, tenantId = "default") {
  const response = await apiCall(`${MCP_FACTORY_BASE}/api/design`, {
    method: "POST",
    body: JSON.stringify({
      description,
      tenant_id: tenantId,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "Failed to design MCP server");
  }

  return response.json();
}

export async function getMcpDesignStatus(projectId) {
  const response = await apiCall(`${MCP_FACTORY_BASE}/api/design/${projectId}/status`);
  if (!response.ok) throw new Error("Failed to get design status");
  return response.json();
}

// Generate MCP server (full code generation)
export async function generateMcpServer(description) {
  const response = await apiCall(`${MCP_FACTORY_BASE}/api/generate`, {
    method: "POST",
    body: JSON.stringify({ description }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "Failed to start generation");
  }
  return response.json();
}

// Get job status
export async function getJobStatus(jobId) {
  const response = await apiCall(`${MCP_FACTORY_BASE}/api/jobs/${jobId}`);
  if (!response.ok) throw new Error("Failed to get job status");
  return response.json();
}

// List all jobs
export async function listJobs() {
  const response = await apiCall(`${MCP_FACTORY_BASE}/api/jobs`);
  if (!response.ok) throw new Error("Failed to list jobs");
  return response.json();
}

// List generated servers
export async function listServers() {
  const response = await apiCall(`${MCP_FACTORY_BASE}/api/servers`);
  if (!response.ok) throw new Error("Failed to list servers");
  return response.json();
}

// Validate spec
export async function validateSpec(spec) {
  const response = await apiCall(`${MCP_FACTORY_BASE}/api/validate`, {
    method: "POST",
    body: JSON.stringify({ spec }),
  });
  if (!response.ok) throw new Error("Failed to validate spec");
  return response.json();
}
