import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";
import type { Database } from "./database.types";

const SIGNED_IN_AREAS = ["/dashboard", "/companies", "/letters", "/checkout", "/settings", "/admin"];

function isSignedInArea(pathname: string) {
  return SIGNED_IN_AREAS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Refreshes the Supabase session cookies on every request and sends signed-out visitors away from signed-in pages.
 * This is a fast path only: every page and action still checks the user on the server, and RLS checks the data.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  // Validates the access token (and refreshes it when needed). Don't put code between createServerClient and this.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  const redirectTo = (target: URL) => {
    const redirect = NextResponse.redirect(target);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    redirect.headers.set("cache-control", "private, no-store");
    return redirect;
  };

  if (!signedIn && isSignedInArea(pathname)) {
    const target = request.nextUrl.clone();
    target.pathname = "/sign-in";
    target.search = "";
    target.searchParams.set("next", `${pathname}${search}`);
    return redirectTo(target);
  }
  if (signedIn && pathname === "/sign-in") {
    const target = request.nextUrl.clone();
    target.pathname = "/dashboard";
    target.search = "";
    return redirectTo(target);
  }
  return response;
}
