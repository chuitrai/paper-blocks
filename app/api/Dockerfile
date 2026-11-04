# Thứ tự lớp quyết định tốc độ build: go.mod/go.sum + tải dependency đứng TRƯỚC mã nguồn,
# nên sửa một dòng code không làm mất cache của lớp dependency.
FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/api .
# Thư mục dữ liệu cho SQLite/PDF; distroless không có shell nên tạo ở stage build.
RUN mkdir /out/data

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/api /api
COPY --from=build --chown=65532:65532 /out/data /data
ENV DB_PATH=/data/app.db
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/api"]
