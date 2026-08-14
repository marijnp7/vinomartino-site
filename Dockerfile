# LAT-5526 — waarom hier GEEN `RUN npm test` staat.
#
# LAT-4810 vroeg om `npm test` vóór élke bouwroute naar vinomartino.com.
# Dit image is er geen. Gemeten op 2026-08-13:
#
#   • Productie is `docker-compose.vinomartino-prod.yml`: `image: nginx:alpine`
#     met een bind-mount van `./dist`. De traefik-labels met
#     `Host(`vinomartino.com`)` zitten uitsluitend op díe service. De dist
#     erin komt van deploy.yml/publish.yml (rsync), niet uit dit image.
#     Bevestigd live: https://vinomartino.com/build-info.json gaf
#     sha 8647544 / runId 31656908331 — een deploy-run, geen container-image.
#   • De enige consumenten van deze Dockerfile zijn
#     `docker-compose.site.yml` (image `paperclip-site:latest`, publiceert op
#     `127.0.0.1:3101`, géén traefik-labels) en `docker-compose.site-preview.yml`.
#     Beide staan in de `paths-ignore` van deploy.yml — ze zijn expliciet geen
#     build-input voor de site-pipeline.
#   • Geen enkele workflow bouwt dit bestand.
#
# Daarnaast zou `RUN npm test` hier nu hard falen: `test:i18n-gate` draait
# `python3 scripts/lat2582-gate-check.test.py` en deze basis (`node:24-alpine`)
# heeft geen python3. Een suite half draaien is erger dan hem niet draaien —
# dat is precies de "guard die niets afdwingt" uit LAT-4810.
#
# Dit besluit is falsifieerbaar vastgelegd, niet alleen opgeschreven:
# `scripts/lat5526-prod-build-gates.test.mjs` gaat ROOD zodra een compose-file
# die vinomartino.com routeert uit een Dockerfile gaat bouwen. Wordt dit image
# ooit wél een weg naar productie, dan valt die assertie om en moet hier een
# echte testpoort in (inclusief `apk add python3` voor de i18n-gate).
FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production=false
COPY . .
ARG BRAND
ARG DIRECTUS_URL
ARG DIRECTUS_TOKEN
ARG CF_ACCESS_CLIENT_ID
ARG CF_ACCESS_CLIENT_SECRET
ENV BRAND=${BRAND} DIRECTUS_URL=${DIRECTUS_URL} DIRECTUS_TOKEN=${DIRECTUS_TOKEN} CF_ACCESS_CLIENT_ID=${CF_ACCESS_CLIENT_ID} CF_ACCESS_CLIENT_SECRET=${CF_ACCESS_CLIENT_SECRET}
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
RUN printf 'server {\n  listen 3101;\n  root /usr/share/nginx/html;\n  index index.html;\n  location / {\n    try_files $uri $uri/ /index.html;\n  }\n}\n' > /etc/nginx/conf.d/default.conf
EXPOSE 3101
CMD ["nginx", "-g", "daemon off;"]
