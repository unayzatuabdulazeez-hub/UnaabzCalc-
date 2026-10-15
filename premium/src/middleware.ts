import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "./lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const path = request.nextUrl.pathname;
  if (path.startsWith("/app") && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login"; url.search = "";
    return NextResponse.redirect(url);
  }
  if ((path === "/login" || path === "/register") && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/app"; url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}
// Pages re-check the user on the server as well; the middleware is a convenience, not the only gate.
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"] };
