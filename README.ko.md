# Matrix Project

[English](README.md) · **한국어**

혼자 쓰려고 만든 훈련 플랫폼입니다. 알고리즘, Scala, 함수형 프로그래밍과 확률·통계를 다룹니다. 체스는 계획 단계입니다.
첫 방문은 영어로 시작합니다. 로그인 화면과 앱 메뉴에서 **한국어**를 누르면 그 브라우저가 선택을 기억합니다. **English**를 눌러 다시 전환할 수 있습니다.
개념을 먼저 읽고 문제를 푸는 대신, 짧은 제한 시간 안에 문제부터 풀고 그 과정에서 개념이 잡히게 하는 방식입니다.
설계 의도는 [`notes/idea.md`](notes/idea.md), 콘텐츠와 기능을 만들 때 따르는 원칙은 [`CLAUDE.md`](CLAUDE.md)에 있습니다.

## 들어 있는 것

| 화면 | 내용 |
|---|---|
| 훈련 | Codeforces 문제를 내 레이팅에 맞춰 세 가지 모드(스피드·표준·깊이)로 추천하고, 제출 결과를 가져와 레이팅을 다시 계산합니다. |
| 언어 | 브라우저 편집기에서 푸는 Scala 3 문제 150개. 기본·응용·복합, 책 문제, "컴파일러 변환" 묶음. 로컬 채점기가 실제로 컴파일하고 실행합니다. |
| 치트시트 | 문제를 풀면서 여는 문법 예제 116개. 예제의 결과 값은 실행으로 확인한 것입니다. |
| 암기 | 휴대폰용 복습 카드 208장과 문제 점검 100개. 간격 반복(FSRS)으로 다음 복습 시점을 정합니다. |
| PDF 문제집 (시범) | **PDF 문제집**에서 8 MiB 이하 텍스트 PDF를 올리면, 계정에 연결한 AI 제공자가 앞 10쪽의 텍스트를 바탕으로 한영 객관식 문제 3~5개를 만듭니다. 문제집과 풀이 기록은 내 계정에 저장됩니다. |
| 확률·통계 | 확률과 추론을 중심으로 분류기와 다중검정에 적용하는 연습 10개. 시간 제한, 단계별 힌트, 공식 참고와 해설을 제공합니다. |
| 스파링·복기·정원 | 짧은 코딩과 회상 훈련, 풀이 기록 검토, 학습 변화 시각화. |
| Operator | 문제를 마친 뒤 질문하는 창. Claude Code, Codex, Qwen Code CLI를 도구 없이 호출합니다. 타이머가 도는 동안은 잠깁니다. |

## 실행과 계정 관리

Node.js 26, pnpm, Docker Compose가 필요합니다. 운영은 사설망 HTTPS 또는 로컬호스트를 기준으로 합니다. macOS에서는 호스트 디렉터리를 공유하지 않는 전용 Linux VM을 사용할 수 있습니다. 아래 명령은 Lima의 rootless Docker 템플릿 기준입니다. 이미 구성한 VM에서는 시작과 컨텍스트 선택만 필요합니다.

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

기본 접속 주소는 `http://localhost:5173`입니다. Tailscale Serve 같은 사설 HTTPS 프록시를 쓰면 Compose 실행 시 `MATRIX_ORIGIN`을 실제 HTTPS 주소로 지정합니다. Compose는 웹 포트를 루프백에 바인딩합니다. 재실행할 때도 같은 Docker 컨텍스트와 환경 설정을 사용하세요.

웹 이미지에는 PDF 텍스트 추출용 Poppler가 포함되어 있습니다. Docker 밖에서 전체 테스트나 PDF 기능을 실행하려면 Poppler(`pdftotext`, `pdfinfo`)를 설치하고 Node 어댑터를 `BODY_SIZE_LIMIT=9M`으로 실행하세요.

### Tailscale 없이 접속하기

이 Mac에서만 쓸 때는 기본 구성의 `http://localhost:5173/signup`에서 가입합니다. 같은 Wi-Fi나 사내망에 제공할 때는 Mac에서 Caddy를 실행해 LAN IP의 HTTPS 요청을 VM의 루프백 포트로 전달합니다. HTTPS 접속 주소와 브라우저 주소가 같아야 폼 제출과 로그인 쿠키가 동작합니다.

