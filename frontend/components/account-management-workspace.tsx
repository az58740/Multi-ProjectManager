"use client";

import { AccountDirectoryWorkspace } from "@/components/account-directory-workspace";
import type { Project } from "@/lib/projects";

export function AccountManagementWorkspace({ projects }: { projects: Project[] }) {
  return <AccountDirectoryWorkspace projects={projects} />;
}
