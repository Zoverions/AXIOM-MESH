export interface ProxyCapability {
  id: string;
  type: 'residential' | 'mobile' | 'datacenter' | 'mixed';
  targeting: {
    country?: string;
    city?: string;
    asn?: string;
    isp?: string;
  };
  sessionConfig: {
    type: 'sticky' | 'rotating';
    durationSeconds?: number;
    rotationIntervalSeconds?: number;
  };
  quotas: {
    maxBandwidthBytes?: number;
    maxConcurrentSessions?: number;
  };
  authentication: {
    type: 'capability_token' | 'username_password';
    credentials?: any; // e.g. for anyIP
  };
  status: 'active' | 'revoked' | 'expired';
}

export interface ProxySession {
    sessionId: string;
    capabilityId: string;
    nodeId: string;
    startTime: number;
    bytesTransferred: number;
    status: 'active' | 'closed';
}
