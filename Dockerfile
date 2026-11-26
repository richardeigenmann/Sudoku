# docker build -t sudoku .
# docker tag sudoku docker.io/richardeigenmann/sudoku:1.4

# Push it to hub.docker.com
# docker login
# docker push docker.io/richardeigenmann/sudoku:1.4

# Run the container locally
# docker run --rm -p 8000:80 sudoku
# docker run --rm -p 8000:80 richardeigenmann/sudoku:1.4

# Multi-stage Docker build
# Stage 1: Build the web assets with Node & pnpm
FROM node:24-alpine AS builder

WORKDIR /app

ENV CI=true
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# Stage 2: Serve with lightweight Nginx
FROM nginx:alpine

WORKDIR /usr/share/nginx/html

# Remove the default nginx welcome page
RUN rm -rf ./*
COPY --from=builder /app/dist .

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
