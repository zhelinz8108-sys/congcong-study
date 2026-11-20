import { authMetadata, oauthOrigin } from "@/server/dot/oauth";
export function GET(request: Request) { return Response.json(authMetadata(oauthOrigin(request))); }
