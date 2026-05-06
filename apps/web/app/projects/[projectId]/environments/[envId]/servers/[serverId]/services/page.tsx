import { redirect } from "next/navigation";

interface PageProps {
  params: { projectId: string; envId: string; serverId: string };
}

export default function ServicesRedirectPage({ params }: PageProps) {
  redirect(`/projects/${params.projectId}/environments/${params.envId}/servers/${params.serverId}`);
}
