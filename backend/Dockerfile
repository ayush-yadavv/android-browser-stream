FROM golang:1.22-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /app/server cmd/server/main.go

FROM alpine:3.20

RUN apk add --no-cache ca-certificates android-tools

WORKDIR /app

COPY --from=builder /app/server /app/server
COPY bin /app/bin

EXPOSE 8080

CMD ["/app/server"]
