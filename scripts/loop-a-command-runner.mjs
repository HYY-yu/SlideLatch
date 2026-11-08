// Executed only as a child of the lease supervisor. Both Git operations stay in
// its owned process group, with normal Git hooks and the supervisor's budget.
import { spawnSync } from 'node:child_process';
const { paths, issue, git } = JSON.parse(process.argv[2]);
for (const args of [['add', '--', ...paths], ['commit', '-m', `Update approved writer paths.${issue ? ` Refs #${issue}` : ""}`]]) {
  const result = spawnSync(git, args, { stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
