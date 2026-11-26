FROM eclipse-temurin:21-jdk
ARG CLI_VERSION=1.19.0
ENV COURSIER_REPOSITORIES=https://repo.maven.apache.org/maven2 COURSIER_CACHE=/opt/coursier
RUN curl -fsSL --retry 3 "https://repo.maven.apache.org/maven2/org/virtuslab/scala-cli/cliBootstrapped/${CLI_VERSION}/cliBootstrapped-${CLI_VERSION}.jar" -o /opt/scala-cli.jar && \
    mkdir -p /tmp/warm && echo '@main def warm() = println(1)' > /tmp/warm/Warm.scala && \
    java -jar /opt/scala-cli.jar run --server=false --jvm system -S 3.10.1 /tmp/warm && rm -rf /tmp/warm && chmod -R a+rX /opt/coursier
COPY scala-entry.sh /opt/scala-entry.sh
USER 10001:10001
WORKDIR /tmp
ENTRYPOINT ["/bin/sh", "/opt/scala-entry.sh"]
