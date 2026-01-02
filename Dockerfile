# docker build -t sudoku .
# docker tag sudoku docker.io/richardeigenmann/sudoku:1.1

# Push it to hub.docker.com
# docker login
# docker push docker.io/richardeigenmann/sudoku:1.1

# Run the container locally
# docker run --rm -p 8000:80 sudoku
# docker run --rm -p 8000:80 richardeigenmann/sudoku:1.1

# Use a stable, lightweight nginx image
FROM nginx:1.23.3-alpine

# Set the working directory inside the container
WORKDIR /usr/share/nginx/html

# Remove the default nginx welcome page
RUN rm index.html

# Copy all the files from your 'src' directory into the image
COPY src/ .

# Expose port 80 for the web server
EXPOSE 80

# Command to run nginx in the foreground
CMD ["nginx", "-g", "daemon off;"]
