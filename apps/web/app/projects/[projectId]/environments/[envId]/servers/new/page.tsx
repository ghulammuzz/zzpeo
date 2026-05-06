import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ServerForm } from "@/components/servers/ServerForm"

interface PageProps {
  params: { projectId: string; envId: string }
}

export default function ServerNewPage({ params }: PageProps) {
  const basePath = `/projects/${params.projectId}/environments/${params.envId}`

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Add Server</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Connect a new server to this environment
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Server Details</CardTitle>
          <CardDescription>
            Enter SSH connection details. The connection will be tested before saving.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ServerForm
            envId={params.envId}
            projectId={params.projectId}
            redirectBasePath={basePath}
          />
        </CardContent>
      </Card>
    </div>
  )
}
