FROM golang:alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /app/server cmd/server/main.go

FROM alpine:latest

RUN apk add --no-cache ca-certificates android-tools ffmpeg wget

WORKDIR /app

RUN mkdir -p /app/bin /app/data

# Ensure scrcpy-server v2.7 is present inside the container image
RUN wget -q "https://github.com/Genymobile/scrcpy/releases/download/v2.7/scrcpy-server-v2.7" -O /app/bin/scrcpy-server \
    && chmod +x /app/bin/scrcpy-server

COPY --from=builder /app/server /app/server

EXPOSE 8080

CMD ["/app/server"]
