import { notFound } from "next/navigation";
import { GenericTablePage } from "@/components/admin/generic-table-page";
import { getAdminResource } from "@/lib/admin-resources";

export default async function GenericTableRoute({
  params,
}: {
  params: Promise<{ resource: string }>;
}) {
  const { resource: resourceKey } = await params;
  const resource = getAdminResource(resourceKey);

  if (!resource) {
    notFound();
  }

  return <GenericTablePage resource={resource} />;
}
