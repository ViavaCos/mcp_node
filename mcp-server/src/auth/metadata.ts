// mcp-server/src/auth/metadata.ts
// RFC 9728 OAuth 2.0 Protected Resource Metadata：向客户端公布授权服务器地址
import { AUTH_ISSUER, RESOURCE_URL, AUTH_REQUIRED_SCOPES } from './config.js';

export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  scopes_supported: string[];
  bearer_methods_supported: string[];
  resource_name: string;
}

export function protectedResourceMetadata(): ProtectedResourceMetadata {
  return {
    resource: RESOURCE_URL,
    authorization_servers: [AUTH_ISSUER],
    scopes_supported: AUTH_REQUIRED_SCOPES,
    bearer_methods_supported: ['header'],
    resource_name: 'ecommerce-mcp',
  };
}
