import { NextResponse, type NextRequest } from 'next/server';
export function middleware(request: NextRequest) {
  return NextResponse.redirect(new URL('/zh', request.url));
}
export const config = { matcher: ['/'] };
