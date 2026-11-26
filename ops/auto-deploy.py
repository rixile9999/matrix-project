"""Install or run the Matrix macOS production deployment job."""
import argparse
import fcntl
import json
import os
import plistlib
import shutil
import subprocess
import tempfile
import time
from datetime import datetime
from pathlib import Path

LABEL = 'com.matrix-project.deploy'
STATE = Path.home() / 'Library' / 'Application Support' / 'MatrixDeploy'
SOURCE = STATE / 'source'
APP = SOURCE / 'app'
PENDING = STATE / 'rollback.json'
LOG = STATE / 'deploy.log'
DOCKER = ['docker', '--context', 'lima-matrix-workers']


def run(*args, capture=False, cwd=None):
    result = subprocess.run(args, cwd=cwd, check=True, text=True,
                            stdout=subprocess.PIPE if capture else None)
    return result.stdout.strip() if capture else None


def compose(config, *args, capture=False):
    return run(*DOCKER, 'compose', '--env-file', os.environ['MATRIX_DEPLOY_ENV'],
               '--project-directory', str(APP), '-p', 'matrix', '-f', str(config),
               *args, capture=capture)


def health():
    for _ in range(15):
        probe = subprocess.run(['curl', '-s', '--max-time', '4', '-o', '/dev/null',
                                '-w', '%{http_code}', os.environ['MATRIX_DEPLOY_HEALTH']],
                               capture_output=True, text=True)
        if probe.returncode == 0 and probe.stdout == '200':
            return
        time.sleep(1)
    raise RuntimeError('Production login did not return HTTP 200')


def restore(previous):
    print('Restoring the previous release', flush=True)
    for name in previous:
        run(*DOCKER, 'tag', f'matrix-{name}:previous', f'matrix-{name}:1')
    compose(STATE / 'previous.yaml', 'up', '-d', '--no-build')
    health()
    PENDING.unlink()


def deploy():
    if PENDING.exists():
        restore(json.loads(PENDING.read_text()))
    if not SOURCE.exists():
        with tempfile.TemporaryDirectory(dir=STATE) as scratch:
            clone = Path(scratch) / 'source'
            run('git', 'clone', '--no-checkout', '--single-branch', '--branch', 'main',
                os.environ['MATRIX_DEPLOY_REMOTE'], clone)
            clone.rename(SOURCE)
    run('git', 'fetch', '--quiet', 'origin', 'main', cwd=SOURCE)
    target = run('git', 'rev-parse', 'FETCH_HEAD', cwd=SOURCE, capture=True)
    current = run(*DOCKER, 'inspect', '-f',
                  '{{index .Config.Labels "org.opencontainers.image.revision"}}',
                  'matrix-web-1', capture=True)
    if current == target:
        return
    print(datetime.now().isoformat(), 'Deploying', target, flush=True)
    run('git', 'checkout', '--quiet', '--detach', '--force', target, cwd=SOURCE)
    run('pnpm', 'install', '--frozen-lockfile', cwd=APP)
    for task in ('check', 'test', 'build'):
        run('pnpm', task, cwd=APP)

    config = APP / 'compose.yaml'
    compose(config, 'config', '--quiet')
    names = ['web']
    # The worker Dockerfiles can copy shared modules from the same build context.
    workers = ['app/workers', ':(exclude)app/workers/web.Dockerfile', 'app/compose.yaml']
    known = bool(current) and subprocess.run(
        ['git', 'cat-file', '-e', current + '^{commit}'], cwd=SOURCE,
        stderr=subprocess.DEVNULL).returncode == 0
    if not known or run('git', 'diff', '--name-only', current, target, '--', *workers,
                        cwd=SOURCE, capture=True):
        names += ['scala', 'coach', 'egress', 'broker']

    builder = os.environ['MATRIX_DEPLOY_BUILDER']
    for name in names:
        image = f'matrix-{name}:candidate'
        run('docker', '--context', builder, 'build', '--label',
            'org.opencontainers.image.revision=' + target, '--label', 'com.matrix-project.autodeploy=1', '-t', image, '-f',
            APP / 'workers' / (name + '.Dockerfile'), APP if name == 'web' else APP / 'workers')
        if builder != 'lima-matrix-workers':
            with subprocess.Popen(['docker', '--context', builder, 'save', image],
                                  stdout=subprocess.PIPE) as save:
                try:
                    subprocess.run([*DOCKER, 'load'], stdin=save.stdout, check=True)
                finally:
                    save.stdout.close()
                if save.wait():
                    raise RuntimeError('Could not transfer ' + image)

    # Exercise the runtime user and bundled application without production mounts.
    run(*DOCKER, 'run', '--rm', '--read-only', '--network', 'none', '--tmpfs', '/tmp',
        '-e', 'MATRIX_DATA=/tmp/accounts', '-e', 'ORIGIN=http://127.0.0.1:3000',
        'matrix-web:candidate', 'node', '--input-type=module', '-e', '''
            await import('./src/lib/server/auth.ts');
            await import('./build/index.js');
            const response = await fetch('http://127.0.0.1:3000/login', {
                signal: AbortSignal.timeout(10000)
            });
            process.exit(response.status === 200 ? 0 : 1);
        ''')

    # Capture the last deployed Compose definition and image tags before switching any service.
    old_config = STATE / 'previous.yaml'
    if known:
        old_config.write_text(run('git', 'show', current + ':app/compose.yaml',
                                  cwd=SOURCE, capture=True) + '\n')
    else:
        shutil.copyfile(Path(os.environ['MATRIX_DEPLOY_ENV']).with_name('compose.yaml'), old_config)
    for name in names:
        run(*DOCKER, 'tag', f'matrix-{name}:1', f'matrix-{name}:previous')
    journal = PENDING.with_suffix('.tmp')
    journal.write_text(json.dumps(names))
    journal.replace(PENDING)
    try:
        for name in names:
            run(*DOCKER, 'tag', f'matrix-{name}:candidate', f'matrix-{name}:1')
        compose(config, 'up', '-d', '--no-build')
        services = compose(config, 'ps', '--status', 'running', '--services', capture=True).splitlines()
        required = compose(config, 'config', '--services', capture=True).splitlines()
        if not set(required).issubset(services):
            raise RuntimeError('A Compose service did not start')
        health()
        if run(*DOCKER, 'inspect', '-f', '{{index .Config.Labels "org.opencontainers.image.revision"}}',
               'matrix-web-1', capture=True) != target:
            raise RuntimeError('The running web revision differs from the release')
    except Exception:
        restore(names)
        raise
    PENDING.unlink()
    print(datetime.now().isoformat(), 'Deployed', target, flush=True)
    for context in sorted({builder, 'lima-matrix-workers'}):
        run('docker', '--context', context, 'image', 'prune', '--force',
            '--filter', 'label=com.matrix-project.autodeploy=1')


