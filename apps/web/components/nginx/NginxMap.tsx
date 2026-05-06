import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { NginxBlock } from "@/lib/types"
import { ShieldCheck, ShieldOff } from "lucide-react"

interface NginxMapProps {
  blocks: NginxBlock[]
}

export function NginxMap({ blocks }: NginxMapProps) {
  if (blocks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
        <p className="text-muted-foreground text-sm">No nginx blocks found on this server.</p>
      </div>
    )
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Domain(s)</TableHead>
            <TableHead>Listen</TableHead>
            <TableHead>Target</TableHead>
            <TableHead>SSL</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {blocks.map((block, i) => (
            <TableRow key={i}>
              <TableCell>
                <div className="flex flex-col gap-1">
                  {block.server_names.map((name) => (
                    <span key={name} className="font-mono text-sm">
                      {name}
                    </span>
                  ))}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {block.listen.map((l) => (
                    <Badge key={l} variant="outline" className="font-mono text-xs">
                      {l}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell>
                {block.proxy_pass ? (
                  <div>
                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                      proxy_pass
                    </span>
                    <p className="font-mono text-sm">{block.proxy_pass}</p>
                  </div>
                ) : block.root_dir ? (
                  <div>
                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                      root
                    </span>
                    <p className="font-mono text-sm">{block.root_dir}</p>
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                {block.ssl_enabled ? (
                  <div className="flex items-center gap-1 text-green-700 dark:text-green-400">
                    <ShieldCheck className="h-4 w-4" />
                    <span className="text-sm font-medium">SSL</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <ShieldOff className="h-4 w-4" />
                    <span className="text-sm">None</span>
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
