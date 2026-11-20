import { oauthOrigin, protectedMetadata } from "@/server/dot/oauth";
export function GET(request: Request) { return Response.json(protectedMetadata(oauthOrigin(request))); }
