import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const workflows = await prisma.workflow.findMany({
    where: { userId: session.user.id!, status: "active" },
    include: {
      steps: { select: { id: true } },
      runs: { select: { id: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
      secrets: { select: { id: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return <DashboardClient workflows={workflows as any} />;
}
