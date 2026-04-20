import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const upstream = (
  process.env.INTERNAL_API_URL ?? "http://127.0.0.1:8000"
).replace(/\/$/, "");

function buildUpstreamHeaders(req: NextRequest): Headers {
  const headers = new Headers();
  const ct = req.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  const accept = req.headers.get("accept");
  if (accept) headers.set("accept", accept);
  const cookie = req.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  return headers;
}

function applyUpstreamResponseHeaders(res: Response, out: Headers): void {
  const ctOut = res.headers.get("content-type");
  if (ctOut) out.set("content-type", ctOut);
  out.set("cache-control", "no-store, no-cache");
  const setCookies = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookies) {
    out.append("set-cookie", c);
  }
}

async function proxy(req: NextRequest, pathParts: string[]) {
  const subpath = pathParts.join("/");
  const target = `${upstream}/api/v1/${subpath}${req.nextUrl.search}`;

  const headers = buildUpstreamHeaders(req);

  const hasBody = !["GET", "HEAD"].includes(req.method);
  const init: RequestInit = {
    method: req.method,
    headers,
    ...(hasBody ? { body: await req.arrayBuffer() } : {}),
  };

  const res = await fetch(target, init);

  const out = new Headers();
  applyUpstreamResponseHeaders(res, out);

  return new NextResponse(res.body, { status: res.status, headers: out });
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
