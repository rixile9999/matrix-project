#!/usr/bin/env python3
"""Local operator console. Secrets enter containers on stdin only."""
import argparse
import getpass
import subprocess
from pathlib import Path

app = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("action", choices=["create", "reset", "provider"])
parser.add_argument("name")
args = parser.parse_args()
web = subprocess.run(["docker", "compose", "ps", "-q", "--status", "running", "web"],
                     cwd=app, capture_output=True, text=True, check=True).stdout.strip()
if not web:
    parser.error("현재 Docker 컨텍스트에 실행 중인 Matrix 웹 서비스가 없습니다. DOCKER_CONTEXT를 확인하세요.")
if args.action == "provider":
    if args.name not in ("claude", "codex", "qwen"):
        parser.error("provider must be claude, codex or qwen")
    secret = getpass.getpass("전용 제공자 API 키: ")
    if not secret.strip():
        parser.error("빈 키입니다.")
    command = ["docker", "run", "--rm", "-i", "--pull=never", "--network=none", "--read-only",
               "--mount", "source=matrix_credentials,target=/secrets", "--entrypoint", "sh",
               "--user", "0:0", "matrix-egress:1", "-ec",
               'umask 077; f=$(mktemp /secrets/.new.XXXXXX); cat > "$f"; mv "$f" "/secrets/$1"', "sh", args.name]
else:
    secret = getpass.getpass("새 비밀번호 (12자 이상): ")
    if secret != getpass.getpass("새 비밀번호 확인: "):
        parser.error("비밀번호가 일치하지 않습니다.")
    command = ["docker", "compose", "exec", "-T", "web", "node", "scripts/account.ts", args.action, args.name]
subprocess.run(command, input=secret+"\n", text=True, cwd=app, check=True)
