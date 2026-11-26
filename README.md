# Matrix Project

**English** · [한국어](README.ko.md)

Matrix is a personal practice platform for coding and statistics. The coding track covers algorithms, Scala, and functional programming. The statistics track connects probability and inference to machine learning and bioinformatics. Practice starts with a short, timed problem. A chess track is planned.

The app opens in English. Choose **한국어** on the sign-in screen or in the app menu. Your browser remembers the choice. Choose **English** to switch back.

See [`notes/idea.md`](notes/idea.md) for the design rationale and [`CLAUDE.md`](CLAUDE.md) for project rules.

## Included

| Area | What it provides |
|---|---|
| Training | Three Codeforces practice modes (speed, standard, depth), selected around your rating and updated from submission results. |
| Scala | 150 Scala 3 problems in a browser editor, staged by difficulty with book and compiler-transformation exercises. The local judge compiles and runs submissions. |
| Cheatsheet | 116 syntax examples opened while solving; example outputs are execution-checked. |
| Memo | 208 mobile-friendly review cards and 100 problem checks, with FSRS scheduling. |
| Sparring, Debrief, Garden | Timed coding and recall rounds, session review, and a visualization of your learning history. |
| Operator | A post-problem question window for Claude Code, Codex, or Qwen Code CLI. It is locked while the timer runs. |
| PDF sets (pilot) | Upload a text PDF of up to 8 MiB in **PDF sets**. Your connected AI provider uses text from the first 10 pages to generate 3–5 bilingual multiple-choice questions. The set and answers are saved in your private library. |
| Probability & Statistics | 10 short quantitative lessons covering probability, inference, machine learning, and bioinformatics, with timed answers, hints, references, and review. |

## Run and manage accounts

Use Node.js 26, pnpm and Docker Compose. The app is designed for localhost or a private HTTPS network. On macOS, a dedicated Linux VM can run the workers without sharing host directories. The commands below use Lima’s rootless Docker template. For an existing VM, start it and select its Docker context.

```sh
limactl create --name=matrix-workers --mount-none --memory=5 --cpus=3 --disk=20 template:docker
limactl start matrix-workers
docker context create lima-matrix-workers --docker "host=unix://$HOME/.lima/matrix-workers/sock/docker.sock"
export DOCKER_CONTEXT=lima-matrix-workers
export MATRIX_DOCKER_SOCKET="/run/user/$(limactl shell --workdir / matrix-workers id -u)/docker.sock"
pnpm -C app install --frozen-lockfile
pnpm build
cd app
docker compose --profile images build
docker compose up -d --no-build
python3 scripts/admin.py create owner
```

The default address is `http://localhost:5173`. When using a private HTTPS proxy such as Tailscale Serve, set `MATRIX_ORIGIN` to the actual HTTPS origin when starting Compose. Compose binds the web port to loopback. Reuse the same Docker context and environment on subsequent starts.

The web image includes Poppler for PDF extraction. To run the full test suite or use PDF sets outside Docker, install Poppler (including `pdftotext` and `pdfinfo`) and start the Node adapter with `BODY_SIZE_LIMIT=9M` for multipart uploads.

### Access without Tailscale

On this Mac, register at `http://localhost:5173/signup`. For Wi-Fi or LAN access, run Caddy on the Mac to forward HTTPS requests from its LAN address to the VM’s loopback port. Use the same HTTPS origin in the browser and proxy configuration so form submissions and session cookies work.

1. Set `MATRIX_PORT=5183`, leave `MATRIX_ORIGIN=` empty, set `MATRIX_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,https://<LAN-IP>:8443`, and restart the web service. The local proxy sets the original protocol and host for each request.
2. On the Mac, run `MATRIX_LAN_IP=<LAN-IP> caddy run --config app/Caddyfile.lan --adapter caddyfile`, replacing `<LAN-IP>` with its address. Open `http://localhost:5173` locally or `https://<LAN-IP>:8443/signup` from another device.
3. LAN HTTPS uses Caddy’s internal certificate authority. Install the public certificate `pki/authorities/local/root.crt` from Caddy’s data directory into the trust store on each connecting device. Public access requires a domain, DNS, inbound routing and a publicly trusted HTTPS certificate. Add that HTTPS origin to the allowlist.

