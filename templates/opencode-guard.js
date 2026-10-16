/** OpenCode project plugin: advisory local action gate. Remote CI branch protection remains authoritative. */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const AINativeGate = async ({ directory }) => ({
  'tool.execute.before': async (input, output) => {
    if (input.tool !== 'bash') return
    const command = String(output.args?.command ?? '')
    // Deliberately conservative recognizer; not a full shell parser / sandbox.
    const protectedAction = /\bgh\s+pr\s+merge\b|\bgit\s+push\b|\bnpm\s+publish\b|\bpnpm\s+publish\b/.test(command)
    if (!protectedAction) return
    const file = join(directory, '.ai-native', 'tools', 'aicp.cjs')
    if (!existsSync(file)) throw new Error('AI Native gate unavailable: operation blocked')
    const result = spawnSync('node', [file, 'gate', '--project', directory], { encoding: 'utf8', timeout: 20000 })
    if (result.error || result.status !== 0) throw new Error('AI Native NO-GO: '+(result.stdout||result.stderr||result.error?.message||'gate check failed'))
  }
})
