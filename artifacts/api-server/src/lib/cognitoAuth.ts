import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Request, Response, NextFunction } from "express";
import type { AuthUser } from "@workspace/api-zod";

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getCognitoConfig() {
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const clientId = process.env.COGNITO_USER_POOL_CLIENT_ID;

  if (!region || !userPoolId || !clientId) {
    throw new Error(
      "COGNITO_USER_POOL_ID, COGNITO_USER_POOL_CLIENT_ID, and AWS_REGION must be set for billing auth.",
    );
  }

  const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
  return { issuer, clientId };
}

function getBearerToken(req: Request) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

export async function requireCognitoUser(req: Request, res: Response, next: NextFunction) {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing account token" });
    return;
  }

  try {
    const { issuer, clientId } = getCognitoConfig();
    jwks ??= createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience: clientId,
    });

    const user: AuthUser = {
      id: String(payload.sub),
      email: typeof payload.email === "string" ? payload.email : null,
      firstName: typeof payload.given_name === "string" ? payload.given_name : null,
      lastName: typeof payload.family_name === "string" ? payload.family_name : null,
      profileImageUrl: null,
    };

    req.user = user;
    next();
  } catch (error: any) {
    res.status(401).json({ error: error?.message || "Invalid account token" });
  }
}
