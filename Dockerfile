# docker build -t richardeigenmann/richinet .
# docker run -it --rm --hostname richinet -v /richi/Src/RichiNet/weblog:/var/log/nginx/web -p8082:80 richardeigenmann/richinet

FROM nginx:1.29.4-alpine-slim
COPY index.html script.js styles.css /usr/share/nginx/html/
