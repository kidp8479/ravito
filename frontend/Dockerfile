FROM docker.io/library/node:24-alpine AS dev
WORKDIR /app
# Same reasoning as backend/Dockerfile: run as "node" (UID 1000, matches
# most host users) instead of root, so anything written into the
# bind-mounted source stays owned by the host user.
RUN chown node:node /app
USER node
COPY --chown=node:node package*.json ./
RUN npm ci
COPY --chown=node:node . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]

FROM dev AS build
RUN npm run build

FROM docker.io/library/nginx:alpine AS prod
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
