import { redirect } from "next/navigation";

interface PageProps {
  params: { projectId: string };
}

export default function EnvironmentsRedirectPage({ params }: PageProps) {
  redirect(`/projects/${params.projectId}`);
}