def install(args):
    repo = Path(__file__).resolve().parents[1]
    env_file = (repo / 'app/.env').resolve(strict=True)
    remote = run('git', 'remote', 'get-url', 'origin', cwd=repo, capture=True)
    installed = STATE / 'auto-deploy.py'
    shutil.copyfile(__file__, installed.with_suffix('.new'))
    installed.with_suffix('.new').replace(installed)
    agent = Path.home() / 'Library/LaunchAgents' / (LABEL + '.plist')
    agent.parent.mkdir(exist_ok=True)
    settings = {
        'Label': LABEL, 'ProgramArguments': ['/usr/bin/python3', str(installed)],
        'RunAtLoad': True, 'StartInterval': 60,
        'StandardOutPath': str(LOG), 'StandardErrorPath': str(LOG),
        'EnvironmentVariables': {
            'PATH': '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
            'MATRIX_DEPLOY_REMOTE': remote, 'MATRIX_DEPLOY_ENV': str(env_file),
            'MATRIX_DEPLOY_BUILDER': args.builder, 'MATRIX_DEPLOY_HEALTH': args.health,
            'GIT_TERMINAL_PROMPT': '0', 'GIT_SSH_COMMAND': 'ssh -o BatchMode=yes -o ConnectTimeout=10',
            'CI': 'true', 'PYTHONUNBUFFERED': '1',
        },
    }
    domain = 'gui/' + str(os.getuid())
    if subprocess.run(['launchctl', 'print', domain + '/' + LABEL], capture_output=True).returncode == 0:
        run('launchctl', 'bootout', domain + '/' + LABEL)
    agent.write_bytes(plistlib.dumps(settings))
    run('launchctl', 'bootstrap', domain, agent)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--install', action='store_true')
    parser.add_argument('--builder', default='lima-matrix-workers')
    parser.add_argument('--health', default='http://localhost:5173/login')
    args = parser.parse_args()
    os.umask(0o077)
    STATE.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (STATE / 'lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if args.install:
            install(args)
        else:
            # STATE is private. Build inputs inside it must remain readable by the image's node user.
            os.umask(0o022)
            deploy()
