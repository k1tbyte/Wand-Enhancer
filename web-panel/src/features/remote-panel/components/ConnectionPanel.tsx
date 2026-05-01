import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DEFAULT_REMOTE_PORT } from '../constants';
import type { ConnectionStatus } from '../state';

type ConnectionPanelProps = {
  status: ConnectionStatus;
  wsUrl: string;
  lastError: string | null;
  onConnect: () => void;
  onDebugSession?: () => void;
  onWsUrlChange: (value: string) => void;
};

export function ConnectionPanel({ status, wsUrl, lastError, onConnect, onDebugSession, onWsUrlChange }: ConnectionPanelProps) {
  return (
    <Card className="rounded-[8px] border-white/10 bg-white/4.5 shadow-xl shadow-black/25">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base font-bold text-white">Bridge uplink</CardTitle>
            <CardDescription className="mt-1 text-muted-foreground">Default relay port {DEFAULT_REMOTE_PORT}</CardDescription>
          </div>
          <Badge className="border border-white/10 bg-white/5 text-white" variant="outline">
            {status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="ws-url" className="text-[0.7rem] uppercase tracking-[0.12em] text-muted-foreground">
            WebSocket endpoint
          </Label>
          <Input
            id="ws-url"
            type="url"
            value={wsUrl}
            placeholder={`ws://127.0.0.1:${DEFAULT_REMOTE_PORT}/remote/ws`}
            className="h-9 rounded-[8px] border-white/10 bg-black/25 font-mono text-[0.8rem] text-white placeholder:text-white/30"
            onChange={(event) => onWsUrlChange(event.currentTarget.value)}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button className="h-9 rounded-[8px] bg-emerald-300 text-black hover:bg-emerald-200" onClick={onConnect}>
            <Icon className="size-4" name="plug" />
            Connect
          </Button>
          {import.meta.env.DEV && onDebugSession ? (
            <Button className="h-9 rounded-[8px] border-white/10 bg-white/5 text-white hover:bg-white/10" variant="outline" onClick={onDebugSession}>
              <Icon className="size-4" name="flask" />
              Debug session
            </Button>
          ) : null}
        </div>

        {lastError ? (
          <div className="flex items-start gap-2 rounded-[8px] border border-red-300/25 bg-red-500/10 p-3 text-sm text-red-100">
            <Icon className="mt-0.5 size-4 shrink-0" name="alert" />
            <span>{lastError}</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
