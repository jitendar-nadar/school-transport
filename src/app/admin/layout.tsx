import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminShell, type SessionUser } from "@/components/admin/shell";
import { ACCESS_COOKIE } from "@/lib/auth/tokens";
import { userFromAccessToken } from "@/lib/auth/guard";
import { connectDb } from "@/lib/mongodb/connection";

export const dynamic = "force-dynamic";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;
  if (!token) redirect("/login");
  await connectDb();
  const user = await userFromAccessToken(token);
  if (!user) redirect("/login?reauth=1");
  const session: SessionUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    schoolId: user.schoolId,
    companyId: user.companyId,
    fleetId: user.fleetId,
  };
  if (!["PLATFORM_ADMIN", "SCHOOL_ADMIN", "COMPANY_ADMIN", "COMPANY_HR", "FLEET_ADMIN", "EMPLOYEE"].includes(session.role)) {
    redirect("/login?denied=1");
  }
  return <AdminShell user={session}>{children}</AdminShell>;
}
