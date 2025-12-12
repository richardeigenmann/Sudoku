# docker build -t sudoku .
# docker tag sudoku docker.io/richardeigenmann/sudoku:1.1

# Push it to hub.docker.com
# docker login
# docker push docker.io/richardeigenmann/sudoku:1.1

# Run the container locally
# docker run --rm -p 8000:80 sudoku
# docker run --rm -p 8000:80 richardeigenmann/sudoku:1.1

FROM nginx:1.29.4-alpine-slim
COPY index.html script.js styles.css /usr/share/nginx/html/
