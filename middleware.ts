/**
 * Middleware Next.js — protege rotas admin com cookie HMAC validado em Edge.
 *
 * Rotas protegidas: tudo que está em /admin, /api/admin, /api/playground.
 * /api/webhook/* fica LIVRE (Meta WhatsApp precisa chamar sem auth).
 * /api/cron/* fica livre (cron jobs do Vercel).
 * /login fica livre (sem isso ninguém entra).
 */

import { NextRequest, NextResponse } from "next/server";
import { tokenEsperado, COOKIE_NAME } from "@/lib/auth/edge-token";

export async function middleware(req: NextRequest) {
  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  const expected = await tokenEsperado();

  // Se ADMIN_PASSWORD não estiver configurada, libera tudo (dev local)
  if (!expected) return NextResponse.next();

  if (cookie === expected) return NextResponse.next();

  // Não autorizado: API responde 401, página redireciona pra /login
  if (req.nextUrl.pathname.startsWith("/api")) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("from", req.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/admin/:path*",
    "/api/playground",
  ],
};