1. Compose 환경에서 `MATRIX_PORT=5183`, `MATRIX_ORIGIN=`(빈 값), `MATRIX_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,https://<LAN-IP>:8443`을 설정하고 웹 서비스를 다시 띄웁니다. 여러 주소를 쓰는 구성에서는 로컬 프록시가 요청마다 원래 프로토콜과 호스트를 설정합니다.
2. Mac 호스트에서 `MATRIX_LAN_IP=<LAN-IP> caddy run --config app/Caddyfile.lan --adapter caddyfile`로 프록시를 실행합니다. Mac에서는 `http://localhost:5173`, 같은 네트워크의 기기에서는 `https://<LAN-IP>:8443/signup`으로 접속합니다.
3. LAN HTTPS는 Caddy의 내부 인증서를 사용합니다. 다른 기기의 신뢰 저장소에는 Caddy 데이터 디렉터리의 `pki/authorities/local/root.crt` 공개 인증서를 설치합니다. 외부 인터넷에서 운영하려면 소유한 도메인의 DNS·인바운드 라우팅·공인 HTTPS 인증서를 구성하고 그 HTTPS 주소를 허용 목록에 추가합니다.

- **계정**은 로그인 화면의 회원가입에서 직접 만들 수 있습니다. 관리자는 `python3 scripts/admin.py create 아이디`로 만듭니다. `reset 아이디`는 비밀번호를 바꾸고 해당 계정의 로그인 세션을 폐기합니다. 비밀번호는 숨김 입력으로 받습니다.
- **기존 기록 이전**은 빈 계정 저장소에 최초 소유자를 만들 때 수행합니다. 이전 서비스 쓰기를 중지하고 SQLite 백업 API로 기존 DB의 일관된 사본을 만드세요. 이 파일을 웹 컨테이너의 쓰기 가능한 계정 볼륨에 복사하고 웹 서비스 사용자에게 읽기 권한을 준 뒤, 비밀번호를 표준 입력으로 보내 `docker compose exec -T web node scripts/account.ts create owner /app/data/accounts/import.db`를 실행합니다. 명령은 무결성을 확인한 별도 백업과 사용자 사본을 만들고 원래 DB를 보존합니다.
- **학습 데이터**는 VM의 `matrix_accounts` 볼륨에 있습니다. `auth.db`는 인증, `users/<UUID>/trainer.db`는 개인 기록, `catalog.db`는 공용 Codeforces 문제 목록입니다. 백업할 때는 서비스를 멈추고 전체 볼륨을 보관하거나 각 SQLite DB를 백업 API로 복사하세요.
- **코치 연결**은 로그인 후 ‘코치 설정’에서 관리합니다. 각 계정이 제공자별 API 키를 등록·교체·삭제할 수 있습니다. 키는 계정 UUID별로 워커 전용 볼륨에 저장되며 웹 응답에 반환하지 않습니다. Qwen 키는 DashScope 국제 엔드포인트용입니다. 공용 제공자 키는 사용하지 않습니다.
- **소유자의 CLI 로그인**은 브로커의 `MATRIX_CLI_OWNER_ID`를 기존 관리 계정 `owner`의 UUID로 지정한 뒤 사용합니다. VM Docker 컨텍스트를 선택하고 저장소 루트에서 `python3 app/scripts/admin.py cli-login codex`를 실행합니다. Claude와 Qwen은 마지막 인자를 각각 `claude`, `qwen`으로 바꿉니다. 제공자 인증을 완료하고 Qwen의 대화형 UI는 정상 종료합니다. 작업마다 소유자의 해당 제공자 로그인 파일만 복원하고 갱신된 인증을 보관합니다. 소유자에게 CLI와 API 키가 모두 있으면 CLI를 우선 사용합니다.
- **격리 실행**에서 웹 앱은 전용 Unix 소켓으로 작업을 요청합니다. 브로커만 VM의 Docker 소켓을 사용합니다. 각 작업은 비특권 사용자·읽기 전용 루트·제한된 임시 공간·CPU/메모리/PID/실행 시간/출력 제한을 적용한 새 컨테이너에서 끝납니다. Scala는 컴파일 단계부터 오프라인입니다. 코치는 네트워크가 꺼진 상태에서 제공자 전용 Unix 소켓을 통해 허용된 HTTPS 호스트에만 연결합니다. Operator, 정원 주간 해석과 Scala trace 검증이 같은 경계를 사용합니다.
- **개발**은 `app/`에서 `MATRIX_DATA`로 개발 전용 계정 디렉터리를 정하고 `node scripts/account.ts create 이름`에 비밀번호를 표준 입력으로 보내 계정을 만듭니다. `pnpm dev`에서 채점과 코칭까지 사용하려면 `MATRIX_WORKER_SOCKET`에 브로커 소켓을 연결합니다. 운영과 같은 경계를 확인하려면 Compose에서 실행하세요.

