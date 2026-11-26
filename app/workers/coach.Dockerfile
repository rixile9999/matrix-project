FROM node:22-bookworm-slim
RUN npm install -g @anthropic-ai/claude-code@2.1.332 @openai/codex@0.172.0 @qwen-code/qwen-code@0.28.4 && npm cache clean --force
COPY coach-entry.ts identity.mjs cli-login.mjs /opt/
RUN mkdir /identity && chown 10001:10001 /identity
WORKDIR /tmp
USER 10001:10001
ENTRYPOINT ["timeout","-k","2","140","node","--experimental-strip-types","/opt/coach-entry.ts"]
