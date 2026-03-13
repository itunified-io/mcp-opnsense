import { z } from "zod";

export const UuidSchema = z
  .string()
  .uuid("Invalid UUID format");

export const IpAddressSchema = z
  .string()
  .regex(
    /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/,
    "Invalid IPv4 address",
  );

export const CidrSchema = z
  .string()
  .regex(
    /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\/(?:3[0-2]|[12]?\d)$/,
    "Invalid CIDR notation",
  );

export const HostnameSchema = z
  .string()
  .regex(
    /^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(?:\.(?!-)[a-zA-Z0-9-]{1,63}(?<!-))*$/,
    "Invalid hostname",
  );

export const PortSchema = z
  .number()
  .int()
  .min(1, "Port must be at least 1")
  .max(65535, "Port must be at most 65535");

export const MacAddressSchema = z
  .string()
  .regex(
    /^[0-9a-fA-F]{2}(?::[0-9a-fA-F]{2}){5}$/,
    "Invalid MAC address (expected format: AA:BB:CC:DD:EE:FF)",
  );

export const DomainSchema = z
  .string()
  .regex(
    /^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(?:\.(?!-)[a-zA-Z0-9-]{1,63}(?<!-))*\.[a-zA-Z]{2,}$/,
    "Invalid domain name",
  );

export const ProtocolSchema = z.enum(["TCP", "UDP", "ICMP", "any"]);

export const FirewallActionSchema = z.enum(["pass", "block", "reject"]);

export const DirectionSchema = z.enum(["in", "out"]);

export const ServiceActionSchema = z.enum(["start", "stop", "restart"]);
