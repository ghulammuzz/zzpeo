import { NextRequest } from "next/server"
import http from "http"

export const dynamic = "force-dynamic"

const API_URL = process.env.API_URL ?? "http://localhost:8080"

export async function GET(
  request: NextRequest,
  { params }: { params: { serviceId: string } },
) {
  const search = request.nextUrl.search
  const apiUrl = new URL(`${API_URL}/api/v1/services/${params.serviceId}/logs${search}`)

  let req: http.ClientRequest | null = null

  const stream = new ReadableStream({
    start(controller) {
      req = http.get(
        {
          hostname: apiUrl.hostname,
          port: parseInt(apiUrl.port) || 8080,
          path: apiUrl.pathname + apiUrl.search,
          headers: { Accept: "text/event-stream", "Cache-Control": "no-cache" },
        },
        (res) => {
          if ((res.statusCode ?? 500) >= 400) {
            controller.enqueue(
              new TextEncoder().encode(
                `event: error\ndata: upstream ${res.statusCode}\n\n`,
              ),
            )
            controller.close()
            return
          }
          res.on("data", (chunk: Buffer) => controller.enqueue(chunk))
          res.on("end", () => controller.close())
          res.on("error", (err: Error) => controller.error(err))
        },
      )
      req.on("error", (err: Error) => controller.error(err))
    },
    cancel() {
      req?.destroy()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  })
}
