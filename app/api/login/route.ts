import { NextRequest, NextResponse } from "next/server";
import { hmacHex, COOKIE_NAME } from "@/lib/auth/edge-token";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  const senhaEnviada = (await req.text()).trim();
  const admin = process.env.ADMIN_PASSWORD;
  if (!admin || admin.length < 6) {
    return NextResponse.json({ ok: false, erro: "auth não configurada" }, { status: 500 });
  }
  if (senhaEnviada !== admin) {
    return NextResponse.json({ ok: false, erro: "senha incorreta" }, { status: 401 });
  }
  const token = await hmacHex(admin, "ok");
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 dias
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return res;
}
