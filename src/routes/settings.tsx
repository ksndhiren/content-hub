import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { useApp } from "@/lib/app-store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { platformIconColor, type SocialAccount } from "@/lib/mock-data";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import { useState } from "react";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings | Content Hub" }] }),
  component: SettingsPage,
});

const accountStatusColor: Record<SocialAccount["status"], string> = {
  Connected: "bg-emerald-100 text-emerald-800",
  "Not Connected": "bg-muted text-muted-foreground",
  "Needs Reauth": "bg-amber-100 text-amber-800",
};

function SettingsPage() {
  const { socialAccounts, setSocialAccounts } = useApp();
  const [volume, setVolume] = useState([7]);
  const [autoApprove, setAutoApprove] = useState(false);
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifSlack, setNotifSlack] = useState(false);

  const toggleAccount = (platform: string) => {
    toast.info("OAuth flow not yet wired up, see docs/INTEGRATIONS.md", {
      description: `Once configured, this will start the ${platform} authorisation flow.`,
    });
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Configure your workspace, accounts and AI preferences.</p>
        </div>

        <Tabs defaultValue="profile">
          <TabsList className="bg-surface">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="social">Social</TabsTrigger>
            <TabsTrigger value="ai">AI</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="mt-4">
            <div className="rounded-xl border border-border bg-card p-6 space-y-5">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-full bg-primary text-primary-foreground grid place-items-center text-lg font-semibold">JS</div>
                <div>
                  <div className="font-medium">Jamie Smith</div>
                  <div className="text-xs text-muted-foreground">jamie@contenthub.app</div>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="grid gap-2"><Label>Full name</Label><Input defaultValue="Jamie Smith" /></div>
                <div className="grid gap-2"><Label>Email</Label><Input defaultValue="jamie@contenthub.app" /></div>
                <div className="grid gap-2"><Label>Role</Label><Input defaultValue="Content lead" /></div>
                <div className="grid gap-2"><Label>Timezone</Label><Input defaultValue="Europe/London" /></div>
              </div>
              <Button onClick={() => toast.success("Profile saved")}>Save changes</Button>
            </div>
          </TabsContent>

          <TabsContent value="social" className="mt-4 space-y-3">
            <div className="rounded-xl border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
              Connect a brand's social channels to pull metrics and publish content. OAuth flows are wired up by
              the backend, see <code>docs/INTEGRATIONS.md</code> for the full provider setup.
            </div>
            {(["Instagram", "Threads", "Facebook", "LinkedIn", "X"] as const).map((p) => {
              const acc = socialAccounts.find((a) => a.platform === p);
              return (
                <div key={p} className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
                  <span className={cn("text-xs px-2.5 py-1 rounded-full font-medium", platformIconColor[p])}>{p}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{acc?.handle ?? "Not connected"}</div>
                    <Badge className={cn("mt-1 text-[10px] border-0", accountStatusColor[acc?.status ?? "Not Connected"])}>
                      {acc?.status ?? "Not Connected"}
                    </Badge>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => toggleAccount(p)}>
                    {acc?.status === "Connected" ? "Disconnect" : acc?.status === "Needs Reauth" ? "Reauthorise" : "Connect"}
                  </Button>
                </div>
              );
            })}
          </TabsContent>

          <TabsContent value="ai" className="mt-4">
            <div className="rounded-xl border border-border bg-card p-6 space-y-6">
              <div>
                <Label className="text-sm">Default weekly content volume</Label>
                <p className="text-xs text-muted-foreground mb-3">Posts to generate per brand per week.</p>
                <Slider value={volume} onValueChange={setVolume} max={20} min={1} step={1} />
                <div className="text-xs text-muted-foreground mt-2">{volume[0]} posts / week</div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">Auto-approve safe posts</Label>
                  <p className="text-xs text-muted-foreground">Skip review for posts the AI rates 9/10 or higher.</p>
                </div>
                <Switch checked={autoApprove} onCheckedChange={setAutoApprove} />
              </div>
              <div className="grid gap-2"><Label>Default tone of voice</Label><Input defaultValue="Warm, direct, helpful" /></div>
              <Button onClick={() => toast.success("Preferences saved")}>Save preferences</Button>
            </div>
          </TabsContent>

          <TabsContent value="notifications" className="mt-4">
            <div className="rounded-xl border border-border bg-card p-6 space-y-5">
              <Row title="Email notifications" desc="Weekly batch summaries and review reminders.">
                <Switch checked={notifEmail} onCheckedChange={setNotifEmail} />
              </Row>
              <Row title="Slack notifications" desc="Send updates to your #content channel.">
                <Switch checked={notifSlack} onCheckedChange={setNotifSlack} />
              </Row>
              <Row title="Review alerts" desc="Notify when AI flags a low-quality post.">
                <Switch defaultChecked />
              </Row>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

function Row({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm font-medium">{title}</div>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      {children}
    </div>
  );
}
