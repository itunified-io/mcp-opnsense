export interface OPNsenseConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
  verifySsl?: boolean;
  timeout?: number;
}

export interface ApiResponse<T> {
  status: string;
  data: T;
}

export interface SearchResult<T> {
  rows: T[];
  rowCount: number;
  total: number;
  current: number;
}

export interface UuidResponse {
  uuid: string;
}

export interface StatusResponse {
  status: string;
  result: string;
}

// DNS

export interface HostOverride {
  uuid?: string;
  enabled: string;
  hostname: string;
  domain: string;
  server: string;
  description: string;
}

export interface DomainOverride {
  uuid?: string;
  enabled: string;
  domain: string;
  server: string;
  description: string;
}

export interface ForwardServer {
  uuid?: string;
  enabled: string;
  server: string;
  port: string;
  domain: string;
  description: string;
}

// Firewall

export interface FilterRule {
  uuid?: string;
  enabled: string;
  action: string;
  direction: string;
  interface: string;
  protocol: string;
  source_net: string;
  source_port: string;
  destination_net: string;
  destination_port: string;
  description: string;
  log: string;
  sequence: string;
}

export interface Alias {
  uuid?: string;
  enabled: string;
  name: string;
  type: string;
  content: string;
  description: string;
}

// Interfaces

export interface InterfaceInfo {
  device: string;
  description: string;
  status: string;
  ipv4: string[];
  ipv6: string[];
  media: string;
  macaddr: string;
  mtu: string;
}

export interface InterfaceStats {
  device: string;
  bytesIn: number;
  bytesOut: number;
  packetsIn: number;
  packetsOut: number;
  errorsIn: number;
  errorsOut: number;
  collisions: number;
}

// DHCP

export interface DhcpLease {
  address: string;
  hwaddr: string;
  hostname: string;
  starts: string;
  ends: string;
  status: string;
  interface: string;
}

export interface StaticMapping {
  uuid?: string;
  mac: string;
  ipaddr: string;
  hostname: string;
  description: string;
  interface: string;
}

// System

export interface SystemInfo {
  name: string;
  versions: Record<string, string>;
  cpu: string;
  memory: string;
  uptime: string;
  disk: string;
}

export interface ServiceInfo {
  id: string;
  name: string;
  description: string;
  running: boolean;
}

export interface BackupInfo {
  time: string;
  description: string;
  size: number;
  filename: string;
}

// Diagnostics

export interface ArpEntry {
  ip: string;
  mac: string;
  intf: string;
  hostname: string;
  manufacturer: string;
}

export interface RouteEntry {
  destination: string;
  gateway: string;
  flags: string;
  interface: string;
  expire: string;
}