### macOS 운영 자동 배포

`lima-matrix-workers`에서 `matrix` Compose 서비스가 가동 중인 Mac의 저장소 루트에서 아래 명령을 실행하면 사용자 LaunchAgent가 설치됩니다. 해당 계정에서 비밀번호 입력 없이 `origin`을 읽을 수 있어야 합니다. 운영 환경 설정은 `app/.env`에서 읽습니다.

```sh
python3 ops/auto-deploy.py --install --builder desktop-linux
```

사용자가 Mac에 로그인해 있는 동안 1분마다 GitHub `main`을 확인합니다. 새 커밋을 별도 작업 디렉터리에서 타입 검사·테스트·빌드하고, 격리된 후보 이미지에서 로그인 화면이 열리는지 확인한 뒤 웹 컨테이너를 교체합니다. 워커 소스나 Compose 정의가 바뀌면 워커 이미지도 빌드합니다. 배포 후 운영 로그인 페이지를 확인하며, 교체에 실패하면 직전 이미지와 Compose 설정을 복구합니다. 계정과 학습 기록은 기존 볼륨을 계속 사용합니다. 이미 열어 둔 브라우저 탭은 배포 후 새로고침하면 됩니다.

위 명령은 Lima와 같은 아키텍처의 Docker Desktop에서 이미지를 빌드합니다. Lima에서 직접 빌드하려면 `--builder desktop-linux`를 생략하세요. 로그인 주소가 `http://localhost:5173/login`과 다르면 `--health`로 지정합니다. 배포 스크립트를 수정하면 설치 명령을 다시 실행하세요. 배포 로그는 `tail -f "$HOME/Library/Application Support/MatrixDeploy/deploy.log"`로 확인할 수 있습니다.

## 연결된 수업 추가하기

확률·통계 수업은 [수업 목록](app/src/lib/server/stats-content.ts)에 추가하고, 독립적으로 계산한 답을 [채점 테스트](app/src/lib/server/stats.test.ts)에 넣습니다. 일반 연습과 통계 스파링은 이 목록에서 출제합니다. 종료된 시도는 복기의 세션·오답 패턴·시간대 기록, 정원의 성장·주간 해석, 시도별 코치 대화에 연결됩니다.

[연결 테스트](app/src/lib/server/stats-connectivity.test.ts)는 임시 계정으로 등록된 수업 전체를 검사합니다. 푸시 전에 `pnpm -C app test`를 실행하세요. 운영 자동 배포도 같은 테스트를 실행합니다. `pnpm -C app build`는 빌드 후 앱을 루프백에서 띄우고 임시 계정으로 다섯 화면과 API를 한영 양쪽에서 검사합니다. 개발 시 확인할 항목은 [에이전트 지침](CLAUDE.md#publishing-connected-content)에 있습니다.

## 콘텐츠 검증

콘텐츠 검증 스크립트에서 문제 채점은 연결된 브로커를 사용합니다. 저장소에 포함된 치트시트·암기 예제의 오프라인 유지보수 검증에는 로컬 scala-cli도 필요합니다.

```sh
cd app
node scripts/verify-problems.ts scala
node scripts/verify-cheatsheet.ts scala
node scripts/verify-memo.ts scala
pnpm test && pnpm check
```

## 출처

- `app/problems/scala/fp-*` 문제와 관련 암기 카드는 Paul Chiusano, Rúnar Bjarnason의 책 *Functional Programming in Scala* (Manning)의 연습문제를 바탕으로 새로 쓴 것입니다. 책 본문은 포함하지 않습니다. 연습문제 코드의 원 저장소는 [fpinscala/fpinscala](https://github.com/fpinscala/fpinscala) (MIT)입니다.
- 훈련 화면의 문제와 레이팅은 [Codeforces](https://codeforces.com) API에서 가져옵니다. 문제 본문은 저장하지 않고 링크만 겁니다.

## 라이선스

[MIT](LICENSE)
