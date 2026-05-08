import { NextRequest } from "next/server"

const API_URL = process.env.API_URL ?? "http://localhost:8080"

export async function GET(
  request: NextRequest,
  { params }: { params: { deploymentId: string } },
) {
  const search = request.nextUrl.search // preserves ?token=

  const upstream = await fetch(
    `${API_URL}/api/v1/deployments/${params.deploymentId}/stream${search}`,
    {
      headers: {
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
      },
    },
  )

  if (!upstream.ok || !upstream.body) {
    return new Response(
      `event: error\ndata: upstream ${upstream.status}\n\n`,
      {
        status: upstream.status,
        headers: { "Content-Type": "text/event-stream" },
      },
    )
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
