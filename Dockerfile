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
