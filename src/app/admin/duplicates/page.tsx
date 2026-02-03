/**
 * Admin Duplicates Management Page
 * Manage duplicate project groups
 */

import { DuplicatesManagement } from "@/components/admin/duplicates-management";

export const metadata = {
  title: "중복 관리 | Admin",
  description: "중복 프로젝트 그룹 관리",
};

export default function AdminDuplicatesPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">중복 관리</h1>
        <p className="mt-2 text-muted-foreground">
          중복으로 감지된 프로젝트 그룹을 검토하고 관리합니다
        </p>
      </div>

      <DuplicatesManagement />
    </div>
  );
}
