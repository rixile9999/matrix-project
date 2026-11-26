set -eu
mkdir /tmp/job /tmp/home
cd /tmp/job
while IFS=' ' read -r name content; do
	case "$name" in User.scala|Tests.scala|Judge.scala|Given.scala|Cheat.scala|T.scala|Main.scala) ;; *) exit 64 ;; esac
	printf '%s' "$content" | base64 -d > "$name"
done
exec timeout -k 2 89 java -jar /opt/scala-cli.jar --power run . --offline --server=false --jvm system -S 3.10.1 -q
