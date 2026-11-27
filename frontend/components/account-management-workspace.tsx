"use client";

import { AccountDirectoryWorkspace, type AccountDirectoryView } from "@/components/account-directory-workspace";
import type { Project } from "@/lib/projects";

export function AccountManagementWorkspace({ projects, tab, onTabChange, onBack }: { projects: Project[]; tab: AccountDirectoryView; onTabChange: (tab: AccountDirectoryView) => void; onBack: () => void }) {
  return <AccountDirectoryWorkspace projects={projects} view={tab} onViewChange={onTabChange} onBack={onBack} />;
}
