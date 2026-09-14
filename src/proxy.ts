import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { supabaseResponse, user } = await updateSession(request);

  // Get role from user metadata (fast path — no extra DB call in middleware)
  const role = user?.user_metadata?.role as string | undefined;

  // /seller/* routes
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/minha-loja") || pathname.startsWith("/meus-produtos")) {
    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (role !== "seller" && role !== "admin") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  // /admin/* routes
  if (pathname.startsWith("/admin")) {
    if (!user || role !== "admin") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  // Rotas que exigem apenas login (comprador ou vendedor)
  if (
    pathname.startsWith("/favoritos") ||
    pathname.startsWith("/perfil") ||
    pathname.startsWith("/pedidos") ||
    pathname.startsWith("/mensagens")
  ) {
    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
