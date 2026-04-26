FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production=false
COPY . .
RUN npm run build
RUN npm install -g serve
RUN chown -R node:node /app
USER node
EXPOSE 3101
CMD ["serve", "dist", "-l", "3101", "-s"]
