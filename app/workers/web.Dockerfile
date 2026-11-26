FROM node:26-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends poppler-data poppler-utils util-linux && rm -rf /var/lib/apt/lists/*
ENV BODY_SIZE_LIMIT=9M
# adapter-node can leave server dependencies external. Include production dependencies only.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install -g pnpm@12.18.0 && pnpm install --prod --ignore-scripts --frozen-lockfile
COPY build ./build
COPY problems ./problems
COPY cheatsheet ./cheatsheet
COPY memo ./memo
COPY debrief ./debrief
COPY scripts/account.ts ./scripts/account.ts
COPY src/lib/locale.ts ./src/lib/locale.ts
COPY src/lib/server/auth.ts src/lib/server/locale.ts ./src/lib/server/
RUN mkdir -p /app/data/accounts && chown node:node /app/data/accounts && chmod 700 /app/data/accounts
USER node
CMD ["node","build"]
