#!/data/data/com.termux/files/usr/bin/node

import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

const root = '/data/data/com.termux/files/home/codex-subscription-isolated-app'
const workspace = '/data/data/com.termux/files/home/codex-workspace'
const codex = `${root}/bin/codex`
const child = spawn(codex, ['app-server'], {
  cwd: workspace,
  env: process.env,
  stdio: ['pipe', 'pipe', 'inherit'],
})

let settled = false
const timeout = setTimeout(() => finish(new Error('model catalog request timed out')), 60_000)

function send(payload) {
  child.stdin.write(`${JSON.stringify(payload)}\n`)
}

function finish(error) {
  if (settled) return
  settled = true
  clearTimeout(timeout)
  child.stdin.end()
  setTimeout(() => child.kill('SIGTERM'), 250).unref()
  if (error) {
    console.error(`MODEL_CACHE_FAILED: ${error.message}`)
    process.exitCode = 1
  }
}

child.once('error', finish)
child.once('exit', (code) => {
  if (!settled) finish(new Error(`Codex app-server exited with code ${code}`))
})

const lines = createInterface({ input: child.stdout })
lines.on('line', (line) => {
  let message
  try {
    message = JSON.parse(line)
  } catch {
    return
  }

  if (message.id === 1) {
    send({ jsonrpc: '2.0', method: 'initialized' })
    send({ jsonrpc: '2.0', id: 2, method: 'model/list', params: {} })
    return
  }

  if (message.id === 2) {
    if (message.error) {
      finish(new Error(message.error.message || 'model/list failed'))
      return
    }
    const models = Array.isArray(message.result?.data) ? message.result.data : []
    if (!models.some((model) => model?.id === 'gpt-5.6-sol' || model?.slug === 'gpt-5.6-sol')) {
      finish(new Error('the authenticated catalog does not include gpt-5.6-sol'))
      return
    }
    console.log(`MODEL_CACHE_READY models=${models.length}`)
    finish()
  }
})

send({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    clientInfo: { name: 'codex-frontier-installer', version: '1.0.0' },
    capabilities: { experimentalApi: true },
  },
})
