// 데모 모드에서만 화면 오른쪽 아래에 '지금 역할'을 띄운다 (#104). 시연 · 영상에서 누구의 화면인지 바로 보이게.
// 실제 몰에서는 그리지 않는다: 부르는 쪽이 env().mock일 때만 넣는다.

import { DEMO_ROLES, type DemoRole } from "@/lib/demo-roles";

export function DemoRoleBadge({ role }: { role: DemoRole }) {
  const r = DEMO_ROLES[role];
  return (
    <aside aria-label="데모 역할" className="demo-role" style={{
      position: "fixed", right: 16, bottom: 16, zIndex: 15, display: "flex", alignItems: "center", gap: 10, maxWidth: "calc(100vw - 32px)",
      padding: "7px 7px 7px 14px", borderRadius: 99, background: "var(--surface)", color: "var(--fg)", fontSize: 13.5,
      border: `1.5px solid color-mix(in srgb, ${r.color} 45%, var(--line))`, boxShadow: "var(--shadow-pop)",
    }}>
      <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: "50%", background: r.color, flex: "none" }} />
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}><b style={{ color: r.ink }}>{r.name} 화면</b> <span className="small">· {r.who}</span></span>
      <a href="/demo" style={{ flex: "none", padding: "4px 10px", borderRadius: 99, background: "var(--soft)", color: "var(--fg)", fontSize: 12.5, fontWeight: 650, textDecoration: "none" }}>역할 바꾸기</a>
    </aside>
  );
}
