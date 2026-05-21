import { ProxyCapability, ProxySession } from '../../types/ProxyCapabilities';

export interface ConnectorHealth {
  status: 'healthy' | 'degraded' | 'offline';
  latencyMs?: number;
  activeSessions: number;
}

export interface EgressConnector {
  /**
   * Initialize the connector with provider-specific configuration.
   */
  initialize(config: Record<string, any>): Promise<void>;

  /**
   * Request a new proxy session based on the provided capability.
   */
  createSession(capability: ProxyCapability): Promise<ProxySession>;

  /**
   * Terminate an active proxy session.
   */
  terminateSession(sessionId: string): Promise<void>;

  /**
   * Get the health and status of the connector.
   */
  getHealth(): Promise<ConnectorHealth>;

  /**
   * Report metrics back to the AXIOM-MESH telemetry system.
   */
  reportMetrics(sessionId: string, bytesTransferred: number): Promise<void>;
}
