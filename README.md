# Sudoku visualiser

A tool to help you solve Sudoku puzzles yourself.

My method of solving Sudo puzzles involves me writing all possible numbers into the free squares. This way I can identify the squares where only one number is possible and then pick that.

As my partner is better at solving Sudoku puzzles, I wrote this JavaScript app in 2013 to get even.

## Try it out (it's free and doesn't install anything)

https://richardeigenmann.github.io/Sudoku/

Give me a Star if you like it!

## Description

This app draws a Sudoku grid and allows the user to pick the numbers she wants to place in the grid. As each number is picked, the options that are no longer possible in the other fields are removed.

If a number is "forced" because it is the only one that can take that place in the row, colum or grid then it is highlighted.

The steps and puzzle can be saved by clicking the save button. To reload a saved puzzle drag the saved file over the list of steps.

## What it doesn't do

This is not a Sudoku solver. It just shows you the cells that are populated and shows what numbers remain possible in the other cells.

## Additional reading

Wikipedia on Sudoku: http://en.wikipedia.org/wiki/Sudoku 
Scientific American on Sudoku: http://www.cs.virginia.edu/~robins/The_Science_Behind_SudoKu.pdf

## Test server

```bash
python3 -m http.server
```

## Building a Container image

```bash
docker build -t sudoku .
docker tag sudoku docker.io/richardeigenmann/sudoku:1.1

# Push it to hub.docker.com
docker login
docker push docker.io/richardeigenmann/sudoku:1.1

# Run the container locally
docker run --rm -p 8000:80 sudoku
docker run --rm -p 8000:80 richardeigenmann/sudoku:1.1
```

## Deploying to a Kubernetes cluster

Take the `sudoku-pod.yaml`and the `sudoku-service.yaml`files and
modify them to match your environment.

```bash
# To run it on your Kubernetes cluster as a pod:
kubectl apply -f sudoku-pod.yaml
# it will start up, listening on port 80. Check with
kubectl get pods
kubectl describe pod sudoku

# in order to connect to the pod you need to set up a service:
kubectl apply -f sudoku-service.yaml
# This forwards the port :30081 from the Kubernetes hosts to the 
# pod which forwards it to port 80 of the listening nginx server

# To find the IP addresses of the Kubernets nodes run:
kubectl get nodes -o wide
```
