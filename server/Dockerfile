# ── Build stage ──────────────────────────────────────────────────
FROM golang:1.26-alpine AS builder

ENV GOPROXY=https://goproxy.cn,direct

RUN apk add --no-cache git ca-certificates

WORKDIR /build

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /server ./cmd/server/

# ── Runtime stage ───────────────────────────────────────────────
FROM alpine:3.21

RUN apk add --no-cache ca-certificates tzdata
ENV TZ=Asia/Shanghai

WORKDIR /app
COPY --from=builder /server .

EXPOSE 4007
CMD ["./server"]
