#!/usr/bin/env python3
"""Local operator console. Secrets enter containers on stdin only."""
import argparse
import getpass
import subprocess
from pathlib import Path

app = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("action", choices=["create", "reset", "cli-login"])
parser.add_argument("name")
args = parser.parse_args()
web = subprocess.run(["docker", "compose", "ps", "-q", "--status", "running", "web"],
                     cwd=app, capture_output=True, text=True, check=True).stdout.strip()
if not web:
    parser.error("현재 Docker 컨텍스트에 실행 중인 Matrix 웹 서비스가 없습니다. DOCKER_CONTEXT를 확인하세요.")
if args.action == "cli-login":
    if args.name not in ("claude", "codex", "qwen"):
        parser.error("제공자는 claude, codex, qwen 중 하나입니다.")
    configured = subprocess.check_output(["docker","compose","exec","-T","broker","printenv","MATRIX_CLI_OWNER_ID"],cwd=app,text=True).strip()
    lookup = "const {DatabaseSync}=require('node:sqlite');const u=new DatabaseSync(process.env.MATRIX_DATA+'/auth.db').prepare('SELECT id FROM users WHERE name=?').get('owner');console.log(u?.id ?? '')"
    owner = subprocess.check_output(["docker","compose","exec","-T","web","node","-e",lookup],cwd=app,text=True).strip()
    if not owner or owner != configured:
        parser.error("먼저 owner의 UUID를 MATRIX_CLI_OWNER_ID로 지정하고 브로커를 재시작하세요.")
    volume = "source=matrix-cli-"+args.name+",target=/identity"
    base = ["docker","run","--rm","--pull=never","--read-only","--mount",volume]
    subprocess.run(base+["--network=none","--user","0:0","--entrypoint","chown","matrix-coach:1","10001:10001","/identity"],check=True)
    subprocess.run(base+["-it","--cap-drop=ALL","--security-opt=no-new-privileges","--log-driver=none","--tmpfs","/tmp:rw,exec,nosuid,nodev,size=128m,uid=10001,gid=10001",
                         "-e","HOME=/tmp/home","--entrypoint","node","matrix-coach:1","/opt/cli-login.mjs",args.name],check=True)
    print("CLI 로그인 연결을 저장했습니다.")
    raise SystemExit(0)
else:
    secret = getpass.getpass("새 비밀번호 (12자 이상): ")
    if secret != getpass.getpass("새 비밀번호 확인: "):
        parser.error("비밀번호가 일치하지 않습니다.")
    command = ["docker", "compose", "exec", "-T", "web", "node", "scripts/account.ts", args.action, args.name]
subprocess.run(command, input=secret+"\n", text=True, cwd=app, check=True)
