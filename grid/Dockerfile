FROM golang:1.21-alpine
WORKDIR /app
COPY . .
RUN go build -o grid-service cmd/grid/main.go
CMD ["./grid-service"]
