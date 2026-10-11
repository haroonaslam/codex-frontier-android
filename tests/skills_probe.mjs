const response = await fetch('http://127.0.0.1:5902/codex-api/rpc', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    method: 'skills/list',
    params: {
      cwds: ['/data/data/com.termux/files/home/codex-workspace'],
      forceReload: true,
    },
  }),
  signal: AbortSignal.timeout(30_000),
})

const body = await response.json()
if (!response.ok) throw new Error(`skills/list returned ${response.status}: ${JSON.stringify(body)}`)

const skills = body.result?.data ?? body.result?.skills ?? []
const names = JSON.stringify(skills)
const expected = ['roleplay', 'rscodefx', 'qwen-2-1-prompt-generator']
for (const name of expected) {
  if (!names.includes(name)) throw new Error(`missing copied skill: ${name}`)
}

console.log(JSON.stringify({ copiedSkills: expected, visible: true }))