- **Accounts.** Register from the sign-in screen. Administrators can use `python3 scripts/admin.py create USERNAME`. The `reset USERNAME` command changes the password and revokes that account’s sessions. Password entry is hidden.
- **Import an existing history.** Import when creating the first owner in an empty account store. Stop writes to the old service and use SQLite’s backup API to make a consistent copy. Copy it to the writable accounts volume, grant the web service user read access and pass the new password on standard input to `docker compose exec -T web node scripts/account.ts create owner /app/data/accounts/import.db`. The command checks integrity and creates a separate backup and user copy.
- **Training data.** The VM’s `matrix_accounts` volume contains `auth.db` for authentication, `users/<UUID>/trainer.db` for each learner’s history, and `catalog.db` for the shared Codeforces catalogue. Stop services before archiving the whole volume, or use SQLite’s backup API for individual databases.
- **Coach connections.** In Coach settings, each account can add, replace or remove its own provider keys. Keys stay in a worker-only volume under the account UUID. Web responses omit credentials. Qwen uses the international DashScope endpoint. Each account supplies its own keys.
- **Owner CLI login.** Set the broker’s `MATRIX_CLI_OWNER_ID` to the UUID of the existing `owner` account. Select the VM’s Docker context and run `python3 app/scripts/admin.py cli-login codex` from the repository root. Substitute `claude` or `qwen` to select another provider. Complete provider authentication and exit the Qwen interface normally. Each job restores only the matching provider’s login files and retains refreshed credentials. The owner’s CLI login takes precedence over an API key.
- **Worker isolation.** The web app submits jobs over a dedicated Unix socket. Only the broker accesses the VM’s Docker socket. Each job runs as an unprivileged user in a fresh container with a read-only root, bounded temporary storage, and CPU, memory, PID, time and output limits. Scala compilation and execution are offline. Coaches have networking disabled and reach approved HTTPS hosts through a provider-specific Unix socket. Operator, Garden readings and Scala trace verification use this boundary.
- **Development.** In `app/`, set `MATRIX_DATA` to a development account directory and create an account by passing the password on standard input to `node scripts/account.ts create USERNAME`. To use grading and coaching with `pnpm dev`, point `MATRIX_WORKER_SOCKET` at the broker socket. Use Compose to test the production isolation boundary.

### Automatic production updates on macOS

On a Mac already running the `matrix` Compose stack in `lima-matrix-workers`, install the user LaunchAgent from the repository root. The account must be able to fetch `origin` without a password prompt. The job reads production settings from `app/.env`.

```sh
python3 ops/auto-deploy.py --install --builder desktop-linux
```

While the user is logged in, the agent checks GitHub `main` every minute. It builds in a separate checkout, runs the type checker and tests, checks the candidate login page in isolation, then updates the web container. Changes to worker sources or Compose also rebuild worker images. The job checks the production login page and restores the previous images and Compose configuration if the rollout fails. Database volumes persist across releases. Refresh an open browser tab after deployment.

The command above uses Docker Desktop to build images for the same architecture as Lima. Omit `--builder desktop-linux` to build directly in Lima. Set `--health` to the login URL if it differs from `http://localhost:5173/login`. After editing the deployment script, rerun the install command. View deployments with `tail -f "$HOME/Library/Application Support/MatrixDeploy/deploy.log"`.

## Adding connected lessons

Add statistics lessons to the [lesson catalogue](app/src/lib/server/stats-content.ts) and include independently computed answers in the [grading tests](app/src/lib/server/stats.test.ts). The course and Statistics Sparring draw from this catalogue. Completed attempts supply Debrief's review, error patterns and timeline, Garden's growth and weekly readings, and Coach's per-attempt conversation.

The [integration tests](app/src/lib/server/stats-connectivity.test.ts) exercise every published lesson using temporary accounts. Run `pnpm -C app test` before pushing. The production deployment job runs the same suite. After compiling, `pnpm -C app build` starts the built application on loopback and verifies the five HTTP entry points using a disposable account in both languages. See the [agent instructions](CLAUDE.md#publishing-connected-content) for the publishing checklist.

## Verify content

Problem verification uses a connected broker. Offline maintenance checks for the bundled cheatsheet and memo examples also require local scala-cli.

```sh
cd app
node scripts/verify-problems.ts scala
node scripts/verify-cheatsheet.ts scala
node scripts/verify-memo.ts scala
pnpm test && pnpm check
```

## Sources

- The exercises in `app/problems/scala/fp-*` and their memo cards were written from exercises in *Functional Programming in Scala* by Paul Chiusano and Rúnar Bjarnason (Manning). The book text is omitted. The original exercise code is available from [fpinscala/fpinscala](https://github.com/fpinscala/fpinscala) (MIT).
- Training problems and ratings come from the [Codeforces API](https://codeforces.com). The app links to original problem statements.

## License

[MIT](LICENSE)
